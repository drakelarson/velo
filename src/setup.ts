#!/usr/bin/env bun
import * as readline from "readline";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { getVeloHome } from "./config.ts";
import type { Config } from "./types.ts";

const VELO_HOME = getVeloHome();
const CONFIG_PATH = path.join(VELO_HOME, "config.toml");
const ENV_PATH = path.join(VELO_HOME, "velo.env");

interface SetupAnswers {
  agentName: string;
  personality: string;
  model: string;
  provider: string;
  apiKey: string;
  telegramToken: string;
  webhookEnabled: boolean;
  webhookPort: number;
}

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

  private printHeader(text: string) {
    console.log(`\n╔${"═".repeat(text.length + 4)}╗`);
    console.log(`║  ${text}  ║`);
    console.log(`╚${"═".repeat(text.length + 4)}╝`);
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
    const agentName = await this.ask("  Name your agent: ");
    const personality = await this.ask("  Personality (optional): ") || "Helpful, concise, autonomous AI assistant";

    // Step 2: Model Provider
    this.printStep(2, 5, "AI Provider");
    const providers = [
      "NVIDIA (free tier available, best quality/cost)",
      "OpenAI (GPT-4o, GPT-4o-mini)",
      "Anthropic (Claude 3.5 Sonnet)",
      "OpenRouter (50+ models, unified API)",
      "Minimax (cheap, fast)",
    ];
    const providerIdx = await this.askChoice("Select your AI provider", providers, 0);
    const providerKeys = ["nvidia", "openai", "anthropic", "openrouter", "minimax"];
    const providerModels: Record<string, string[]> = {
      nvidia: ["nvidia/llama-3.1-nemotron-70b-instruct", "nvidia/llama-3.3-70b-instruct", "nvidia/QA003-32b"],
      openai: ["openai/gpt-4o-mini", "openai/gpt-4o"],
      anthropic: ["anthropic/claude-3-5-sonnet-20241022", "anthropic/claude-3-5-haiku-20241022"],
      openrouter: ["openrouter/auto", "openrouter/google/gemini-2.0-flash-exp", "openrouter/anthropic/claude-3-haiku"],
      minimax: ["minimax/minimax-2.0-flash", "minimax/any"],
    };
    const provider = providerKeys[providerIdx];
    const models = providerModels[provider] || [];
    const modelIdx = await this.askChoice("Select model", models, 0);
    const model = models[modelIdx];

    // Step 3: API Key
    this.printStep(3, 5, "API Key");
    console.log(`  Provider: ${provider}`);
    console.log(`  Model: ${model}`);
    const apiKeyLabel = provider.toUpperCase() + "_API_KEY";
    const apiKey = await this.ask(`  Enter your ${provider} API key: `);
    if (!apiKey) {
      console.log("  ⚠ No API key provided. You can set it later with:");
      console.log(`     velo config key ${provider} YOUR_KEY`);
    }

    // Step 4: Telegram
    this.printStep(4, 5, "Telegram Bot");
    const hasTelegram = await this.askYesNo("Do you want to enable Telegram bot?", true);
    let telegramToken = "";
    if (hasTelegram) {
      console.log("  1. Create a bot: Message @BotFather on Telegram");
      console.log("  2. Get your bot token (e.g., 123456:ABC-DEF...)");
      telegramToken = await this.ask("  Enter your Telegram bot token: ");
      if (!telegramToken) {
        console.log("  ⚠ No token provided. Enable later with: velo telegram YOUR_TOKEN");
      }
    }

    // Step 5: Webhook
    this.printStep(5, 5, "Webhook Server");
    const webhookEnabled = await this.askYesNo("Enable webhook server?", true);
    const webhookPort = await this.askPort("Webhook port", 3000);

    // Summary
    console.log("\n╔══════════════════════════════════════╗");
    console.log("║           Setup Summary              ║");
    console.log("╚══════════════════════════════════════╝");
    console.log(`  Agent Name:    ${agentName || "Velo"}`);
    console.log(`  Personality:   ${personality}`);
    console.log(`  Provider:      ${provider}`);
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

    // Write configuration
    await this.saveConfig({ agentName, personality, model, provider, apiKey, telegramToken, webhookEnabled, webhookPort });

    // Register service
    await this.registerService(telegramToken, webhookEnabled, webhookPort);

    console.log(`
╔══════════════════════════════════════╗
║         Setup Complete!             ║
╚══════════════════════════════════════╝

Quick start:
  velo chat "Hello!"                    # Test with chat
  velo telegram ${telegramToken ? "(already running)" : "<token>"}   # Start Telegram bot

Documentation: https://github.com/drakelarson/velo
`);

    this.rl.close();
  }

  private async saveConfig(answers: SetupAnswers): Promise<void> {
    // Ensure VELO_HOME exists
    if (!fs.existsSync(VELO_HOME)) {
      fs.mkdirSync(VELO_HOME, { recursive: true });
    }

    // Save API key to velo.env
    const envContent = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, "utf-8") : "";
    const envLines = envContent.split("\n").filter((line) => {
      if (!line.trim()) return false;
      const key = line.split("=")[0]?.trim();
      return key !== "TELEGRAM_BOT_TOKEN"; // Keep telegram token separate
    });

    if (answers.apiKey) {
      const envKey = answers.provider.toUpperCase() + "_API_KEY";
      envLines.push(`${envKey}=${answers.apiKey}`);
    }

    if (answers.telegramToken) {
      envLines.push(`TELEGRAM_BOT_TOKEN=${answers.telegramToken}`);
    }

    fs.writeFileSync(ENV_PATH, envLines.join("\n") + "\n", "utf-8");
    console.log(`  ✓ Saved API keys to ${ENV_PATH}`);

    // Generate config.toml
    const configContent = `# Velo Agent Configuration

[agent]
name = "${answers.agentName || "Velo"}"
personality = "${answers.personality || "Helpful, concise, autonomous AI assistant"}"
model = "${answers.provider}:${answers.model}"

[providers.${answers.provider}]
api_key_env = "${answers.provider.toUpperCase()}_API_KEY"

[providers.nvidia]
api_key_env = "NVIDIA_API_KEY"
base_url = "https://integrate.api.nvidia.com/v1"

[providers.openai]
api_key_env = "OPENAI_API_KEY"

[providers.anthropic]
api_key_env = "ANTHROPIC_API_KEY"

[providers.openrouter]
api_key_env = "OPENROUTER_API_KEY"
base_url = "https://openrouter.ai/api/v1"

[providers.minimax]
api_key_env = "MINIMAX_API_KEY"
base_url = "https://api.minimaxi.com/v1"

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
enabled = ${answers.webhookEnabled}
port = ${answers.webhookPort}

[channels.telegram]
enabled = ${!!answers.telegramToken}
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

  private async registerService(telegramToken: string, webhookEnabled: boolean, webhookPort: number): Promise<void> {
    console.log("\n┌─ Registering as Service");
    console.log("└───────────────────────────────────────");

    // Detect platform
    const isZo = !!process.env.ZO_CLIENT_IDENTITY_TOKEN;
    const isSystemd = fs.existsSync("/run/systemd/system");
    const hasSupervisor = fs.existsSync("/etc/supervisord.conf") || fs.existsSync("/etc/supervisor");

    if (isZo) {
      // Zo: register via Zo's service system (detected via env var)
      await this.registerZoService(telegramToken);
    } else if (isSystemd) {
      await this.registerSystemdService(telegramToken);
    } else if (hasSupervisor) {
      await this.registerSupervisorService(telegramToken);
    } else {
      console.log("  ⚠ Could not detect service manager.");
      console.log("  To run Velo 24/7, manually configure systemd or supervisord.");
      console.log("  Or run: nohup velo telegram <token> &");
    }
  }

  private async registerZoService(telegramToken: string): Promise<void> {
    console.log("  ✓ Detected Zo Computer environment");

    if (telegramToken) {
      // Use Zo's API to register service
      // Note: This requires the zo CLI or API access
      console.log("  ℹ Velo will auto-register on first run with 'velo telegram <token>'");
      console.log("  ℹ On Zo, long-running services should use 'register_user_service'");
    }
  }

  private async registerSystemdService(telegramToken: string): Promise<void> {
    const unitContent = `[Unit]
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

    const unitPath = "/etc/systemd/system/velo.service";
    try {
      fs.writeFileSync(unitPath, unitContent);
      console.log(`  ✓ Created systemd unit: ${unitPath}`);
      console.log("  Run: sudo systemctl enable --now velo");
    } catch (e) {
      console.log(`  ⚠ Could not write ${unitPath} (needs sudo)`);
      console.log("  Run these commands manually:");
      console.log("    sudo systemctl enable --now velo");
    }
  }

  private async registerSupervisorService(telegramToken: string): Promise<void> {
    const programContent = `[program:velo]
command=${process.argv[0] || "bun"} run ${path.join(process.cwd(), "src/index.ts")} ${telegramToken ? `telegram ${telegramToken}` : "start"}
directory=${VELO_HOME}
user=${os.userInfo().username}
autostart=true
autorestart=true
stdout_logfile=/var/log/velo.log
stderr_logfile=/var/log/velo.err.log
`;

    const confPath = "/etc/supervisor/conf.d/velo.conf";
    try {
      fs.writeFileSync(confPath, programContent);
      console.log(`  ✓ Created supervisor config: ${confPath}`);
      console.log("  Run: sudo supervisorctl reload");
    } catch (e) {
      console.log(`  ⚠ Could not write ${confPath}`);
    }
  }
}

// CLI runner
export async function runSetup(): Promise<void> {
  const wizard = new SetupWizard();
  await wizard.run();
}

// Run if executed directly
if (import.meta.main) {
  await runSetup();
}
