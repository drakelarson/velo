import { Memory } from "./memory.ts";
import { Brain, type ToolCall } from "./brain.ts";
import type { Config, Message, Skill, Tool } from "./types.ts";

export class Agent {
  private brain: Brain;
  private memory: Memory;
  private config: Config;
  private skills: Map<string, Skill> = new Map();
  private sessionId: string = "default";
  private toolCallCounter: number = 0;

  constructor(config: Config) {
    this.config = config;
    this.brain = new Brain(config.agent.model, config.providers);
    this.memory = new Memory(config.memory.path, config.memory.max_context_messages);
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

    const skillList = Array.from(this.skills.values())
      .map((s) => `- ${s.name}: ${s.description}`)
      .join("\n");

    return `You are ${this.config.agent.name}. ${this.config.agent.personality}

Known facts about the user:
${factStr || "No specific facts known yet."}

## Your Capabilities

You have access to ${this.skills.size} tools. Key capabilities include:

**MCP (Model Context Protocol):**
- mcp_connect: Connect to external MCP servers for additional tools
- mcp_tools: List available MCP tools
You CAN connect to MCP servers to extend your capabilities!

**Subagent Spawning:**
- subagent_spawn: Spawn independent subagents to work in parallel
- subagent_list: List active subagents
- subagent_status: Check subagent status
You CAN spawn subagents for parallel task execution!

**Web & Browser:**
- browser: Full browser control (open, click, fill, screenshot, read)
- web_search: Search the web using Webserp

**Files & Data:**
- file_read, file_write, file_list, etc.
- csv_query, json_query, sqlite_query

**System:**
- run_command: Execute shell commands
- cpu_info, memory_info, disk_info

All available tools:
${skillList || "No tools available."}

When you need to use a tool, the system will handle the tool call automatically. Respond naturally and mention what tool you'll use.`;
  }

  private getTools(): Tool[] {
    return Array.from(this.skills.values()).map((skill) => ({
      type: "function" as const,
      function: {
        name: skill.name,
        description: skill.description,
        parameters: {
          type: "object",
          properties: {
            action: { type: "string", description: "Action to perform" },
          },
          required: ["action"],
        },
      },
    }));
  }

  async process(input: string): Promise<string> {
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
    const maxIterations = 5;
    const toolResults: Array<{ toolCallId: string; name: string; result: string }> = [];

    while (result.toolCalls.length > 0 && iterations < maxIterations) {
      iterations++;

      for (const tc of result.toolCalls) {
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

    // Strip any remaining XML tool calls from content
    const cleanContent = this.brain.stripToolCalls(result.content);

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

    let output = "═════════ TOKEN USAGE ═════════\n\n";

    // Current session
    output += `📊 SESSION (${session}):\n`;
    output += `  Prompt: ${sessionUsage.promptTokens.toLocaleString()} tokens\n`;
    output += `  Completion: ${sessionUsage.completionTokens.toLocaleString()} tokens\n`;
    output += `  Total: ${sessionUsage.totalTokens.toLocaleString()} tokens\n`;
    output += `  API Calls: ${sessionUsage.apiCalls}\n`;

    // Total
    output += `\n📈 ALL-TIME TOTAL:\n`;
    output += `  Prompt: ${totalUsage.promptTokens.toLocaleString()} tokens\n`;
    output += `  Completion: ${totalUsage.completionTokens.toLocaleString()} tokens\n`;
    output += `  Total: ${totalUsage.totalTokens.toLocaleString()} tokens\n`;
    output += `  API Calls: ${totalUsage.apiCalls}\n`;
    output += `  Sessions: ${totalUsage.sessions}\n`;

    // Estimated cost (StepFun Step 3.5 Flash pricing)
    // Input: $0.10 per 1M tokens, Output: $0.30 per 1M tokens
    const inputCost = totalUsage.promptTokens * 0.0000001;  // $0.10/1M
    const outputCost = totalUsage.completionTokens * 0.0000003;  // $0.30/1M
    const estimatedCost = (inputCost + outputCost).toFixed(6);
    output += `\n💰 ESTIMATED COST: $${estimatedCost}\n`;
    output += `  (at $0.10/1M input, $0.30/1M output)\n`;

    output += "\n═══════════════════════════════";
    return output;
  }

  close(): void {
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
