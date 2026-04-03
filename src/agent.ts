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
    // Prefer inline apiKey, fall back to env var via apiKeyEnv
    const apiKey = prov?.apiKey || (prov?.apiKeyEnv ? process.env[prov.apiKeyEnv] : undefined);
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
      // ── CONCURRENT BATCHING ──────────────────────────────────────────
      const batches = this.buildExecutionBatches(result.toolCalls);
      for (const batch of batches) {
        if (batch.type === "parallel") {
          // Run all tools in parallel
          const results = await Promise.all(batch.calls.map(tc => this.executeSkill(tc)));
          for (const r of results) toolResults.push(r);
        } else {
          // Sequential: tools must run in order
          for (const tc of batch.calls) {
            toolResults.push(await this.executeSkill(tc));
          }
        }
      }
      // ── END CONCURRENT BATCHING ──────────────────────────────────────
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

  // ── CONCURRENT TOOL EXECUTION ───────────────────────────────────────

  /**
   * Execute a single tool call, returning a result object.
   * Shared-state and clarify tools always run sequentially.
   */
  private async executeSkill(tc: ToolCall): Promise<{ toolCallId: string; name: string; result: string }> {
    const skill = this.skills.get(tc.name);
    if (!skill) {
      return { toolCallId: tc.id, name: tc.name, result: `Unknown tool: ${tc.name}` };
    }
    try {
      const toolResult = await skill.execute(tc.arguments);
      this.memory.addMessage(this.sessionId, "system", `[Tool: ${tc.name}] ${toolResult}`);
      return { toolCallId: tc.id, name: tc.name, result: toolResult };
    } catch (err) {
      const errorMsg = `Error executing ${tc.name}: ${err}`;
      this.memory.addMessage(this.sessionId, "system", errorMsg);
      return { toolCallId: tc.id, name: tc.name, result: errorMsg };
    }
  }

  /**
   * Categorize a tool into its parallel safety group.
   * Returns 'never' for shared-state tools, 'path_scope' for file ops, 'parallel' for safe tools.
   */
  private parallelGroup(toolName: string): "never" | "path_scope" | "parallel" {
    const NEVER = new Set(["clarify", "memory_recall", "remember"]);
    if (NEVER.has(toolName)) return "never";
    const PATH_SCOPED = new Set(["file_read", "file_write", "patch", "edit_file_llm"]);
    if (PATH_SCOPED.has(toolName)) return "path_scope";
    return "parallel";
  }

  /**
   * Check if two tools can safely run in parallel.
   * Path-scoped tools must not have overlapping file paths.
   */
  private canRunParallel(a: ToolCall, b: ToolCall): boolean {
    const ga = this.parallelGroup(a.name);
    const gb = this.parallelGroup(b.name);
    if (ga === "never" || gb === "never") return false;
    if (ga === "path_scope" || gb === "path_scope") {
      // Only parallel if neither is path-scoped, or if paths don't overlap
      return !this.pathsOverlap(
        a.arguments["path"] || a.arguments["file"] || "",
        b.arguments["path"] || b.arguments["file"] || ""
      );
    }
    return true;
  }

  private pathsOverlap(a: string, b: string): boolean {
    if (!a || !b) return false;
    // Prefix match — if one path is a prefix of another, they overlap
    return a.startsWith(b) || b.startsWith(a);
  }

  /**
   * Build execution batches from a list of tool calls.
   * Returns array of { type: "parallel", calls } | { type: "sequential", calls }.
   *
   * Strategy: scan left-to-right, greedily grouping parallel-safe calls into
   * parallel batches. When a tool can't join the current parallel group, close
   * that batch and start a sequential batch for the blocking tool, then resume
   * greedy grouping from the next tool.
   *
   * Example: [A, B, C] all parallel-safe → single parallel batch
   * Example: [A(file_read /tmp/a), B(file_read /tmp/b)] → parallel (different paths)
   * Example: [A(file_read /tmp/a), B(file_read /tmp/a)] → sequential (same path)
   * Example: [A, B(clarify), C] → parallel [A], sequential [B(clarify)], parallel [C]
   */
  buildExecutionBatches(toolCalls: ToolCall[]): Array<{ type: "parallel" | "sequential"; calls: ToolCall[] }> {
    if (toolCalls.length === 0) return [];
    if (toolCalls.length === 1) {
      const g = this.parallelGroup(toolCalls[0].name);
      return [{ type: g === "never" ? "sequential" : "parallel", calls: toolCalls }];
    }

    const batches: Array<{ type: "parallel" | "sequential"; calls: ToolCall[] }> = [];
    let i = 0;

    while (i < toolCalls.length) {
      const tc = toolCalls[i];
      const g = this.parallelGroup(tc.name);

      if (g === "never") {
        // This tool must run alone, sequentially
        batches.push({ type: "sequential", calls: [tc] });
        i++;
        continue;
      }

      if (g === "path_scope") {
        // Start a new parallel group with this tool
        const parallelCalls: ToolCall[] = [tc];
        let j = i + 1;

        while (j < toolCalls.length) {
          const next = toolCalls[j];
          const gn = this.parallelGroup(next.name);

          if (gn === "never") break; // can't run in parallel with this

          if (gn === "parallel") {
            // Safe to always parallelize with path-scoped
            parallelCalls.push(next);
            j++;
          } else if (gn === "path_scope") {
            // Only parallel if paths don't overlap
            if (!this.pathsOverlap(
              tc.arguments["path"] || tc.arguments["file"] || "",
              next.arguments["path"] || next.arguments["file"] || ""
            )) {
              parallelCalls.push(next);
              j++;
            } else {
              break; // path conflict, stop adding to this batch
            }
          }
        }

        batches.push({ type: "parallel", calls: parallelCalls });
        i = j;
        continue;
      }

      // g === "parallel" — greedily group all parallel-safe tools
      const parallelCalls: ToolCall[] = [tc];
      let j = i + 1;

      while (j < toolCalls.length) {
        const next = toolCalls[j];
        if (!this.canRunParallel(tc, next)) break;
        parallelCalls.push(next);
        j++;
      }

      batches.push({ type: "parallel", calls: parallelCalls });
      i = j;
    }

    return batches;
  }

  // ── END CONCURRENT TOOL EXECUTION ─────────────────────────────────

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
