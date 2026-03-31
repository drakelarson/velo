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

You have access to the following tools:
${skillList || "No tools available."}

When you need to use a tool, the system will handle the tool call automatically. Just respond naturally and the tools will be invoked when appropriate.`;
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

  close(): void {
    this.memory.close();
  }
}