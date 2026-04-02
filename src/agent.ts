import { Memory, ObservationType } from "./memory.ts";
import { Brain, type ToolCall } from "./brain.ts";
import { getModelPricing, calculateCost, formatCost } from "./pricing.ts";
import { Compactor, type CompactorConfig, OllamaManager } from "./compactor.ts";
import { loadPersona, buildSystemPromptFromPersona, getActivePersonaName } from "./persona.ts";
import type { Config, Message, Skill, Tool } from "./types.ts";

export class Agent {
  private brain: Brain;
  private memory: Memory;
  private config: Config;
  private skills: Map<string, Skill> = new Map();
  private sessionId: string = "default";
  private toolCallCounter: number = 0;
  private compactor: Compactor | null = null;
  private lastCompactionTime: number = 0;
  private readonly COMPACTION_COOLDOWN_MS = 10 * 60 * 1000; // 10 min cooldown

  // NEW: Session activity tracking for inactivity timeout
  private sessionActivity: Map<string, number> = new Map(); // sessionId -> lastActivity timestamp
  private inactivityCheckInterval: Timer | null = null;
  private readonly INACTIVITY_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes
  private readonly CHECK_INTERVAL_MS = 30 * 1000; // Check every 30 seconds

  constructor(config: Config) {
    this.config = config;
    this.brain = new Brain(config.agent.model, config.providers);
    this.memory = new Memory(config.memory.path, config.memory.max_context_messages);
    
    // Initialize compactor if configured
    if (config.compaction?.enabled) {
      const providerConfig = this.getProviderConfig(config.compaction.model);
      this.compactor = new Compactor(config.compaction, providerConfig);
    }

    // Start inactivity checker
    this.startInactivityChecker();
  }

  getProviderConfig(model: string): { baseUrl?: string; apiKey?: string } {
    const [provider] = model.split(":");
    const prov = this.config.providers[provider];
    const apiKey = prov?.apiKeyEnv ? process.env[prov.apiKeyEnv] : undefined;
    return {
      baseUrl: prov?.baseUrl,
      apiKey,
    };
  }

  registerSkill(skill: Skill): void {
    this.skills.set(skill.name, skill);
  }

  setSession(sessionId: string): void {
    this.sessionId = sessionId;
  }

  private buildSystemPrompt(): string {
    const facts = this.memory.getAllFacts();
    const factStr = Object.entries(facts)
      .map(([k, v]) => `- ${k}: ${v}`)
      .join("\n");

    const skillCount = this.skills.size;

    // Get context index for progressive disclosure
    const contextIndex = this.memory.generateContextIndex(10);
    
    // Get recent session summaries for cross-session context
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

    // Load active persona
    const activePersonaName = this.config.agent?.persona || "default";
    const persona = loadPersona(activePersonaName);

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

    // Build dynamic categories from actually loaded skills
    const skillGroups: Record<string, string[]> = {};
    for (const skill of this.skills.values()) {
      const category = skill.category || "Other";
      if (!skillGroups[category]) skillGroups[category] = [];
      skillGroups[category].push(skill.name);
    }
    const categories = Object.entries(skillGroups)
      .map(([cat, names]) => `${cat}: ${names.join(", ")}`)
      .join("\n");

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
1. Use the information to answer the user's question
2. Quote or reference specific details from the results when relevant
3. Do not hallucinate or add information not in the results
4. Do not summarize unless the user asks for a summary

When you need to use a tool, the system will handle the tool call automatically. Respond naturally.`;
  }

  private getTools(): Tool[] {
    return Array.from(this.skills.values()).map((skill) => ({
      type: "function" as const,
      function: {
        name: skill.name,
        description: skill.description,
        // Use skill-specific parameters if provided, otherwise default to action+args
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
    // NEW: Track session activity
    this.trackActivity(this.sessionId);

    // NEW: Start session tracking and record user prompt
    this.memory.startSession(this.sessionId);
    this.memory.addUserPrompt(this.sessionId, input);

    // Check for compaction before processing (with 10-min cooldown)
    const allMessages = this.memory.getAllMessages(this.sessionId);
    if (this.compactor && allMessages && Array.isArray(allMessages) && allMessages.length > 0) {
      const msgCount = allMessages.length;
      const now = Date.now();
      if (msgCount > 0 && this.compactor.shouldCompact(msgCount) && (now - this.lastCompactionTime) > this.COMPACTION_COOLDOWN_MS) {
        try {
          const { compacted, result } = await this.compactor.compact(this.sessionId, allMessages);
          if (result) {
            this.lastCompactionTime = now;
            // Apply compaction to memory
            this.memory.compactSession(
              this.sessionId,
              this.config.compaction?.keepRecent || 10,
              result.summary
            );
          }
        } catch (err) {
          console.error("[Agent] Compaction failed:", err);
        }
      }
    }

    // Add user message to memory
    this.memory.addMessage(this.sessionId, "user", input);

    // Get context
    const messages = this.memory.getMessages(this.sessionId);
    const systemPrompt = this.buildSystemPrompt();
    const tools = this.getTools();

    // Think with tools
    let result = await this.brain.think(messages, systemPrompt, tools.length > 0 ? tools : undefined);

    // Handle tool calls (loop until no more tool calls)
    let iterations = 0;
    const maxIterations = 3;
    const toolResults: Array<{ toolCallId: string; name: string; result: string }> = [];

    console.error("[Agent] toolCalls:", result.toolCalls.map((t: any) => t.name));
    while (result.toolCalls.length > 0 && iterations < maxIterations) {
      iterations++;

      for (const tc of result.toolCalls) {
        console.error(`[Agent] Tool call: ${tc.name}, args: ${JSON.stringify(tc.arguments)}`);
        const skill = this.skills.get(tc.name);
        if (skill) {
          try {
            // Execute skill with arguments
            const toolResult = await skill.execute(tc.arguments);
            toolResults.push({
              toolCallId: tc.id,
              name: tc.name,
              result: toolResult,
            });
            // Add to memory
            this.memory.addMessage(this.sessionId, "system", `[Tool: ${tc.name}] ${toolResult}`);
          } catch (err) {
            const errorMsg = `Error executing ${tc.name}: ${err}`;
            toolResults.push({
              toolCallId: tc.id,
              name: tc.name,
              result: errorMsg,
            });
            this.memory.addMessage(this.sessionId, "system", errorMsg);
          }
        } else {
          const errorMsg = `Unknown tool: ${tc.name}`;
          toolResults.push({
            toolCallId: tc.id,
            name: tc.name,
            result: errorMsg,
          });
        }
      }

      // Get updated messages and think again
      const updatedMessages = this.memory.getMessages(this.sessionId);
      result = await this.brain.thinkWithToolResults(
        updatedMessages,
        systemPrompt,
        toolResults.splice(0), // Clear toolResults after passing
        tools.length > 0 ? tools : undefined
      );
    }

    // Self-correct: if all tool calls failed, try to recover
    const allFailed = toolResults.length > 0 && toolResults.every((r: any) => {
      const lower = r.result.toLowerCase();
      return lower.includes("error") || lower.includes("failed") || lower.includes("not found") || lower.includes("no url") || lower.includes("empty");
    });

    let finalContent = this.brain.stripToolCalls(result.content);
    if (allFailed) {
      // All tools failed AND model gave a generic response - inject guidance
      const failedTools = toolResults.map((r: any) => r.name + ": " + r.result.slice(0, 80)).join("\n");
      const guidanceMsg = "IMPORTANT: Your previous response was too brief. You had " + toolResults.length + " tool call(s) that failed. Inject more detail and a recovery plan. Do NOT just say \"I can't\" or give up. Suggest alternatives. Be honest but keep the persona. Failed tools:\n" + failedTools;
      const guidancePrompt = [
        ...messages,
        { role: "assistant" as const, content: finalContent },
        { role: "user" as const, content: guidanceMsg },
      ];
      const recovery = await this.brain.think(guidancePrompt, systemPrompt, undefined);
      finalContent = this.brain.stripToolCalls(recovery.content);
    }

    // Strip any remaining XML tool calls from content
    const cleanContent = finalContent;

    // Track token usage if available
    if (result.usage) {
      this.memory.addUsage(
        this.sessionId,
        result.usage.promptTokens,
        result.usage.completionTokens,
        result.usage.totalTokens,
        this.config.agent.model
      );
    }

    // Store clean response
    this.memory.addMessage(this.sessionId, "assistant", cleanContent);
    return cleanContent;
  }

  async *streamProcess(input: string): AsyncGenerator<string> {
    this.memory.addMessage(this.sessionId, "user", input);
    const messages = this.memory.getMessages(this.sessionId);
    const systemPrompt = this.buildSystemPrompt();

    // Note: streaming with tools is complex, just use regular process for now
    const result = await this.process(input);
    yield result;
  }

  remember(key: string, value: string): void {
    this.memory.setFact(key, value);
  }

  recall(key: string): string | null {
    return this.memory.getFact(key);
  }

  getHistory(): Message[] {
    return this.memory.getMessages(this.sessionId);
  }

  getSessions(): string[] {
    return this.memory.getAllSessionIds();
  }

  getSessionMessageCount(sessionId: string): number {
    return this.memory.getMessageCount(sessionId);
  }

  clearSession(sessionId: string): void {
    this.memory.clearSession(sessionId);
  }

  getMemoryStatus(): string {
    const facts = this.memory.getAllFacts();
    const sessions = this.memory.getAllSessionIds();

    let output = "═════════ AGENT MEMORY ═════════\n\n";

    // Facts section
    output += "📌 FACTS (permanent):\n";
    if (Object.keys(facts).length === 0) {
      output += "  (none stored)\n";
    } else {
      for (const [key, value] of Object.entries(facts)) {
        const display = value.length > 50 ? value.slice(0, 50) + "..." : value;
        output += `  ${key}: ${display}\n`;
      }
    }

    // Sessions section
    output += "\n💬 SESSIONS:\n";
    if (sessions.length === 0) {
      output += "  (no conversations yet)\n";
    } else {
      for (const session of sessions) {
        const count = this.memory.getMessageCount(session);
        output += `  ${session} (${count} messages)\n`;
      }
    }

    output += "\n═══════════════════════════════";
    return output;
  }

  getUsageStatus(sessionId?: string): string {
    const session = sessionId || this.sessionId;
    const sessionUsage = this.memory.getSessionUsage(session);
    const totalUsage = this.memory.getTotalUsage();

    // Get pricing for current model
    const pricing = getModelPricing(this.config.agent.model);
    const sessionCost = calculateCost(sessionUsage.promptTokens, sessionUsage.completionTokens, pricing);
    const totalCost = calculateCost(totalUsage.promptTokens, totalUsage.completionTokens, pricing);

    let output = "═════════ TOKEN USAGE ═════════\n\n";

    // Current session
    output += `📊 SESSION (${session}):\n`;
    output += `  Prompt: ${sessionUsage.promptTokens.toLocaleString()} tokens\n`;
    output += `  Completion: ${sessionUsage.completionTokens.toLocaleString()} tokens\n`;
    output += `  Total: ${sessionUsage.totalTokens.toLocaleString()} tokens\n`;
    output += `  API Calls: ${sessionUsage.apiCalls}\n`;
    output += `  Cost: ${formatCost(sessionCost)}\n`;

    // Total
    output += `\n📈 ALL-TIME TOTAL:\n`;
    output += `  Prompt: ${totalUsage.promptTokens.toLocaleString()} tokens\n`;
    output += `  Completion: ${totalUsage.completionTokens.toLocaleString()} tokens\n`;
    output += `  Total: ${totalUsage.totalTokens.toLocaleString()} tokens\n`;
    output += `  API Calls: ${totalUsage.apiCalls}\n`;
    output += `  Sessions: ${totalUsage.sessions}\n`;
    output += `  Cost: ${formatCost(totalCost)}\n`;

    // Pricing info
    output += `\n💰 PRICING (${this.config.agent.model}):\n`;
    output += `  Input: $${pricing.input}/1M tokens\n`;
    output += `  Output: $${pricing.output}/1M tokens\n`;
    if (pricing.context) {
      output += `  Context: ${pricing.context.toLocaleString()} tokens max\n`;
    }

    output += "\n═══════════════════════════════";
    return output;
  }

  // Get compaction history for a session
  getCompactionHistory(sessionId: string): { summary: string; messages_compacted: number; created_at: string }[] {
    return this.memory.getCompactionHistory(sessionId);
  }

  // ===========================================
  // NEW: OBSERVATION METHODS
  // ===========================================

  /**
   * Record an observation (structured learning) from this session
   */
  observe(
    type: "decision" | "bugfix" | "feature" | "discovery" | "gotcha" | "how-it-works" | "trade-off" | "change",
    title: string,
    narrative: string,
    facts: string[] = [],
    concepts: string[] = [],
    options?: { files_referenced?: string; tool_name?: string }
  ): number {
    return this.memory.addObservation(
      this.sessionId,
      type,
      title,
      narrative,
      facts,
      concepts,
      { ...options, channel: "chat" }
    );
  }

  /**
   * Get recent observations across all sessions
   */
  getRecentObservations(limit: number = 20): string {
    const observations = this.memory.getRecentObservations(limit);
    if (observations.length === 0) {
      return "📋 No observations recorded yet.";
    }

    let output = `📋 RECENT OBSERVATIONS (${observations.length})\n\n`;
    for (const obs of observations) {
      const icon = { 
        decision: "🟤", bugfix: "🟡", feature: "🟢", discovery: "🟣",
        gotcha: "🔴", "how-it-works": "🔵", "trade-off": "⚖️", change: "📌"
      }[obs.type] || "📌";
      const date = new Date(obs.created_at * 1000).toLocaleDateString();
      output += `${icon} #${obs.id} | ${obs.title} (${date})\n`;
    }
    output += `\n💡 Use 'mem-get <id>' for full details.`;
    return output;
  }

  /**
   * Get enhanced memory status including observations
   */
  getEnhancedMemoryStatus(): string {
    const stats = this.memory.getMemoryStats();
    const facts = this.memory.getAllFacts();

    let output = "═════════ VELO MEMORY STATUS ═════════\n\n";

    // Observations
    output += `📋 OBSERVATIONS: ${stats.totalObservations}\n`;
    if (Object.keys(stats.typesBreakdown).length > 0) {
      const icons: Record<string, string> = {
        decision: "🟤", bugfix: "🟡", feature: "🟢", discovery: "🟣",
        gotcha: "🔴", "how-it-works": "🔵", "trade-off": "⚖️", change: "📌"
      };
      for (const [type, count] of Object.entries(stats.typesBreakdown)) {
        output += `  ${icons[type] || "📌"} ${type}: ${count}\n`;
      }
    }

    // Sessions
    output += `\n💬 SESSIONS: ${stats.totalSessions}\n`;
    output += `📝 USER PROMPTS: ${stats.totalPrompts}\n`;

    // Facts
    output += `\n📌 FACTS: ${Object.keys(facts).length}\n`;

    // Storage
    const sizeKB = Math.round(stats.storageSize / 1024);
    output += `\n💾 STORAGE: ${sizeKB} KB\n`;

    output += "\n═══════════════════════════════";
    return output;
  }

  // ===========================================
  // NEW: SESSION REFLECTION (Inactivity Timeout)
  // ===========================================

  /**
   * Reflect on a session and generate an observation
   * Called after 3 minutes of inactivity
   */
  async reflect(sessionId: string): Promise<string | null> {
    const messages = this.memory.getAllMessages(sessionId);
    
    // Skip if session was too short
    if (messages.length < 2) {
      return null;
    }

    // Ensure Ollama is running before reflection
    try {
      const ollamaManager = new OllamaManager("http://localhost:11434", "qwen3:0.6b");
      const { ready, error } = await ollamaManager.ensureReady();
      if (!ready) {
        console.error("[Agent] Ollama not ready for reflection:", error);
        return null;
      }
    } catch (err) {
      console.error("[Agent] Failed to initialize OllamaManager:", err);
      return null;
    }

    // Build reflection prompt
    const conversationText = messages
      .map(m => `${m.role}: ${m.content}`)
      .join("\n\n");

    const reflectionPrompt = `Analyze this conversation and extract structured session data.

CONVERSATION:
${conversationText.slice(-3000)}

Respond in this EXACT format:
USER_GOAL: [What was the user trying to accomplish? One sentence max.]
COMPLETED: [What was actually completed or resolved? One sentence.]
NEXT_STEPS: [What should be done next? Comma-separated list or "none"]
TYPE: [decision|bugfix|feature|discovery|gotcha|how-it-works|trade-off|change]
TITLE: [One-line summary, max 60 chars]
NARRATIVE: [2-3 sentences explaining what happened and why it matters]
FACTS: [comma-separated facts learned, if any]
CONCEPTS: [comma-separated tags for search]

If nothing significant happened, respond with: SKIP`;

    try {
      // Use brain to analyze
      const result = await this.brain.thinkWithModel(
        [{ role: "user", content: reflectionPrompt }],
        "You are a concise conversation analyst. Return ONLY the analysis in the exact format requested. No extra text.",
        "ollama:qwen3:0.6b",
        undefined
      );

      const response = result.content.trim();

      // Check for skip
      if (response.startsWith("SKIP")) {
        return null;
      }

      // Parse response
      const userGoalMatch = response.match(/USER_GOAL:\s*(.+?)(?:\n|COMPLETED)/);
      const completedMatch = response.match(/COMPLETED:\s*(.+?)(?:\n|NEXT_STEPS)/);
      const nextStepsMatch = response.match(/NEXT_STEPS:\s*(.+?)(?:\n|TYPE)/);
      const typeMatch = response.match(/TYPE:\s*(\w+)/);
      const titleMatch = response.match(/TITLE:\s*(.+?)(?:\n|NARRATIVE)/);
      const narrativeMatch = response.match(/NARRATIVE:\s*(.+?)(?:\n|FACTS)/s);
      const factsMatch = response.match(/FACTS:\s*(.+?)(?:\n|CONCEPTS)/s);
      const conceptsMatch = response.match(/CONCEPTS:\s*(.+?)(?:\n|$)/s);

      const type = typeMatch?.[1] as ObservationType || "change";
      const title = titleMatch?.[1]?.trim() || "Session reflection";
      const narrative = narrativeMatch?.[1]?.trim() || response.slice(0, 200);
      const facts = factsMatch?.[1]?.split(",").map(s => s.trim()).filter(Boolean) || [];
      const concepts = conceptsMatch?.[1]?.split(",").map(s => s.trim()).filter(Boolean) || ["session-reflection"];
      
      const userGoal = userGoalMatch?.[1]?.trim() || undefined;
      const completed = completedMatch?.[1]?.trim() || undefined;
      const nextSteps = nextStepsMatch?.[1]?.trim() || undefined;

      // Store observation
      const obsId = this.memory.addObservation(
        sessionId,
        type,
        title,
        narrative,
        facts,
        concepts,
        { channel: "telegram" }
      );

      // Get current message count
      const messageCount = this.memory.getMessageCount(sessionId);

      // Update session summary with ALL fields
      this.memory.updateSessionSummary(sessionId, {
        user_goal: userGoal,
        completed: completed,
        learned: narrative,
        next_steps: nextSteps,
        message_count: messageCount,
      });

      return `🟣 Reflected: ${title} (obs #${obsId})`;
    } catch (err: any) {
      console.error("[Agent] Reflection error:", err.message);
      return null;
    }
  }

  // ===========================================
  // NEW: CROSS-CHANNEL SESSION TRACKING
  // ===========================================

  /**
   * Track activity for a session (called automatically by process())
   */
  private trackActivity(sessionId: string): void {
    this.sessionActivity.set(sessionId, Date.now());
  }

  /**
   * Start the background checker for inactive sessions
   */
  private startInactivityChecker(): void {
    if (this.inactivityCheckInterval) return;

    this.inactivityCheckInterval = setInterval(() => {
      const now = Date.now();
      for (const [sessionId, lastActivity] of this.sessionActivity) {
        if (now - lastActivity > this.INACTIVITY_TIMEOUT_MS) {
          // Session is inactive - trigger reflection
          this.triggerReflection(sessionId);
          // Remove from tracking to prevent repeated reflections
          this.sessionActivity.delete(sessionId);
        }
      }
    }, this.CHECK_INTERVAL_MS);
  }

  /**
   * Trigger reflection for an inactive session
   */
  private async triggerReflection(sessionId: string): Promise<void> {
    console.error(`[Agent] Session ${sessionId} inactive for 3 min, triggering reflection...`);
    try {
      const result = await this.reflect(sessionId);
      if (result) {
        console.error(`[Agent] ${result}`);
      }
    } catch (err: any) {
      console.error(`[Agent] Reflection error: ${err.message}`);
    }
  }

  /**
   * Stop the inactivity checker (cleanup)
   */
  stopInactivityChecker(): void {
    if (this.inactivityCheckInterval) {
      clearInterval(this.inactivityCheckInterval);
      this.inactivityCheckInterval = null;
    }
  }

  close(): void {
    this.stopInactivityChecker();
    this.memory.close();
  }
}

// ============================================
// CRASH RECOVERY (Add after class definition)
// ============================================

export class CrashRecovery {
  private db: any;
  private dbPath: string;

  constructor(dbPath: string) {
    this.dbPath = dbPath.replace(".db", "_recovery.db");
  }

  init() {
    const { Database } = require("bun:sqlite");
    this.db = new Database(this.dbPath);
    this.db.run(`
      CREATE TABLE IF NOT EXISTS checkpoints (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp REAL NOT NULL,
        session_id TEXT NOT NULL,
        status TEXT DEFAULT 'active',
        last_input TEXT,
        pending_tools TEXT DEFAULT '[]',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  save(sessionId: string, input: string, pendingTools: any[] = []) {
    if (!this.db) this.init();
    this.db.run(
      "INSERT INTO checkpoints (timestamp, session_id, last_input, pending_tools) VALUES (?, ?, ?, ?)",
      Date.now(), sessionId, input, JSON.stringify(pendingTools)
    );
    // Keep only last 10 checkpoints per session
    this.db.run(`
      DELETE FROM checkpoints WHERE id NOT IN (
        SELECT id FROM checkpoints WHERE session_id = ? ORDER BY timestamp DESC LIMIT 10
      ) AND session_id = ?
    `, sessionId, sessionId);
  }

  markCrashed(sessionId?: string) {
    if (!this.db) this.init();
    if (sessionId) {
      this.db.run("UPDATE checkpoints SET status = 'crashed' WHERE session_id = ? AND status = 'active'", sessionId);
    } else {
      this.db.run("UPDATE checkpoints SET status = 'crashed' WHERE status = 'active'");
    }
  }

  getCrashed(): any[] {
    if (!this.db) this.init();
    const rows = this.db.prepare("SELECT * FROM checkpoints WHERE status = 'crashed' ORDER BY timestamp DESC").all();
    return rows;
  }

  markClean(sessionId?: string) {
    if (!this.db) this.init();
    if (sessionId) {
      this.db.run("UPDATE checkpoints SET status = 'completed' WHERE session_id = ? AND status = 'active'", sessionId);
    } else {
      this.db.run("UPDATE checkpoints SET status = 'completed' WHERE status = 'active'");
    }
  }

  needsRecovery(): boolean {
    if (!this.db) this.init();
    const row = this.db.prepare("SELECT COUNT(*) as count FROM checkpoints WHERE status = 'crashed'").get();
    return row.count > 0;
  }

  close() {
    if (this.db) this.db.close();
  }
}
