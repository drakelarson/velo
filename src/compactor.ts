/**
 * Session Compaction System
 *
 * Uses velo.toml for all config — mirrors how Agent is built.
 *
 * Config (from velo.toml):
 *   [compaction]
 *   enabled            = true
 *   model              = "google:gemma-3-4b-it"   # summarization
 *   reflection_model    = "google:gemma-3-4b-it"   # structured reflection
 *   trigger_threshold   = 40                       # compact after N messages
 *   keep_recent        = 10                       # always keep last N
 *
 * API: Compactor(Config) → compact(messages), reflect(messages), shouldCompact(n), keepRecent()
 */

import type { Config, Message } from "./types.ts";

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

/** Single-arg constructor — mirrors Agent(Config) pattern. */
export class Compactor {
  private compactModel: string;
  private reflectModel: string;
  private cfg: Config["compaction"];

  constructor(config: Config) {
    this.cfg = config.compaction ?? {
      enabled: true,
      model: "google:gemma-3-4b-it",
      triggerThreshold: 40,
      keepRecent: 10,
    };

    this.compactModel  = this.cfg.model;
    this.reflectModel  = this.cfg.reflectionModel ?? this.cfg.model;

    console.error(
      `[Compactor] init  model=${this.compactModel}` +
      `  reflect=${this.reflectModel}` +
      `  threshold=${this.cfg.triggerThreshold}` +
      `  keep=${this.cfg.keepRecent}`
    );
  }

  shouldCompact(messageCount: number): boolean {
    return messageCount >= (this.cfg.triggerThreshold ?? 40);
  }

  keepRecent(): number {
    return this.cfg.keepRecent ?? 10;
  }

  // ── public API ───────────────────────────────────────────────────────────

  async reflect(messages: Message[]): Promise<{ success: boolean; result?: ReflectionResult; error?: string }> {
    const conversation = messages.map(m => `[${m.role}]: ${m.content}`).join("\n\n");
    const prompt = `Analyze this conversation. Respond with ONLY a JSON object, nothing else.

{
  "user_goal": "What the user was trying to accomplish",
  "completed": "What was successfully completed",
  "next_steps": ["Step 1", "Step 2"],
  "type": "bugfix|feature|research|question|other",
  "title": "Short descriptive title",
  "narrative": "Brief narrative of what happened"
}

CONVERSATION:
${conversation}`;

    try {
      const result = await this.callModel(this.reflectModel, prompt, 0.2);
      const match = result.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(match ? match[0] : result);

      return {
        success: true,
        result: {
          type:      parsed.type      ?? "other",
          title:     parsed.title     ?? "Conversation",
          narrative: parsed.narrative ?? "",
          nextSteps: Array.isArray(parsed.next_steps) ? parsed.next_steps : [],
          completed: parsed.completed ?? "",
          userGoal:  parsed.user_goal ?? "",
        },
      };
    } catch (err: any) {
      console.error(`[Compactor] Reflection failed: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  async compact(messages: Message[]): Promise<CompactionResult> {
    const keepRecent = this.keepRecent();

    if (messages.length < keepRecent + 1) {
      return {
        success: false,
        originalMessages:  messages.length,
        compactedMessages: messages.length,
        summary:           "Not enough messages to compact",
      };
    }

    const toCompact = messages.slice(0, -keepRecent);

    console.error(`[Compactor] Compacting ${toCompact.length} messages, keeping ${keepRecent}...`);

    try {
      const summary = await this.summarize(toCompact);
      const inTokens  = this.estimateTokens(toCompact);
      const outTokens = Math.ceil(summary.length / 4);

      return {
        success:            true,
        originalMessages:   messages.length,
        compactedMessages:  keepRecent + 1,
        summary,
        tokensSaved:        Math.max(0, inTokens - outTokens),
      };
    } catch (err: any) {
      console.error(`[Compactor] Compaction failed: ${err.message}`);
      return {
        success:            false,
        originalMessages:   messages.length,
        compactedMessages:  messages.length,
        summary:            `Compaction failed: ${err.message}`,
        error:              err.message,
      };
    }
  }

  // ── private helpers ─────────────────────────────────────────────────────

  /**
   * Direct fetch call — bypasses OpenAI SDK entirely.
   * Google AI API does NOT support `system` role, so we use only `user` messages.
   */
  private async callModel(model: string, prompt: string, temperature: number): Promise<string> {
    const apiKey = process.env.GOOGLE_API_KEY ?? "";

    // Determine base URL and request format from model prefix
    let baseURL: string;
    let actualModel: string;

    if (model.startsWith("google:")) {
      baseURL     = "https://generativelanguage.googleapis.com/v1beta";
      actualModel = model.split(":")[1];
    } else if (model.startsWith("ollama:")) {
      baseURL     = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434/v1";
      actualModel = model.split(":")[1];
    } else if (model.startsWith("nvidia:")) {
      baseURL     = "https://integrate.api.nvidia.com/v1";
      actualModel = model.split(":")[1];
    } else if (model.startsWith("openrouter:")) {
      baseURL     = "https://openrouter.ai/api/v1";
      actualModel = model.split(":")[1];
    } else {
      // Plain model name — treat as OpenAI-compatible
      baseURL     = "https://api.openai.com/v1";
      actualModel = model;
    }

    let body: Record<string, unknown>;
    let headers: Record<string, string>;

    if (model.startsWith("google:")) {
      // Google AI API format — no system role, no chat.completions endpoint
      headers = {
        "Content-Type": "application/json",
      };
      body = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature,
          maxOutputTokens: 1024,
        },
      };
      const qs = `key=${apiKey}`;
      const url = `${baseURL}/models/${actualModel}:generateContent?${qs}`;

      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`${response.status} status code (${text.slice(0, 100)})`);
      }

      const data = await response.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    }

    // OpenAI-compatible API (ollama, nvidia, openrouter, direct openai)
    headers = {
      "Content-Type": "application/json",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    };
    body = {
      model:    actualModel,
      messages: [{ role: "user", content: prompt }],
      temperature,
    };
    const url = `${baseURL}/chat/completions`;

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`${response.status} status code (${text.slice(0, 100)})`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content ?? "";
  }

  private async summarize(messages: Message[]): Promise<string> {
    const conversation = messages.map(m => `[${m.role}]: ${m.content}`).join("\n\n");
    const prompt = `Summarize this conversation concisely. Preserve key facts, decisions, and context needed to continue naturally.

CONVERSATION:
${conversation}

Be brief but complete. Include specific details, numbers, or decisions made.

SUMMARY:`;

    return this.callModel(this.compactModel, prompt, 0.3);
  }

  private estimateTokens(messages: Message[]): number {
    return messages.reduce((sum, m) => sum + Math.ceil(m.content.length / 4), 0);
  }
}

// ── CLI test ────────────────────────────────────────────────────────────────

export async function testCompaction(model?: string): Promise<void> {
  const { loadConfig } = await import("./config.ts");
  const config = loadConfig(`${process.env.HOME}/.velo/config.toml`);

  if (model) {
    if (!config.compaction) {
      config.compaction = { enabled: true, model, reflectionModel: model, triggerThreshold: 40, keepRecent: 10 };
    } else {
      config.compaction.model            = model;
      config.compaction.reflectionModel  = model;
    }
  }

  const compactor = new Compactor(config);

  const testMessages: Message[] = [
    { role: "user",      content: "Hello, I'm John" },
    { role: "assistant", content: "Hi John! How can I help you?" },
    { role: "user",      content: "I need help with a Python web scraper project" },
    { role: "assistant", content: "Sure! What kind of website are you scraping?" },
    { role: "user",      content: "An e-commerce site for price tracking using BeautifulSoup" },
    { role: "assistant", content: "Great choice! BeautifulSoup is excellent for that." },
    { role: "user",      content: "Product listings and individual product pages" },
    { role: "assistant", content: "Perfect. Here's a basic structure using requests and BeautifulSoup..." },
  ];

  console.error(`\n  ▓▓▓  Compaction Test  ▓▓▓`);
  console.error(`Model:      ${config.compaction?.model}`);
  console.error(`Reflection: ${config.compaction?.reflectionModel ?? config.compaction?.model}`);
  console.error(`Threshold:  ${config.compaction?.triggerThreshold}`);
  console.error(`Keep:       ${config.compaction?.keepRecent}`);
  console.error(`Messages:   ${testMessages.length}\n`);

  // Reflection test
  console.error("--- REFLECTION TEST ---");
  const reflection = await compactor.reflect(testMessages);
  if (reflection.success && reflection.result) {
    const r = reflection.result;
    console.error(`Type:      ${r.type}`);
    console.error(`Title:     ${r.title}`);
    console.error(`Goal:      ${r.userGoal}`);
    console.error(`Done:      ${r.completed}`);
    console.error(`Next:      ${r.nextSteps.join(", ")}`);
    console.error(`Narrative: ${r.narrative}`);
  } else {
    console.error(`FAILED: ${reflection.error}`);
  }

  // Compaction test
  console.error("\n--- COMPACTION TEST ---");
  const result = await compactor.compact(testMessages);
  console.error(`Success:   ${result.success}`);
  console.error(`Messages:  ${result.originalMessages} → ${result.compactedMessages}`);
  if (result.tokensSaved) console.error(`Tokens:    ~${result.tokensSaved} saved`);
  if (result.summary)     console.error(`\nSummary:\n${result.summary}`);
  if (result.error)       console.error(`ERROR: ${result.error}`);
}
