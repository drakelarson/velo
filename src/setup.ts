#!/usr/bin/env bun
import * as readline from "readline";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { getVeloHome } from "./config.ts";

const VELO_HOME = getVeloHome();
const CONFIG_PATH = path.join(VELO_HOME, "config.toml");
const ENV_PATH = path.join(VELO_HOME, "velo.env");

// All supported providers with their configs
const PROVIDERS = [
  {
    id: "nvidia",
    name: "NVIDIA",
    desc: "Free tier, best quality/cost",
    models: ["meta/llama-3.3-70b-instruct", "meta/llama-3.1-8b-instruct", "nvidia/nemotron-3-70b", "deepseek/deepseek-r1", "moonshot/kimi-k2.5"],
    baseUrl: "https://integrate.api.nvidia.com/v1",
    apiKeyEnv: "NVIDIA_API_KEY",
    free: true,
  },
  {
    id: "openai",
    name: "OpenAI",
    desc: "GPT-5.4, GPT-OSS, latest models",
    models: ["gpt-5.4-mini", "gpt-5.4-nano", "gpt-5.4-pro", "gpt-5.3-instant", "gpt-oss-120b"],
    baseUrl: "https://api.openai.com/v1",
    apiKeyEnv: "OPENAI_API_KEY",
  },
  {
    id: "anthropic",
    name: "Anthropic",
    desc: "Claude 4.6 Sonnet, Opus, Haiku",
    models: ["claude-sonnet-4.6", "claude-opus-4.6", "claude-haiku-4.5"],
    baseUrl: "https://api.anthropic.com/v1",
    apiKeyEnv: "ANTHROPIC_API_KEY",
  },
  {
    id: "google",
    name: "Google",
    desc: "Gemini 3.1 Pro/Flash, 2.5 Pro",
    models: ["gemini-3.1-pro", "gemini-3.1-flash", "gemini-3.0-flash", "gemini-2.5-pro"],
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    apiKeyEnv: "GOOGLE_API_KEY",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    desc: "300+ models, unified API",
    models: ["openrouter/auto", "anthropic/claude-sonnet-4.6", "google/gemini-3.1-pro", "xai/grok-4.20"],
    baseUrl: "https://openrouter.ai/api/v1",
    apiKeyEnv: "OPENROUTER_API_KEY",
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    desc: "V3.2, Reasoner, cheapest quality",
    models: ["deepseek-chat", "deepseek-reasoner", "deepseek-v3.2", "deepseek-v3.2-speciale"],
    baseUrl: "https://api.deepseek.com/v1",
    apiKeyEnv: "DEEPSEEK_API_KEY",
  },
  {
    id: "groq",
    name: "Groq",
    desc: "Fastest inference, Llama 4",
    models: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "llama-4-scout-17b", "gpt-oss-120b", "compound"],
    baseUrl: "https://api.groq.com/openai/v1",
    apiKeyEnv: "GROQ_API_KEY",
  },
  {
    id: "cerebras",
    name: "Cerebras",
    desc: "Fastest inference, cheapest",
    models: ["llama3.1-8b", "llama3.3-70b", "gpt-oss-120b", "qwen-3-235b"],
    baseUrl: "https://api.cerebras.ai/v1",
    apiKeyEnv: "CEREBRAS_API_KEY",
  },
  {
    id: "huggingface",
    name: "Hugging Face",
    desc: "Inference API, 1000s of models",
    models: ["meta-llama/Llama-3.3-70B-Instruct", "Qwen/Qwen2.5-72B-Instruct", "mistralai/Mistral-Small-24B"],
    baseUrl: "https://api-inference.huggingface.co/v1",
    apiKeyEnv: "HUGGINGFACE_API_KEY",
  },
  {
    id: "azure",
    name: "Azure OpenAI",
    desc: "Enterprise, custom deployments",
    models: ["gpt-5.4-mini", "gpt-5.4-pro", "claude-sonnet-4.6", "deepseek-v3.2"],
    baseUrl: "",
    apiKeyEnv: "AZURE_OPENAI_API_KEY",
    needsEndpoint: true,
  },
  {
    id: "minimax",
    name: "MiniMax",
    desc: "M2.7 autonomous agents",
    models: ["minimax/m2.7", "minimax/m2.7-fast", "minimax/m2.5", "minimax/m2.5-fast"],
    baseUrl: "https://api.minimaxi.com/v1",
    apiKeyEnv: "MINIMAX_API_KEY",
  },
  {
    id: "ollama",
    name: "Ollama",
    desc: "Local models (free)",
    models: ["llama3.2", "llama3.3:70b", "llama4-scout", "qwen2.5", "gemma3", "deepseek-v3", "mistral"],
    baseUrl: "http://localhost:11434/v1",
    apiKeyEnv: "",
    local: true,
  },
];

const providerModels: Record<string, string[]> = {
  nvidia: ["meta/llama-3.3-70b-instruct", "meta/llama-3.1-8b-instruct", "nvidia/nemotron-3-70b", "deepseek/deepseek-r1", "moonshot/kimi-k2.5"],
  openai: ["gpt-5.4-mini", "gpt-5.4-nano", "gpt-5.4-pro", "gpt-5.3-instant", "gpt-oss-120b"],
  anthropic: ["claude-sonnet-4.6", "claude-opus-4.6", "claude-haiku-4.5"],
  google: ["gemini-3.1-pro", "gemini-3.1-flash", "gemini-3.0-flash", "gemini-2.5-pro"],
  openrouter: ["openrouter/auto", "openrouter/anthropic/claude-sonnet-4.6", "openrouter/google/gemini-3.1-pro", "openrouter/xai/grok-4.20"],
  deepseek: ["deepseek-chat", "deepseek-reasoner", "deepseek-v3.2", "deepseek-v3.2-speciale"],
  groq: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "llama-4-scout-17b", "gpt-oss-120b", "compound"],
  cerebras: ["llama3.1-8b", "llama3.3-70b", "gpt-oss-120b", "qwen-3-235b"],
  huggingface: ["meta-llama/Llama-3.3-70B-Instruct", "Qwen/Qwen2.5-72B-Instruct", "mistralai/Mistral-Small-24B"],
  azure: ["gpt-5.4-mini", "gpt-5.4-pro", "claude-sonnet-4.6", "deepseek-v3.2"],
  minimax: ["minimax/m2.7", "minimax/m2.7-fast", "minimax/m2.5", "minimax/m2.5-fast"],
  ollama: ["llama3.2", "llama3.3:70b", "llama4-scout", "qwen2.5", "gemma3", "deepseek-v3", "mistral"],
};

class SetupWizard {
  private rl: readline.Interface;

  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }

  private async ask(question: string): Promise<string> {
    return new Promise((resolve) => {
      this.rl.question(question, (answer) => {
        resolve(answer.trim());
      });
    });
  }

  private async askYesNo(question: string, default_?: boolean): Promise<boolean> {
    const d = default_ !== undefined ? (default_ ? "Y/n" : "y/N") : "y/n";
    const answer = await this.ask(`  ${question} [${d}]: `);
    if (!answer) return default_ ?? false;
    return answer.toLowerCase().startsWith("y");
  }

  private async askChoice(question: string, options: string[], default_?: number): Promise<number> {
    console.log(`  ${question}:`);
    options.forEach((opt, i) => {
      const marker = i === default_ ? ">" : " ";
      console.log(`  ${marker} ${i + 1}. ${opt}`);
    });
    const d = default_ !== undefined ? String(default_ + 1) : "";
    const answer = await this.ask(`  Select [${d}]: `);
    if (!answer && default_ !== undefined) return default_;
    const idx = parseInt(answer) - 1;
    return idx >= 0 && idx < options.length ? idx : (default_ ?? 0);
  }

  private async askPort(question: string, default_?: number): Promise<number> {
    const d = default_ ?? 3000;
    const answer = await this.ask(`  ${question} [${d}]: `);
    if (!answer) return d;
    const port = parseInt(answer);
    return isNaN(port) ? d : port;
  }

  private printStep(num: number, total: number, text: string) {
    console.log(`\n┌─[${num}/${total}] ${text}`);
    console.log("└───────────────────────────────────────");
  }

  async run(): Promise<void> {
    console.log(`
  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓
  ▓       Velo AI Agent Setup          ▓
  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓
`);

    // Step 1: Agent Identity
    this.printStep(1, 5, "Agent Identity");
    const agentName = await this.ask("  Name your agent: ") || "Velo";
    const personality = await this.ask("  Personality (optional): ") || "Helpful, concise, autonomous AI assistant";

    // Step 2: Model Provider
    this.printStep(2, 5, "AI Provider");
    const providerOptions = PROVIDERS.map(p => `${p.name} — ${p.desc}${p.free ? " [FREE]" : ""}`);
    const providerIdx = await this.askChoice("Select your AI provider", providerOptions, 0);
    const provider = PROVIDERS[providerIdx];

    // Pick model
    let model: string;
    if (provider.models.length === 1) {
      model = provider.models[0];
      console.log(`  Model: ${model}`);
    } else {
      const modelIdx = await this.askChoice("Select model", provider.models, 0);
      model = provider.models[modelIdx];
    }

    // Step 3: API Key / Endpoint
    this.printStep(3, 5, provider.local ? "Local Setup" : "API Key");
    
    let apiKey = "";
    let customBaseUrl = provider.baseUrl;

    if (provider.needsEndpoint) {
      customBaseUrl = await this.ask("  Enter your API endpoint URL: ") || provider.baseUrl;
      apiKey = await this.ask("  Enter your API key: ") || "";
    } else if (provider.local) {
      console.log("  ✓ No API key needed for local models");
      console.log("  Make sure Ollama is running: ollama serve");
      if (model === "any") {
        model = await this.ask("  Enter model name to use: ") || "llama3.2";
      }
    } else {
      console.log(`  Provider: ${provider.name}`);
      console.log(`  Model: ${model}`);
      apiKey = await this.ask(`  Enter your ${provider.name} API key: `) || "";
    }

    if (!apiKey && !provider.local) {
      console.log("  ⚠ No API key provided. Set it later with:");
      console.log(`     velo config key ${provider.id} YOUR_KEY`);
    }

    // Step 4: Telegram
    this.printStep(4, 5, "Telegram Bot");
    const hasTelegram = await this.askYesNo("Do you want to enable Telegram bot?", true);
    let telegramToken = "";
    if (hasTelegram) {
      console.log("  1. Message @BotFather on Telegram → /newbot");
      console.log("  2. Copy your bot token (e.g., 123456:ABC-DEF...)");
      telegramToken = await this.ask("  Enter your Telegram bot token: ") || "";
      if (!telegramToken) {
        console.log("  ⚠ No token. Start later: velo telegram YOUR_TOKEN");
      }
    }

    // Step 5: Webhook
    this.printStep(5, 5, "Webhook Server");
    const webhookEnabled = await this.askYesNo("Enable webhook/API server?", true);
    const webhookPort = await this.askPort("Port", 3000);

    // Summary
    console.log("\n╔══════════════════════════════════════╗");
    console.log("║           Setup Summary              ║");
    console.log("╚══════════════════════════════════════╝");
    console.log(`  Agent Name:    ${agentName}`);
    console.log(`  Personality:   ${personality}`);
    console.log(`  Provider:      ${provider.name}`);
    console.log(`  Model:         ${model}`);
    console.log(`  Telegram:      ${telegramToken ? "✓ Enabled" : "✗ Disabled"}`);
    console.log(`  Webhook:       ${webhookEnabled ? `✓ Enabled (port ${webhookPort})` : "✗ Disabled"}`);
    console.log("");

    const confirmed = await this.askYesNo("Save configuration?", true);
    if (!confirmed) {
      console.log("  Setup cancelled.");
      this.rl.close();
      return;
    }

    // Save
    await this.saveConfig({ agentName, personality, model, provider, apiKey, telegramToken, webhookEnabled, webhookPort, customBaseUrl });
    await this.registerService(telegramToken);

    console.log(`
╔══════════════════════════════════════╗
║         Setup Complete!             ║
╚══════════════════════════════════════╝

Quick start:
  velo chat "Hello!"                    # Test
  velo telegram ${telegramToken ? "(already set up)" : "<token>"}   # Start Telegram

Docs: https://github.com/drakelarson/velo
`);

    this.rl.close();
  }

  private async saveConfig({ agentName, personality, model, provider, apiKey, telegramToken, webhookEnabled, webhookPort, customBaseUrl }: any): Promise<void> {
    if (!fs.existsSync(VELO_HOME)) {
      fs.mkdirSync(VELO_HOME, { recursive: true });
    }

    // Create skills directory and symlink to built-in skills
    const skillsDir = path.join(VELO_HOME, "skills");
    if (!fs.existsSync(skillsDir)) {
      fs.mkdirSync(skillsDir, { recursive: true });
      // If we have built-in skills in the current install, symlink them
      const builtinSkills = path.join(process.cwd(), "skills");
      if (fs.existsSync(builtinSkills)) {
        for (const entry of fs.readdirSync(builtinSkills)) {
          const src = path.join(builtinSkills, entry);
          const dest = path.join(skillsDir, entry);
          if (!fs.existsSync(dest)) {
            fs.symlinkSync(src, dest);
          }
        }
        console.log(`  ✓ Symlinked built-in skills to ${skillsDir}`);
      }
    }

    // Create my-skills directory for user-installed skills
    const mySkillsDir = path.join(VELO_HOME, "my-skills");
    if (!fs.existsSync(mySkillsDir)) {
      fs.mkdirSync(path.join(mySkillsDir, "skills"), { recursive: true });
      console.log(`  ✓ Created my-skills directory at ${mySkillsDir}`);
    }

    // Build env file
    const envLines: string[] = [];
    if (apiKey && provider.apiKeyEnv) {
      envLines.push(`${provider.apiKeyEnv}=${apiKey}`);
    }
    if (telegramToken) {
      envLines.push(`TELEGRAM_BOT_TOKEN=${telegramToken}`);
    }

    if (envLines.length > 0) {
      fs.writeFileSync(ENV_PATH, envLines.join("\n") + "\n", "utf-8");
      console.log(`  ✓ Saved keys to ${ENV_PATH}`);
    }

    // Build config with ALL providers
    let providersToml = "";
    for (const p of PROVIDERS) {
      if (p.id === "ollama" || p.id === "custom") continue; // Skip these in default config
      providersToml += `
[providers.${p.id}]
api_key_env = "${p.apiKeyEnv}"${p.baseUrl ? `\nbase_url = "${p.baseUrl}"` : ""}`;
    }

    const configContent = `# Velo Agent Configuration
# Generated by velo setup

[agent]
name = "${agentName}"
personality = "${personality}"
model = "${provider.id}:${model}"

${providersToml}

[memory]
type = "sqlite"
path = "${VELO_HOME}/data/velo.db"
max_context_messages = 50

[compaction]
enabled = true
model = "ollama:qwen2.5:3b"
trigger_threshold = 40
keep_recent = 10
ollama_base = "http://localhost:11434"

[channels.webhook]
enabled = ${webhookEnabled}
port = ${webhookPort}

[channels.telegram]
enabled = ${!!telegramToken}
token_env = "TELEGRAM_BOT_TOKEN"

[scheduler]
enabled = false

[skills]
directory = "${VELO_HOME}/skills"
auto_load = true
`;

    fs.writeFileSync(CONFIG_PATH, configContent, "utf-8");
    console.log(`  ✓ Saved config to ${CONFIG_PATH}`);
  }

  private async registerService(telegramToken: string): Promise<void> {
    console.log("\n┌─ Service Registration");
    console.log("└───────────────────────────────────────");

    const isZo = !!process.env.ZO_CLIENT_IDENTITY_TOKEN;
    const isSystemd = fs.existsSync("/run/systemd/system");

    if (isZo) {
      console.log("  ✓ Zo Computer detected");
      console.log("  ℹ Run 'velo telegram <token>' to auto-register as service");
    } else if (isSystemd) {
      const unitPath = "/etc/systemd/system/velo.service";
      const content = `[Unit]
Description=Velo AI Agent
After=network.target

[Service]
Type=simple
User=${os.userInfo().username}
WorkingDirectory=${VELO_HOME}
Environment="VELO_HOME=${VELO_HOME}"
ExecStart=/usr/local/bin/velo ${telegramToken ? `telegram ${telegramToken}` : "start"}
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
`;
      try {
        fs.writeFileSync(unitPath, content);
        console.log(`  ✓ Created ${unitPath}`);
        console.log("  Run: sudo systemctl enable --now velo");
      } catch {
        console.log("  ⚠ Need sudo. Run manually:");
        console.log(`    sudo cp ${unitPath} /etc/systemd/system/`);
        console.log("    sudo systemctl enable --now velo");
      }
    } else {
      console.log("  ⚠ No service manager detected.");
      console.log("  For 24/7 operation, use systemd or run in background:");
      console.log("    nohup velo telegram <token> &");
    }
  }
}

export async function runSetup(): Promise<void> {
  const wizard = new SetupWizard();
  await wizard.run();
}

if (import.meta.main) {
  await runSetup();
}
