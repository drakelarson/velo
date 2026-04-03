/**
 * Session Compaction System
 * Uses small models (e.g., google:gemma-3-4b-it) to compress conversation history
 * Reduces context size without losing important information
 * 
 * Reflection: Uses reflectionModel to generate structured summary with type, title, narrative
 * Compaction: Uses model to compress older messages into concise summary
 */

import { Brain } from "./brain.ts";
import type { Message, ProviderConfig } from "./types.ts";

export interface CompactionResult {
  success: boolean;
  originalMessages: number;
  compactedMessages: number;
  summary: string;
  tokensSaved?: number;
  error?: string;
}

export interface ReflectionResult {
  type: string;
  title: string;
  narrative: string;
  nextSteps: string[];
  completed: string;
  userGoal: string;
}

export interface CompactorConfig {
  model: string; // e.g., "google:gemma-3-4b-it" for compaction
  reflectionModel: string; // e.g., "google:gemma-3-4b-it" for reflection
  triggerThreshold: number;
  keepRecent: number;
  providers: Record<string, ProviderConfig>;
}

export class Compactor {
  private config: CompactorConfig;
  private brain: Brain;
  private reflectionBrain: Brain;
  private providers: Record<string, ProviderConfig>;

  constructor(config: CompactorConfig, providers: Record<string, ProviderConfig> = {}) {
    this.config = {
      model: config.model || "google:gemma-3-4b-it",
      reflectionModel: config.reflectionModel || "google:gemma-3-4b-it",
      triggerThreshold: config.triggerThreshold || 40,
      keepRecent: config.keepRecent || 10,
      providers: config.providers || {},
    };
    this.providers = providers;
    
    // Use full provider:model strings for Brain (Brain splits on ":")
    this.brain = new Brain(this.config.model, this.providers);
    this.reflectionBrain = new Brain(this.config.reflectionModel, this.providers);
  }

  shouldCompact(messageCount: number): boolean {
    return messageCount >= this.config.triggerThreshold;
  }

  async reflect(messages: Message[]): Promise<{ success: boolean; result?: ReflectionResult; error?: string }> {
    const conversation = messages
      .map(m => `[${m.role}]: ${m.content}`)
      .join("\n\n");

    const prompt = `Analyze this conversation and provide a structured reflection.

CONVERSATION:
${conversation}

Generate a reflection with these fields (respond in strict JSON format):
{
  "user_goal": "What the user was trying to accomplish",
  "completed": "What was successfully completed",
  "next_steps": ["Step 1", "Step 2", "Step 3"],
  "type": "bugfix|feature|research|question|other",
  "title": "Short descriptive title",
  "narrative": "Brief narrative of what happened"
}

Respond with ONLY the JSON object, no other text.`;

    try {
      const result = await this.reflectionBrain.thinkWithModel(
        [],
        prompt,
        this.config.reflectionModel,
        undefined,
        0.2 // Low temperature for consistent structured output
      );

      const content = result.content.trim();
      
      // Extract JSON from response
      let jsonStr = content;
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        jsonStr = jsonMatch[0];
      }

      const parsed = JSON.parse(jsonStr);
      
      return {
        success: true,
        result: {
          type: parsed.type || "other",
          title: parsed.title || "Conversation",
          narrative: parsed.narrative || "",
          nextSteps: Array.isArray(parsed.next_steps) ? parsed.next_steps : [],
          completed: parsed.completed || "",
          userGoal: parsed.user_goal || "",
        },
      };
    } catch (err: any) {
      console.error(`[Compactor] Reflection failed: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  async compact(sessionId: string, messages: Message[]): Promise<CompactionResult> {
    if (messages.length < this.config.triggerThreshold) {
      return {
        success: false,
        originalMessages: messages.length,
        compactedMessages: messages.length,
        summary: "Not enough messages to compact",
      };
    }

    const toCompact = messages.slice(0, -this.config.keepRecent);
    const toKeep = messages.slice(-this.config.keepRecent);

    if (toCompact.length === 0) {
      return {
        success: false,
        originalMessages: messages.length,
        compactedMessages: messages.length,
        summary: "No messages to compact",
      };
    }

    console.log(`[Compactor] Compacting ${toCompact.length} messages using ${this.config.model}...`);

    try {
      const summary = await this.generateSummary(toCompact);
      const tokensSaved = this.estimateTokens(toCompact) - Math.ceil(summary.length / 4);

      console.log(`[Compactor] ✓ Reduced ${toCompact.length} messages to 1 summary (saved ~${tokensSaved} tokens)`);

      return {
        success: true,
        originalMessages: messages.length,
        compactedMessages: this.config.keepRecent + 1,
        summary,
        tokensSaved,
      };
    } catch (err: any) {
      console.error(`[Compactor] Failed: ${err.message}`);
      return {
        success: false,
        originalMessages: messages.length,
        compactedMessages: messages.length,
        summary: `Compaction failed: ${err.message}`,
        error: err.message,
      };
    }
  }

  private async generateSummary(messages: Message[]): Promise<string> {
    const conversation = messages
      .map(m => `[${m.role}]: ${m.content}`)
      .join("\n\n");

    const prompt = `Summarize this conversation concisely. Keep key facts, decisions, and context needed to continue. Be brief but complete.

CONVERSATION:
${conversation}

SUMMARY:`;

    const result = await this.brain.thinkWithModel(
      [],
      prompt,
      this.config.model,
      undefined,
      0.3 // Slightly higher temp for summarization creativity
    );

    return result.content.trim() || "Summary unavailable";
  }

  private estimateTokens(messages: Message[]): number {
    return messages.reduce((sum, m) => sum + Math.ceil(m.content.length / 4), 0);
  }

  getConfig(): CompactorConfig {
    return { ...this.config };
  }
}

// CLI helper to test compaction
export async function testCompaction(
  model: string = "google:gemma-3-4b-it",
  reflectionModel: string = "google:gemma-3-4b-it"
): Promise<void> {
  const compactor = new Compactor({
    model,
    reflectionModel,
    triggerThreshold: 5,
    keepRecent: 2,
    providers: {
      google: {
        apiKeyEnv: "GOOGLE_API_KEY",
        baseUrl: "https://generativelanguage.googleapis.com/v1beta",
      },
    },
  });

  const testMessages: Message[] = [
    { role: "user", content: "Hello, I'm John" },
    { role: "assistant", content: "Hi John! How can I help you?" },
    { role: "user", content: "I need help with a Python project" },
    { role: "assistant", content: "Sure! What kind of Python project?" },
    { role: "user", content: "A web scraper using BeautifulSoup" },
    { role: "assistant", content: "Great choice! BeautifulSoup is excellent for scraping." },
    { role: "user", content: "Can you show me an example?" },
    { role: "assistant", content: "Here's a basic example: ..." },
  ];

  console.log(`\n  ▓▓▓  Compaction Test  ▓▓▓\n`);
  console.log(`Compaction Model: ${model}`);
  console.log(`Reflection Model: ${reflectionModel}`);
  console.log(`Original: ${testMessages.length} messages\n`);

  // Test reflection
  console.log("--- REFLECTION TEST ---");
  const reflection = await compactor.reflect(testMessages);
  if (reflection.success && reflection.result) {
    console.log(`Type: ${reflection.result.type}`);
    console.log(`Title: ${reflection.result.title}`);
    console.log(`User Goal: ${reflection.result.userGoal}`);
    console.log(`Completed: ${reflection.result.completed}`);
    console.log(`Next Steps: ${reflection.result.nextSteps.join(", ")}`);
    console.log(`Narrative: ${reflection.result.narrative}`);
  } else {
    console.log(`Reflection failed: ${reflection.error}`);
  }

  // Test compaction
  console.log("\n--- COMPACTION TEST ---");
  const result = await compactor.compact("test_session", testMessages);

  console.log(`Success: ${result.success}`);
  console.log(`Original: ${result.originalMessages} → Compacted: ${result.compactedMessages}`);
  if (result.tokensSaved) {
    console.log(`Tokens saved: ~${result.tokensSaved}`);
  }
  if (result.summary) {
    console.log(`\nSummary:\n${result.summary}`);
  }
  if (result.error) {
    console.log(`\nError: ${result.error}`);
  }
}
