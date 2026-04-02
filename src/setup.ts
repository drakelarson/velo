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
    models: ["nvidia/llama-3.1-nemotron-70b-instruct", "nvidia/llama-3.3-70b-instruct", "nvidia/QWEN-32B", "nvidia/DeepSeek-R1"],
    baseUrl: "https://integrate.api.nvidia.com/v1",
    apiKeyEnv: "NVIDIA_API_KEY",
    free: true,
  },
  {
    id: "openai",
    name: "OpenAI",
    desc: "GPT-4o, o-series, Sora",
    models: ["gpt-4o-mini", "gpt-4o", "gpt-4-turbo", "o3-mini", "o1-mini"],
    baseUrl: "https://api.openai.com/v1",
    apiKeyEnv: "OPENAI_API_KEY",
  },
  {
    id: "anthropic",
    name: "Anthropic",
    desc: "Claude 3.5 Sonnet, 3.7, Opus",
    models: ["claude-3-5-sonnet-20241022", "claude-3-5-haiku-20241022", "claude-3-7-sonnet-20250514", "claude-opus-4-5-20250122"],
    baseUrl: "https://api.anthropic.com/v1",
    apiKeyEnv: "ANTHROPIC_API_KEY",
  },
  {
    id: "google",
    name: "Google",
    desc: "Gemini 2.0 Flash, Pro, 2.5",
    models: ["gemini-2.0-flash-exp", "gemini-2.0-flash", "gemini-2.0-pro-exp", "gemini-3.0-flash-exp", "gemini-3.1-flash", "gemini-3.1-pro"],
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    apiKeyEnv: "GOOGLE_API_KEY",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    desc: "200+ models, unified API",
    models: ["openrouter/auto", "openrouter/google/gemini-2.0-flash-exp", "openrouter/anthropic/claude-3.5-sonnet", "openrouter/deepseek/deepseek-chat-v3-0324"],
    baseUrl: "https://openrouter.ai/api/v1",
    apiKeyEnv: "OPENROUTER_API_KEY",
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    desc: "V3, R1 reasoning, cheap",
    models: ["deepseek-chat-v3-0324", "deepseek-reasoner-v3-0324"],
    baseUrl: "https://api.deepseek.com/v1",
    apiKeyEnv: "DEEPSEEK_API_KEY",
  },
  {
    id: "groq",
    name: "Groq",
    desc: "Fast inference, Llama 3.3",
    models: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768"],
    baseUrl: "https://api.groq.com/openai/v1",
    apiKeyEnv: "GROQ_API_KEY",
  },
  {
    id: "cerebras",
    name: "Cerebras",
    desc: "Fastest inference, cheapest",
    models: ["llama-3.3-70b", "qwen-2.5-32b"],
    baseUrl: "https://api.cerebras.ai/v1",
    apiKeyEnv: "CEREBRAS_API_KEY",
  },
  {
    id: "huggingface",
    name: "Hugging Face",
    desc: "Inference API, 1000s of models",
    models: ["meta-llama/Llama-3.3-70B-Instruct", "mistralai/Mistral-7B-Instruct", "deepseek-ai/DeepSeek-V3"],
    baseUrl: "https://api-inference.huggingface.co/v1",
    apiKeyEnv: "HUGGINGFACE_API_KEY",
  },
  {
    id: "azure",
    name: "Azure OpenAI",
    desc: "Enterprise, custom deployments",
    models: ["gpt-4o-mini", "gpt-4o", "claude-3.5-sonnet"],
    baseUrl: "", // User provides full endpoint
    apiKeyEnv: "AZURE_OPENAI_API_KEY",
    needsEndpoint: true,
  },
  {
    id: "ollama",
    name: "Ollama",
    desc: "Local models (free)",
    models: ["llama3.2", "llama3.3", "qwen2.5", "deepseek-r1", "mistral"],
    baseUrl: "http://localhost:11434/v1",
    apiKeyEnv: "",
    local: true,
  },
  {
    id: "custom",
    name: "Custom Endpoint",
    desc: "LM Studio, vLLM, etc.",
    models: ["any"],
    baseUrl: "", // User provides
    apiKeyEnv: "CUSTOM_API_KEY",
    needsEndpoint: true,
  },
];

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
model = "ollama:qwen2.5:0.5b"
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
