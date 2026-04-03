import { Memory, ObservationType } from "./memory.ts";
import { Brain, type ToolCall } from "./brain.ts";
import { getModelPricing, calculateCost, formatCost } from "./pricing.ts";
import { Compactor } from "./compactor.ts";
import { loadPersona } from "./persona.ts";
import type { Config, Message, Skill, Tool } from "./types.ts";

interface CompactionCooldown {
  lastCompactionTime: number;
}

export class Agent {
  private brain: Brain;
  private memory: Memory;
  private config: Config;
  private skills: Map<string, Skill> = new Map();
  private sessionId: string = "default";
  private toolCallCounter: number = 0;
  private compactor: Compactor | null = null;
  // Track last compaction time PER SESSION
  private compactionCooldowns: Map<string, CompactionCooldown> = new Map();
  private readonly COMPACTION_COOLDOWN_MS = 10 * 60 * 1000;

  constructor(config: Config) {
    this.config = config;
    this.brain = new Brain(config.agent.model, config.providers);
    this.memory = new Memory(config.memory.path, config.memory.max_context_messages);

    if (config.compaction?.enabled) {
      this.compactor = new Compactor(config);
    }
  }

  getProviderConfig(model: string): { baseUrl?: string; apiKey?: string } {
    const [provider] = model.split(":");
    const prov = this.config.providers[provider];
    const apiKey = prov?.apiKeyEnv ? process.env[prov.apiKeyEnv] : undefined;
    return { baseUrl: prov?.baseUrl, apiKey };
  }

  registerSkill(skill: Skill): void {
    this.skills.set(skill.name, skill);
  }

  setSession(sessionId: string): void {
    this.sessionId = sessionId;
  }

  private buildSystemPrompt(): string {
    const facts = this.memory.getAllFacts();
    const factStr = Object.entries(facts).map(([k, v]) => `- ${k}: ${v}`).join("\n");
    const contextIndex = this.memory.generateContextIndex(10);
    const sessionSummaries = this.memory.getRecentSessionSummaries(3);
    const summaryStr = sessionSummaries
      .filter(s => s.learned || s.user_goal || s.next_steps)
      .map(s => {
        let parts = [`[${s.session_id}]`];
        if (s.user_goal) parts.push(`Goal: ${s.user_goal}`);
        if (s.completed) parts.push(`Done: ${s.completed}`);
        if (s.learned) parts.push(`Learned: ${s.learned}`);
        if (s.next_steps) parts.push(`Next: ${s.next_steps}`);
        return parts.join(" | ");
      })
      .join("\n");

    const persona = loadPersona(this.config.agent?.persona || "default");
    let personaSection = "";
    let identityName = this.config.agent.name;
    if (persona) {
      identityName = persona.name;
      personaSection = `

## Your Personality

**Name:** ${persona.name}
**Tone:** ${persona.tone}
**Traits:** ${persona.traits.join(", ")}

**Response Style:** ${persona.response_style}

**You commonly say things like:**
${persona.example_phrases.map(p => `- "${p}"`).join("\n")}

**Never:**
${persona.forbidden.map(f => `- ${f}`).join("\n")}
${persona.system_hint ? `\n**Guidance:** ${persona.system_hint}` : ""}
`;
    } else {
      personaSection = `\nYou are ${this.config.agent.name}. ${this.config.agent.personality || "Helpful, concise AI assistant."}`;
    }

    const skillGroups: Record<string, string[]> = {};
    for (const skill of this.skills.values()) {
      const category = skill.category || "Other";
      if (!skillGroups[category]) skillGroups[category] = [];
      skillGroups[category].push(skill.name);
    }
    const categories = Object.entries(skillGroups).map(([cat, names]) => `${cat}: ${names.join(", ")}`).join("\n");

    return `You are ${identityName}.${personaSection}

Known facts about the user:
${factStr || "No specific facts known yet."}

## Recent Session Summaries (Cross-Session Context)
${summaryStr || "No previous session summaries yet."}

## Recent Observations (Cross-Session Memory)
${contextIndex}

## Available Tools (${this.skills.size} total)
${categories}

When you receive tool results:
1. ONLY report facts that are EXPLICITLY stated in the results
2. If results are empty/insufficient, say "No information available"
3. NEVER invent or assume details not in the results
4. NEVER make up specs, numbers, or facts

Example - WRONG: Tool returns "Found 5 results" → You say "The item has 12 cores and 5nm process"
Example - CORRECT: Tool returns "Found 5 results" → You say "Search found 5 results. No detailed specs in the data."

When you need to use a tool, the system will handle the tool call automatically. Respond naturally.`;
  }

  private getTools(): Tool[] {
    return Array.from(this.skills.values()).map((skill) => ({
      type: "function" as const,
      function: {
        name: skill.name,
        description: skill.description,
        parameters: skill.parameters || {
          type: "object",
          properties: {
            action: { type: "string", description: "Action to perform" },
            args: { type: "string", description: "Additional arguments" },
            url: { type: "string", description: "URL input for web requests" },
          },
          required: [],
        },
      },
    }));
  }

  async process(input: string): Promise<string> {
    this.memory.startSession(this.sessionId);
    this.memory.addUserPrompt(this.sessionId, input);
    this.memory.addMessage(this.sessionId, "user", input);

    const messages = this.memory.getMessages(this.sessionId);
    const systemPrompt = this.buildSystemPrompt();
    const tools = this.getTools();

    let result = await this.brain.think(messages, systemPrompt, tools.length > 0 ? tools : undefined);

    let iterations = 0;
    const maxIterations = 3;
    const toolResults: Array<{ toolCallId: string; name: string; result: string }> = [];

    while (result.toolCalls.length > 0 && iterations < maxIterations) {
      iterations++;
      for (const tc of result.toolCalls) {
        const skill = this.skills.get(tc.name);
        if (skill) {
          try {
            const toolResult = await skill.execute(tc.arguments);
            toolResults.push({ toolCallId: tc.id, name: tc.name, result: toolResult });
            this.memory.addMessage(this.sessionId, "system", `[Tool: ${tc.name}] ${toolResult}`);
          } catch (err) {
            const errorMsg = `Error executing ${tc.name}: ${err}`;
            toolResults.push({ toolCallId: tc.id, name: tc.name, result: errorMsg });
            this.memory.addMessage(this.sessionId, "system", errorMsg);
          }
        } else {
          const errorMsg = `Unknown tool: ${tc.name}`;
          toolResults.push({ toolCallId: tc.id, name: tc.name, result: errorMsg });
        }
      }
      const updatedMessages = this.memory.getMessages(this.sessionId);
      result = await this.brain.thinkWithToolResults(
        updatedMessages, systemPrompt, toolResults.splice(0), tools.length > 0 ? tools : undefined
      );
    }

    let finalContent = this.brain.stripToolCalls(result.content);

    // ── POST-PROCESS: Compaction (after message count is at peak) ──
    await this.runPostCompactionCheck(this.sessionId);

    if (result.usage) {
      this.memory.addUsage(this.sessionId, result.usage.promptTokens, result.usage.completionTokens, result.usage.totalTokens, this.config.agent.model);
    }

    this.memory.addMessage(this.sessionId, "assistant", finalContent);
    return finalContent;
  }

  private async runPostCompactionCheck(sessionId: string): Promise<void> {
    if (!this.compactor) return;
    const allMessages = this.memory.getAllMessages(sessionId);
    if (!allMessages || allMessages.length === 0) return;

    if (!this.compactor.shouldCompact(allMessages.length)) return;

    const cooldown = this.compactionCooldowns.get(sessionId) || { lastCompactionTime: 0 };
    const now = Date.now();
    if (now - cooldown.lastCompactionTime < this.COMPACTION_COOLDOWN_MS) return;

    try {
      const result = await this.compactor.compact(allMessages);
      if (result.success && result.summary) {
        cooldown.lastCompactionTime = now;
        this.compactionCooldowns.set(sessionId, cooldown);
        this.memory.compactSession(sessionId, this.compactor.keepRecent(), result.summary);
      }
    } catch (err) {
      console.error("[Agent] Compaction failed:", err);
    }
  }

  // ── Remaining methods (unchanged from original) ──
  remember(key: string, value: string): void { this.memory.setFact(key, value); }
  recall(key: string): string | null { return this.memory.getFact(key); }
  getHistory(): Message[] { return this.memory.getMessages(this.sessionId); }
  getSessions(): string[] { return this.memory.getAllSessionIds(); }
  getSessionMessageCount(sessionId: string): number { return this.memory.getMessageCount(sessionId); }
  clearSession(sessionId: string): void { this.memory.clearSession(sessionId); }
  getCompactionHistory(sessionId: string) { return this.memory.getCompactionHistory(sessionId); }
  close(): void { this.memory.close(); }

  getMemoryStatus(): string {
    const facts = this.memory.getAllFacts();
    const sessions = this.memory.getAllSessionIds();
    let output = "═════════ AGENT MEMORY ═════════\n\n";
    output += "📌 FACTS (permanent):\n";
    if (Object.keys(facts).length === 0) { output += "  (none stored)\n"; }
    else { for (const [key, value] of Object.entries(facts)) { output += `  ${key}: ${value.length > 50 ? value.slice(0, 50) + "..." : value}\n`; } }
    output += "\n💬 SESSIONS:\n";
    if (sessions.length === 0) { output += "  (no conversations yet)\n"; }
    else { for (const session of sessions) { output += `  ${session} (${this.memory.getMessageCount(session)} messages)\n`; } }
    output += "\n═══════════════════════════════";
    return output;
  }

  getUsageStatus(sessionId?: string): string {
    const session = sessionId || this.sessionId;
    const sessionUsage = this.memory.getSessionUsage(session);
    const totalUsage = this.memory.getTotalUsage();
    const pricing = getModelPricing(this.config.agent.model);
    const sessionCost = calculateCost(sessionUsage.promptTokens, sessionUsage.completionTokens, pricing);
    const totalCost = calculateCost(totalUsage.promptTokens, totalUsage.completionTokens, pricing);
    let output = "═════════ TOKEN USAGE ═════════\n\n";
    output += `📊 SESSION (${session}):\n  Prompt: ${sessionUsage.promptTokens.toLocaleString()} tokens\n  Completion: ${sessionUsage.completionTokens.toLocaleString()} tokens\n  Total: ${sessionUsage.totalTokens.toLocaleString()} tokens\n  Cost: ${formatCost(sessionCost)}\n`;
    output += `\n📈 ALL-TIME TOTAL:\n  Total: ${totalUsage.totalTokens.toLocaleString()} tokens\n  Cost: ${formatCost(totalCost)}\n`;
    output += "\n═══════════════════════════════";
    return output;
  }
}

export class CrashRecovery {
  private db: any; private dbPath: string;
  constructor(dbPath: string) { this.dbPath = dbPath.replace(".db", "_recovery.db"); }
  init() {
    const { Database } = require("bun:sqlite");
    this.db = new Database(this.dbPath);
    this.db.run(`CREATE TABLE IF NOT EXISTS checkpoints (id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp REAL NOT NULL, session_id TEXT NOT NULL, status TEXT DEFAULT 'active', last_input TEXT, pending_tools TEXT DEFAULT '[]', created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  }
  save(sessionId: string, input: string, pendingTools: any[] = []) {
    if (!this.db) this.init();
    this.db.run("INSERT INTO checkpoints (timestamp, session_id, last_input, pending_tools) VALUES (?, ?, ?, ?)", Date.now(), sessionId, input, JSON.stringify(pendingTools));
    this.db.run(`DELETE FROM checkpoints WHERE id NOT IN (SELECT id FROM checkpoints WHERE session_id = ? ORDER BY timestamp DESC LIMIT 10) AND session_id = ?`, sessionId, sessionId);
  }
  markCrashed(sessionId?: string) {
    if (!this.db) this.init();
    if (sessionId) { this.db.run("UPDATE checkpoints SET status = 'crashed' WHERE session_id = ? AND status = 'active'", sessionId); }
    else { this.db.run("UPDATE checkpoints SET status = 'crashed' WHERE status = 'active'"); }
  }
  getCrashed(): any[] { if (!this.db) this.init(); return this.db.prepare("SELECT * FROM checkpoints WHERE status = 'crashed' ORDER BY timestamp DESC").all(); }
  markClean(sessionId?: string) {
    if (!this.db) this.init();
    if (sessionId) { this.db.run("UPDATE checkpoints SET status = 'completed' WHERE session_id = ? AND status = 'active'", sessionId); }
    else { this.db.run("UPDATE checkpoints SET status = 'completed' WHERE status = 'active'"); }
  }
  needsRecovery(): boolean { if (!this.db) this.init(); const row = this.db.prepare("SELECT COUNT(*) as count FROM checkpoints WHERE status = 'crashed'").get(); return row.count > 0; }
  close() { if (this.db) this.db.close(); }
}
