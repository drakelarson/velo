import * as os from "os";
import * as fs from "fs";
import * as path from "path";
import type { Config } from "./types.ts";

export interface ProviderConfig {
  apiKey?: string;      // inline key: "sk-..." (TOML only, no env indirection)
  apiKeyEnv?: string;   // env var name: "OPENAI_API_KEY" (legacy/compat)
  baseUrl?: string;
}

export function loadConfig(configPath?: string): Config {
  const homeDir = os.homedir();
  const veloHome = process.env.VELO_HOME || path.join(homeDir, ".velo");
  const defaultConfigPath = path.join(veloHome, "config.toml");
  const actualPath = configPath || defaultConfigPath;

  // Set defaults FIRST - these will be overwritten by TOML values if present
  const config: any = {
    agent: {
      name: "Velo",
      personality: "helpful, concise",
      model: "openai:gpt-4o-mini",
    },
    providers: {},
    memory: {
      type: "sqlite",
      path: path.join(veloHome, "data", "velo.db"),
      max_context_messages: 50,
    },
    channels: {
      telegram: { enabled: false, token_env: "TELEGRAM_BOT_TOKEN" },
      webhook: { enabled: false, port: 3000 },
    },
    scheduler: {
      enabled: false,
      tasks: [],
    },
    skills: {
      directory: path.join(veloHome, "skills"),
      auto_load: true,
    },
    compaction: {
      enabled: true,
      model: "google:gemma-3-4b-it",
      reflectionModel: "google:gemma-3-4b-it",
      triggerThreshold: 3,
      keepRecent: 10,
    },
  };

  if (!fs.existsSync(actualPath)) {
    return config as Config;
  }

  const tomlContent = fs.readFileSync(actualPath, "utf-8");
  const lines = tomlContent.split("\n");

  let currentSection = "";
  let currentArray = "";
  let arrayIndex = 0;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    // Skip comments and empty lines
    if (!line || line.startsWith("#")) continue;

    // Section header
    if (line.startsWith("[") && line.endsWith("]")) {
      currentSection = line.slice(1, -1);
      currentArray = "";
      if (currentSection === "compaction") {
        config.compaction = {}; // Reinitialize so TOML values overwrite defaults
      }
      continue;
    }

    // Array
    if (line.startsWith("[[") && line.endsWith("]]")) {
      currentArray = line.slice(2, -2);
      if (currentArray === "scheduler.tasks") {
        config.scheduler.tasks.push({});
        arrayIndex = config.scheduler.tasks.length - 1;
      }
      continue;
    }

    // Key-value pair
    const eqIndex = line.indexOf("=");
    if (eqIndex === -1) continue;

    let key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();

    // Parse value
    if (value.startsWith("\"") && value.endsWith("\"")) {
      value = value.slice(1, -1);
    } else if (value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1);
    } else if (value === "true") {
      value = true;
    } else if (value === "false") {
      value = false;
    } else if (/^\d+$/.test(value)) {
      value = parseInt(value);
    }

    // Apply to config
    if (currentArray === "scheduler.tasks" && !key.startsWith("[")) {
      (config.scheduler.tasks[arrayIndex] as any)[key] = value;
    } else if (currentSection.startsWith("providers.")) {
      const provider = currentSection.split(".")[1];
      if (!config.providers[provider]) config.providers[provider] = {};
      const camelKey = key.replace(/_([a-z])/g, (_: string, c: string) => c.toUpperCase());
      config.providers[provider][camelKey] = value;
    } else if (currentSection.startsWith("channels.")) {
      const channel = currentSection.split(".")[1];
      if (!config.channels[channel]) config.channels[channel] = {};
      config.channels[channel][key] = value;
    } else if (currentSection.includes(".")) {
      const [parent, child] = currentSection.split(".");
      if (!config[parent]) config[parent] = {};
      // snake_case to camelCase for nested keys (e.g. trigger_threshold -> triggerThreshold)
      const camelKey = key.replace(/_([a-z])/g, (_: string, c: string) => c.toUpperCase());
      config[parent][camelKey] = value;
    } else {
      if (!config[currentSection]) config[currentSection] = {};
      config[currentSection][key] = value;
    }
  }

  return config as Config;
}

export function getVeloHome(): string {
  const homeDir = os.homedir();
  const veloDir = path.join(homeDir, ".velo");
  if (!fs.existsSync(veloDir)) {
    fs.mkdirSync(veloDir, { recursive: true });
  }
  return veloDir;
}

export function getDataDir(): string {
  const veloHome = getVeloHome();
  const dataDir = path.join(veloHome, "data");
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  return dataDir;
}

export function ensureVeloDirs(): void {
  const veloHome = getVeloHome();
  const dirs = [
    path.join(veloHome, "data"),
    path.join(veloHome, "skills"),
    path.join(veloHome, "logs"),
    path.join(veloHome, "plugins"),
  ];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}
