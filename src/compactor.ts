/**
 * Session Compaction System
 * Uses small models (e.g., ollama:qwen2.5:3b) to compress conversation history
 * Reduces context size without losing important information - FREE with local models
 * 
 * AUTO-SETUP: Automatically installs Ollama and pulls required model if not present
 * WAKE-ON-DEMAND: Starts Ollama service when compaction is needed
 */

import { spawn, type Subprocess } from "bun";
import type { Message } from "./types.ts";

export interface CompactionResult {
  success: boolean;
  originalMessages: number;
  compactedMessages: number;
  summary: string;
  tokensSaved?: number;
  error?: string;
}

export interface CompactorConfig {
  model: string;
  triggerThreshold: number;
  keepRecent: number;
  ollamaBase: string;
}

export class OllamaManager {
  private ollamaBase: string;
  private model: string;
  private ollamaProcess: Subprocess | null = null;

  constructor(ollamaBase: string, model: string) {
    this.ollamaBase = ollamaBase;
    // Strip ollama: prefix if present
    this.model = model.replace(/^ollama:/, "");
  }

  async isOllamaInstalled(): Promise<boolean> {
    try {
      const result = Bun.spawnSync(["which", "ollama"]);
      return result.exitCode === 0;
    } catch {
      return false;
    }
  }

  async installOllama(): Promise<boolean> {
    console.log("[Compactor] Installing Ollama...");
    
    if (await this.isOllamaInstalled()) {
      console.log("[Compactor] Ollama already installed");
      return true;
    }

    try {
      const install = Bun.spawn(["sh", "-c", "curl -fsSL https://ollama.com/install.sh | sh"], {
        stdout: "pipe",
        stderr: "pipe",
      });

      const exitCode = await install.exited;
      
      if (exitCode === 0) {
        console.log("[Compactor] ✓ Ollama installed successfully");
        return true;
      } else {
        console.error("[Compactor] ✖ Ollama installation failed");
        return false;
      }
    } catch (err) {
      console.error("[Compactor] Install error:", err);
      return false;
    }
  }

  async isOllamaRunning(): Promise<boolean> {
    try {
      const response = await fetch(`${this.ollamaBase}/api/tags`, {
        method: "GET",
        signal: AbortSignal.timeout(2000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async startOllama(): Promise<boolean> {
    if (await this.isOllamaRunning()) {
      return true;
    }

    console.log("[Compactor] Starting Ollama service (wake on demand)...");

    try {
      this.ollamaProcess = spawn({
        cmd: ["ollama", "serve"],
        stdout: "ignore",
        stderr: "ignore",
        detached: true,
      });

      // Wait for service to be ready
      for (let i = 0; i < 15; i++) {
        await new Promise(r => setTimeout(r, 500));
        if (await this.isOllamaRunning()) {
          console.log("[Compactor] ✓ Ollama service started");
          return true;
        }
      }

      console.error("[Compactor] ✖ Ollama service failed to start");
      return false;
    } catch (err) {
      console.error("[Compactor] Start error:", err);
      return false;
    }
  }

  async isModelAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.ollamaBase}/api/tags`);
      const data = await response.json();
      
      const modelName = this.model.split(":")[0];
      
      return data.models?.some((m: any) => 
        m.name?.startsWith(modelName) || m.name === modelName
      ) || false;
    } catch {
      return false;
    }
  }

  async pullModel(): Promise<boolean> {
    if (await this.isModelAvailable()) {
      console.log(`[Compactor] Model ${this.model} already available`);
      return true;
    }

    console.log(`[Compactor] Pulling model ${this.model} (first time setup)...`);

    try {
      const pull = Bun.spawn(["ollama", "pull", this.model], {
        stdout: "pipe",
        stderr: "pipe",
      });

      const exitCode = await pull.exited;
      
      if (exitCode === 0) {
        console.log(`[Compactor] ✓ Model ${this.model} pulled successfully`);
        return true;
      } else {
        console.error(`[Compactor] ✖ Failed to pull model ${this.model}`);
        return false;
      }
    } catch (err) {
      console.error("[Compactor] Pull error:", err);
      return false;
    }
  }

  async ensureReady(): Promise<{ ready: boolean; error?: string }> {
    // Step 1: Check/install Ollama
    if (!(await this.isOllamaInstalled())) {
      const installed = await this.installOllama();
      if (!installed) {
        return { ready: false, error: "Failed to install Ollama" };
      }
    }

    // Step 2: Start Ollama service (wake on demand)
    const started = await this.startOllama();
    if (!started) {
      return { ready: false, error: "Failed to start Ollama service" };
    }

    // Step 3: Pull model if needed
    const modelReady = await this.pullModel();
    if (!modelReady) {
      return { ready: false, error: `Failed to pull model ${this.model}` };
    }

    return { ready: true };
  }

  stop() {
    if (this.ollamaProcess) {
      this.ollamaProcess.kill();
      this.ollamaProcess = null;
    }
  }
}

export class Compactor {
  private config: CompactorConfig;
  private ollamaManager: OllamaManager;

  constructor(config: Partial<CompactorConfig> = {}) {
    this.config = {
      model: config.model || "qwen2.5:3b",
      triggerThreshold: config.triggerThreshold || 40,
      keepRecent: config.keepRecent || 10,
      ollamaBase: config.ollamaBase || "http://localhost:11434",
    };
    this.ollamaManager = new OllamaManager(this.config.ollamaBase, this.config.model);
  }

  shouldCompact(messageCount: number): boolean {
    return messageCount >= this.config.triggerThreshold;
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

    // Ensure Ollama is ready (auto-setup + wake on demand)
    const { ready, error } = await this.ollamaManager.ensureReady();
    if (!ready) {
      return {
        success: false,
        originalMessages: messages.length,
        compactedMessages: messages.length,
        summary: `Compaction setup failed: ${error}`,
        error,
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

    return this.callOllama(prompt);
  }

  private async callOllama(prompt: string): Promise<string> {
    const modelName = this.config.model.replace(/^ollama:/, "");
    
    const response = await fetch(`${this.config.ollamaBase}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: modelName,
        prompt,
        stream: false,
        options: {
          temperature: 0.3,
          num_predict: 512,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama request failed: ${response.status}`);
    }

    const data = await response.json();
    return data.response?.trim() || "Summary unavailable";
  }

  private estimateTokens(messages: Message[]): number {
    return messages.reduce((sum, m) => sum + Math.ceil(m.content.length / 4), 0);
  }

  getConfig(): CompactorConfig {
    return { ...this.config };
  }
}

// CLI helper to test compaction
export async function testCompaction(model: string = "qwen2.5:3b"): Promise<void> {
  const compactor = new Compactor({
    model,
    triggerThreshold: 5,
    keepRecent: 2,
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
  console.log(`Model: ${model}`);
  console.log(`Original: ${testMessages.length} messages\n`);

  const result = await compactor.compact("test_session", testMessages);

  console.log(`\n--- RESULT ---`);
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