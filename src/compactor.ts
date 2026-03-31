/**
 * Session Compaction System
 * Uses small models (e.g., ollama:qwen2.5:0.5b) to compress conversation history
 * Reduces context size without losing important information - FREE with local models
 */

import type { Message } from "./types.ts";

export interface CompactorConfig {
  enabled: boolean;
  model: string; // e.g., "ollama:qwen2.5:0.5b", "ollama:llama3.2:1b"
  triggerThreshold: number; // messages count trigger
  keepRecent: number; // keep last N messages uncompressed
  targetRatio: number; // target compression ratio (0.3 = 30% of original)
  ollamaBase?: string; // ollama server URL
}

interface CompactionResult {
  originalCount: number;
  compactedCount: number;
  summary: string;
  tokensSaved: number;
}

export class Compactor {
  private config: CompactorConfig;
  private providerConfig: { baseUrl?: string; apiKey?: string };

  constructor(config: CompactorConfig, providerConfig?: { baseUrl?: string; apiKey?: string }) {
    this.config = {
      enabled: true,
      model: "ollama:qwen2.5:0.5b",
      triggerThreshold: 40,
      keepRecent: 10,
      targetRatio: 0.3,
      ollamaBase: "http://localhost:11434",
      ...config,
    };
    this.providerConfig = providerConfig || {};
  }

  shouldCompact(messageCount: number): boolean {
    return this.config.enabled && messageCount >= this.config.triggerThreshold;
  }

  async compact(messages: Message[]): Promise<{ compacted: Message[]; result?: CompactionResult }> {
    if (!this.shouldCompact(messages.length)) {
      return { compacted: messages };
    }

    const toCompact = messages.slice(0, -this.config.keepRecent);
    const toKeep = messages.slice(-this.config.keepRecent);

    if (toCompact.length === 0) {
      return { compacted: messages };
    }

    console.log(`[Compactor] Compacting ${toCompact.length} messages using ${this.config.model}...`);

    try {
      const summary = await this.generateSummary(toCompact);
      
      const compactedMessage: Message = {
        role: "system",
        content: `[CONVERSATION SUMMARY]\n${summary}\n[END SUMMARY - Continue from here]`,
        timestamp: Date.now(),
      };

      const result: CompactionResult = {
        originalCount: toCompact.length,
        compactedCount: 1,
        summary,
        tokensSaved: this.estimateTokens(toCompact) - this.estimateTokens([compactedMessage]),
      };

      console.log(`[Compactor] Reduced ${toCompact.length} messages to 1 summary (saved ~${result.tokensSaved} tokens)`);

      return {
        compacted: [compactedMessage, ...toKeep],
        result,
      };
    } catch (err: any) {
      console.error(`[Compactor] Failed: ${err.message}`);
      return { compacted: messages }; // Return unchanged on failure
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

    const response = await this.callModel(prompt);
    return response;
  }

  private async callModel(prompt: string): Promise<string> {
    const [provider, model] = this.config.model.split(":");

    if (provider === "ollama") {
      return this.callOllama(model, prompt);
    }

    // Fallback to OpenAI-compatible API (for non-ollama compactors)
    return this.callOpenAICompatible(prompt);
  }

  private async callOllama(model: string, prompt: string): Promise<string> {
    const baseUrl = this.config.ollamaBase || this.providerConfig.baseUrl || "http://localhost:11434";
    
    const response = await fetch(`${baseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        options: {
          temperature: 0.3,
          num_predict: 512, // Limit output for summaries
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama request failed: ${response.status}`);
    }

    const data = await response.json();
    return data.response?.trim() || "Summary unavailable";
  }

  private async callOpenAICompatible(prompt: string): Promise<string> {
    const [provider, modelName] = this.config.model.split(":");
    
    let baseUrl = this.providerConfig.baseUrl;
    let apiKey = this.providerConfig.apiKey;

    // Provider-specific defaults
    if (provider === "openai") {
      baseUrl = baseUrl || "https://api.openai.com/v1";
    } else if (provider === "nvidia") {
      baseUrl = baseUrl || "https://integrate.api.nvidia.com/v1";
    }

    if (!baseUrl) {
      throw new Error(`No base URL configured for provider: ${provider}`);
    }

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { "Authorization": `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: modelName,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 512,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim() || "Summary unavailable";
  }

  private estimateTokens(messages: Message[]): number {
    // Rough estimate: ~4 chars per token
    return messages.reduce((sum, m) => sum + Math.ceil(m.content.length / 4), 0);
  }

  getConfig(): CompactorConfig {
    return { ...this.config };
  }

  updateConfig(updates: Partial<CompactorConfig>): void {
    Object.assign(this.config, updates);
  }
}

// Compact on startup if needed (for crash recovery)
export async function compactIfNeeded(
  messages: Message[],
  config: CompactorConfig,
  providerConfig?: { baseUrl?: string; apiKey?: string }
): Promise<{ compacted: Message[]; wasCompacted: boolean }> {
  const compactor = new Compactor(config, providerConfig);
  
  if (!compactor.shouldCompact(messages.length)) {
    return { compacted: messages, wasCompacted: false };
  }

  const { compacted, result } = await compactor.compact(messages);
  return { compacted, wasCompacted: !!result };
}

// CLI helper to test compaction
export async function testCompaction(model: string = "ollama:qwen2.5:0.5b"): Promise<void> {
  const compactor = new Compactor({
    enabled: true,
    model,
    triggerThreshold: 5,
    keepRecent: 2,
  });

  const testMessages: Message[] = [
    { role: "user", content: "Hello, I'm John", timestamp: 1 },
    { role: "assistant", content: "Hi John! How can I help you?", timestamp: 2 },
    { role: "user", content: "I need help with a Python project", timestamp: 3 },
    { role: "assistant", content: "Sure! What kind of Python project?", timestamp: 4 },
    { role: "user", content: "A web scraper using BeautifulSoup", timestamp: 5 },
    { role: "assistant", content: "Great choice! BeautifulSoup is excellent for scraping.", timestamp: 6 },
    { role: "user", content: "Can you show me an example?", timestamp: 7 },
    { role: "assistant", content: "Here's a basic example: ...", timestamp: 8 },
  ];

  console.log(`Testing compaction with ${model}...`);
  console.log(`Original: ${testMessages.length} messages`);

  const { compacted, result } = await compactor.compact(testMessages);

  console.log(`Compacted: ${compacted.length} messages`);
  if (result) {
    console.log(`Summary: ${result.summary}`);
    console.log(`Tokens saved: ${result.tokensSaved}`);
  }
}