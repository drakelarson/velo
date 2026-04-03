import * as os from "os";
import * as fs from "fs";
import * as path from "path";
import type { Config } from "./types.ts";


// Load env from multiple locations
function loadEnvFile(): void {
  const envLocations = [
    path.join(getVeloHome(), "velo.env"),
    path.join(process.cwd(), "velo.env"),
    path.join(os.homedir(), ".velo", "velo.env"),
  ];
  
  for (const envPath of envLocations) {
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, "utf-8");
      for (const line of envContent.split("\n")) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith("#")) {
          const [key, ...valueParts] = trimmed.split("=");
          const value = valueParts.join("=");
          if (key && value && !process.env[key]) {
            process.env[key] = value;
          }
        }
      }
      console.log(`[Config] Loaded env from: ${envPath}`);
      return;
    }
  }
}

export function loadConfig(configPath: string): Config {
  loadEnvFile();
  const fullPath = path.resolve(configPath);
  
  // Ensure directory exists
  const dir = path.dirname(fullPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  // Env already loaded from multiple locations
  
  if (!fs.existsSync(fullPath)) {
    // Create default config
    const defaultConfig = createDefaultConfig();
    fs.writeFileSync(fullPath, defaultConfig, "utf-8");
    return parseToml(defaultConfig);
  }

  const content = fs.readFileSync(fullPath, "utf-8");
  return parseToml(content);
}

function createDefaultConfig(): string {
  const veloHome = getVeloHome();
  return `# Velo Agent Configuration

[agent]
name = "Velo"
personality = "Helpful, concise, autonomous AI assistant"
model = "nvidia:stepfun-ai/step-3.5-flash"

[providers.nvidia]
api_key_env = "NVIDIA_API_KEY"
base_url = "https://integrate.api.nvidia.com/v1"

[providers.openai]
api_key_env = "OPENAI_API_KEY"

[providers.anthropic]
api_key_env = "ANTHROPIC_API_KEY"
base_url = "https://api.anthropic.com/v1"

[providers.google]
api_key_env = "GOOGLE_API_KEY"
base_url = "https://generativelanguage.googleapis.com/v1beta"

[providers.openrouter]
api_key_env = "OPENROUTER_API_KEY"
base_url = "https://openrouter.ai/api/v1"

[providers.deepseek]
api_key_env = "DEEPSEEK_API_KEY"
base_url = "https://api.deepseek.com/v1"

[providers.groq]
api_key_env = "GROQ_API_KEY"
base_url = "https://api.groq.com/openai/v1"

[providers.cerebras]
api_key_env = "CEREBRAS_API_KEY"
base_url = "https://api.cerebras.ai/v1"

[providers.huggingface]
api_key_env = "HUGGINGFACE_API_KEY"
base_url = "https://api-inference.huggingface.co/v1"

[providers.azure]
api_key_env = "AZURE_OPENAI_API_KEY"

[providers.ollama]
base_url = "http://localhost:11434/v1"

[memory]
type = "sqlite"
path = "${veloHome}/data/velo.db"
max_context_messages = 50

[compaction]
enabled = false
model = "ollama:qwen2.5:3b"
reflection_model = "google:gemma-3-4b-it"
trigger_threshold = 40
keep_recent = 10
ollama_base = "http://localhost:11434"

[channels.webhook]
enabled = true
port = 3000

[channels.telegram]
enabled = false
token_env = "TELEGRAM_BOT_TOKEN"

[scheduler]
enabled = false

[skills]
directory = "./skills"
auto_load = true
`;
}

export function parseToml(content: string): Config {
  const config: any = {
    agent: { name: "Velo", personality: "", model: "openai:gpt-4o-mini" },
    providers: {},
    memory: { type: "sqlite", path: "./data/velo.db", max_context_messages: 50 },
    channels: { webhook: { enabled: true, port: 3000 } },
    scheduler: { enabled: false, tasks: [] },
    skills: { directory: "./skills", auto_load: true },
    compaction: { enabled: false, model: "ollama:qwen2.5:3b", reflectionModel: "google:gemma-3-4b-it", triggerThreshold: 40, keepRecent: 10 },
  };

  let currentSection = "";
  let currentArray: string | null = null;
  let arrayIndex = 0;

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    
    // Skip comments and empty lines
    if (trimmed.startsWith("#") || !trimmed) continue;

    // Section header
    const sectionMatch = trimmed.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      const section = sectionMatch[1];
      if (section.startsWith("providers.")) {
        const provider = section.split(".")[1];
        currentSection = `providers.${provider}`;
        config.providers[provider] = {};
      } else if (section.startsWith("channels.")) {
        const channel = section.split(".")[1];
        currentSection = `channels.${channel}`;
        config.channels[channel] = { enabled: false };
      } else if (section.startsWith("scheduler.tasks")) {
        currentSection = "scheduler.tasks";
        currentArray = "tasks";
        arrayIndex = config.scheduler.tasks.length;
        config.scheduler.tasks.push({ name: "", interval: "1h", prompt: "" });
      } else {
        currentSection = section;
        currentArray = null;
      }
      continue;
    }

    // Array element (double bracket)
    const arrayMatch = trimmed.match(/^\[\[([^\]]+)\]\]$/);
    if (arrayMatch) {
      const arr = arrayMatch[1];
      currentArray = arr;
      arrayIndex = config.scheduler.tasks?.length || 0;
      if (arr === "scheduler.tasks") {
        config.scheduler.tasks.push({ name: "", interval: "1h", prompt: "" });
      }
      continue;
    }

    // Key-value pair
    const kvMatch = trimmed.match(/^(\w+)\s*=\s*(.+)$/);
    if (kvMatch) {
      const [, key, rawValue] = kvMatch;
      let value: any = rawValue.trim();

      // Parse value
      if (value.startsWith('"') && value.endsWith('"')) {
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

      // Assign to correct location
      if (currentArray === "scheduler.tasks") {
        (config.scheduler.tasks[arrayIndex] as any)[key] = value;
      } else if (currentSection.startsWith("providers.")) {
        const provider = currentSection.split(".")[1];
        // Convert snake_case to camelCase
        const camelKey = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
        config.providers[provider][camelKey] = value;
      } else if (currentSection.startsWith("channels.")) {
        const channel = currentSection.split(".")[1];
        config.channels[channel][key] = value;
      } else if (currentSection.includes(".")) {
        // Nested section like memory, skills, or compaction
        const [parent, child] = currentSection.split(".");
        if (!config[parent]) config[parent] = {};
        // Convert snake_case to camelCase for nested config keys
        const camelKey = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
        config[parent][camelKey] = value;
      } else {
        if (!config[currentSection]) config[currentSection] = {};
        config[currentSection][key] = value;
      }
    }
  }

  return config as Config;
}

export function getVeloHome(): string {
  const homeDir = os.homedir();
  const veloDir = path.join(homeDir, ".velo");
  if (!fs.existsSync(veloDir)) {
    fs.mkdirSync(veloDir);
  }
  return veloDir;
}

export function getVel(): Config {
  const configPath = path.join(os.homedir(), ".velo", "config.toml");
  return loadConfig(configPath);
}