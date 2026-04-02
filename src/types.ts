export interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ProviderConfig {
  apiKeyEnv?: string;
  baseUrl?: string;
}

export interface ChannelConfig {
  enabled: boolean;
  [key: string]: unknown;
}

export interface SchedulerTask {
  name: string;
  interval: string;
  prompt: string;
}

export interface CompactorConfig {
  enabled: boolean;
  model: string; // e.g., "ollama:qwen2.5:3b", "ollama:llama3.2:1b"
  triggerThreshold: number; // messages count trigger
  keepRecent: number; // keep last N messages uncompressed
  targetRatio?: number; // target compression ratio
  ollamaBase?: string; // ollama server URL
}

export interface Config {
  agent: {
    name: string;
    personality: string;
    model: string;
  };
  providers: Record<string, ProviderConfig>;
  memory: {
    type: string;
    path: string;
    max_context_messages: number;
  };
  channels: {
    telegram?: { enabled: boolean; token_env: string };
    discord?: { enabled: boolean; token_env: string };
    slack?: { enabled: boolean; token_env: string; app_token_env: string };
    email?: { enabled: boolean; host: string; port: number; user_env: string; pass_env: string };
    webhook?: { enabled: boolean; port: number };
  };
  scheduler: {
    enabled: boolean;
    tasks: SchedulerTask[];
  };
  skills: {
    directory: string;
    auto_load: boolean;
  };
  compaction?: CompactorConfig;
}

export interface Skill {
  name: string;
  description: string;
  execute: (args: Record<string, unknown>) => Promise<string>;
}

export interface Tool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, { type: string; description: string }>;
      required?: string[];
    };
  };
}