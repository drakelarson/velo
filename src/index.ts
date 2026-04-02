#!/usr/bin/env bun
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { Agent } from "./agent.ts";
import { Scheduler } from "./scheduler.ts";
import { createWebhookChannel } from "./channels/webhook.ts";
import { createTelegramChannel } from "./channels/telegram.ts";
import { loadConfig } from "./config.ts";
import { loadSkills } from "./skills.ts";
import { acquireLock, releaseLock, acquireChannelLock, releaseChannelLock } from "./lock.ts";
import type { Config } from "./types.ts";

const VERSION = "0.1.0";

function printHelp() {
  console.log(`
Velo - Fast, Persistent AI Agent Framework
v${VERSION}

Usage:
  velo [command] [options]

Commands:
  start           Start the agent with configured channels
  telegram <token>  Start Telegram bot with token (quickest way!)
  chat            Interactive chat mode (REPL)
  chat <msg>      Send a single message and exit
  
  service         List all running services
  stop            Stop all running services
  restart <svc>   Restart a specific service (telegram, webhook, etc)
  
  remember <k=v>  Store a fact in memory
  recall <key>    Retrieve a fact from memory
  history         Show recent conversation history
  sessions        List all conversation sessions
  clear <session> Clear a session's history
  
  memory stats    Show enhanced memory statistics (observations, sessions, prompts)
  memory search <query>  Search observations with FTS5 full-text search
  memory recent   Show recent observations across all sessions
  memory observe <type> <title> <narrative>  Record a new observation
  
  compact <session>    Manually compact a session's history
  compact test <model> Test compaction with a model
  compact status <session>  Show compaction history
  
  config show     Show current configuration
  config model <provider:model>   Set AI model
  config key <provider> <key>     Set API key
  config set <key> <value>        Set any config value
  config personality <text>       Set agent personality
  
  setup           Interactive setup wizard
  mcp             MCP Protocol commands (Claude Desktop)
  plugin          Plugin management commands
  orchestrate     Multi-agent orchestration commands
  subagent        Subagent spawning commands
  status          Show recovery status
  recover         Recover from crashed sessions
  build           Build single-binary executable
  help            Show this help message

Memory Observation Types:
  🟤 decision     - Architecture or design decisions
  🟡 bugfix       - Bug fixes and corrections
  🟢 feature      - New features or capabilities
  🟣 discovery    - Learnings or insights
  🔴 gotcha       - Critical edge cases or pitfalls
  🔵 how-it-works - Technical explanations
  ⚖️ trade-off    - Deliberate compromises
  📌 change       - General changes

Examples:
  velo setup                           # Interactive setup
  velo chat "Hello!"                   # Chat
  velo history                         # View recent messages
  velo memory stats                    # View memory statistics
  velo memory search "auth bug"        # Search for auth-related bugs
  velo memory observe bugfix "Fixed timeout" "Increased timeout to 120s"
  velo compact test ollama:qwen2.5:0.5b  # Test FREE local compaction
  velo orchestrate run research_report "AI in 2026"  # Multi-agent workflow

Quick Start:
  1. velo setup
  2. velo chat "Hello!"
`);
}

async function main() {
  const args = process.argv.slice(2);
  const configPath = getConfigPath(args, true);
  const modelOverride = getFlag(args, "--model");

  const command = args[0] || "help";

  // Handle config commands before creating agent (don't need AI)
  if (command === "config") {
    const subCmd = args[1];
    const configMgr = new ConfigManager(configPath);
    
    switch (subCmd) {
      case "show": {
        const cfg = configMgr.load();
        console.log(`\n[agent]`);
        console.log(`  name: ${cfg.agent.name}`);
        console.log(`  personality: ${cfg.agent.personality}`);
        console.log(`  model: ${cfg.agent.model}`);
        console.log(`\n[providers]`);
        for (const [name, prov] of Object.entries(cfg.providers)) {
          console.log(`  ${name}:`);
          console.log(`    api_key_env: ${prov.apiKeyEnv || "(not set)"}`);
          if (prov.baseUrl) console.log(`    base_url: ${prov.baseUrl}`);
        }
        console.log(`\n[channels]`);
        console.log(`  webhook: ${cfg.channels.webhook?.enabled ? `enabled (port ${cfg.channels.webhook?.port})` : "disabled"}`);
        console.log(`  telegram: ${cfg.channels.telegram?.enabled ? "enabled" : "disabled"}`);
        console.log(`\n[scheduler]`);
        console.log(`  enabled: ${cfg.scheduler.enabled}`);
        if (cfg.scheduler.tasks.length) {
          for (const t of cfg.scheduler.tasks) {
            console.log(`    - ${t.name} (${t.interval})`);
          }
        }
        break;
      }
      
      case "model": {
        const model = args[2];
        if (!model) {
          console.error("Usage: velo config model <provider:model>");
          console.error("Examples:");
          console.error("  velo config model openai:gpt-4o-mini");
          console.error("  velo config model nvidia:stepfun-ai/step-3.5-flash");
          console.error("  velo config model anthropic:claude-3-5-sonnet-20241022");
          process.exit(1);
        }
        configMgr.set("agent.model", model);
        console.log(`✓ Model set to: ${model}`);
        break;
      }
      
      case "key": {
        const provider = args[2];
        const key = args[3];
        if (!provider || !key) {
          console.error("Usage: velo config key <provider> <api-key>");
          console.error("Providers: openai, anthropic, nvidia, openrouter, minimax");
          process.exit(1);
        }
        configMgr.setKey(provider, key);
        console.log(`✓ API key set for: ${provider}`);
        console.log(`  Stored in .env as ${provider.toUpperCase()}_API_KEY`);
        break;
      }
      
      case "set": {
        const key = args[2];
        const value = args.slice(3).join(" ");
        if (!key || !value) {
          console.error("Usage: velo config set <key> <value>");
          console.error("Keys: agent.name, agent.personality, memory.path, channels.webhook.enabled");
          process.exit(1);
        }
        configMgr.set(key, value);
        console.log(`✓ Set ${key} = ${value}`);
        break;
      }
      
      case "personality": {
        const text = args.slice(2).join(" ");
        if (!text) {
          console.error("Usage: velo config personality <text>");
          process.exit(1);
        }
        configMgr.set("agent.personality", text);
        console.log(`✓ Personality set: "${text}"`);
        break;
      }
      
      default:
        console.error("Unknown config command. Use: show, model, key, set, personality");
        process.exit(1);
    }
    return;
  }

  if (command === "setup") {
    console.log(`\n  ▓▓▓  Velo Setup Wizard  ▓▓▓\n`);
    
    const readline = await import("readline");
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    
    const ask = (q: string): Promise<string> => new Promise((resolve) => rl.question(q, resolve));
    
    // Choose provider
    console.log("Choose your AI provider:");
    console.log("  1. NVIDIA (recommended, fast & cheap)");
    console.log("  2. OpenAI (GPT-4)");
    console.log("  3. Anthropic (Claude)");
    console.log("  4. OpenRouter (all models)");
    console.log("  5. MiniMax (cheapest)");
    console.log("  6. Ollama (local)");
    
    const providerChoice = await ask("\nProvider [1-6]: ");
    const providers = ["nvidia", "openai", "anthropic", "openrouter", "minimax", "ollama"];
    const provider = providers[parseInt(providerChoice) - 1] || "nvidia";
    
    // Get API key
    let apiKey = "";
    if (provider !== "ollama") {
      apiKey = await ask(`Enter your ${provider.toUpperCase()} API key: `);
    }
    
    // Agent name
    const agentName = await ask("Agent name [Velo]: ") || "Velo";
    
    // Personality
    const personality = await ask("Personality [Helpful AI assistant]: ") || "Helpful AI assistant";
    
    rl.close();
    
    // Write config
    const configMgr = new ConfigManager(configPath);
    configMgr.set("agent.name", agentName);
    configMgr.set("agent.personality", personality);
    configMgr.set("agent.model", `${provider}:${getDefaultModel(provider)}`);
    if (apiKey) {
      configMgr.setKey(provider, apiKey);
    }
    
    console.log(`\n✓ Setup complete!\n`);
    console.log(`  Agent: ${agentName}`);
    console.log(`  Model: ${provider}:${getDefaultModel(provider)}`);
    console.log(`  Config: ${configPath}`);
    console.log(`\nRun 'velo chat "Hello!"' to start chatting.\n`);
    return;
  }

  // Only create agent for commands that need it
  let config: Config;
  try {
    config = loadConfig(configPath);
  } catch (err) {
    console.error("Failed to load config:", err);
    console.error("Creating default config at ./velo.toml");
    process.exit(1);
  }

  if (modelOverride) {
    config.agent.model = modelOverride;
  }

  const agent = new Agent(config);

  // Load skills
  const skills = await loadSkills(config.skills.directory);
  for (const skill of skills) {
    agent.registerSkill(skill);
  }

  switch (command) {
    case "start": {
      // Acquire lock for long-running process
      if (!acquireLock()) {
        console.error("✖ Another Velo instance is already running");
        console.error("  Use 'velo stop' to stop it");
        process.exit(1);
      }
      console.log(`\n  ▓▓▓  Velo v${VERSION}  ▓▓▓\n`);
      console.log(`Model: ${config.agent.model}`);
      console.log(`Memory: ${config.memory.path}\n`);
      console.log(`PID: ${process.pid}\n`);

      const servers: { stop?: () => void }[] = [];

      // Start enabled channels
      if (config.channels.webhook?.enabled) {
        const webhook = createWebhookChannel(agent, config.channels.webhook.port);
        servers.push(webhook.start());
      }

      if (config.channels.telegram?.enabled) {
        const token = process.env[config.channels.telegram.token_env];
        if (token) {
          const telegram = createTelegramChannel(agent, token);
          // Expose telegram bot on agent for notify skill
          agent.telegramBot = telegram;
          servers.push(telegram.start());
        } else {
          console.error(`[Telegram] Missing token: ${config.channels.telegram.token_env}`);
        }
      }

      // Start scheduler
      let scheduler: Scheduler | undefined;
      if (config.scheduler.enabled) {
        scheduler = new Scheduler(agent, config.scheduler.tasks);
        scheduler.start();
      }

      // Handle shutdown
      process.on("SIGINT", () => {
        console.log("\nShutting down...");
        servers.forEach((s) => s.stop?.());
        scheduler?.stop();
        agent.close();
        releaseLock();
        process.exit(0);
      });

      break;
    }

    case "chat": {
      const msg = args.slice(1).join(" ").replace(/--\w+/g, "").trim();
      
      if (msg) {
        // Single message mode
        const response = await agent.process(msg);
        console.log(response);
      } else {
        // Interactive REPL
        console.log(`\n  ▓▓▓  Velo Chat  ▓▓▓\n  Type /exit to quit\n`);
        
        const readline = await import("readline");
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
        });

        const prompt = () => {
          rl.question("You: ", async (input) => {
            if (input.trim() === "/exit") {
              agent.close();
              rl.close();
              return;
            }

            if (input.trim()) {
              const response = await agent.process(input);
              console.log(`\n${config.agent.name}: ${response}\n`);
            }
            prompt();
          });
        };

        prompt();
      }
      break;
    }

    case "compact": {
      const subCmd = args[1];
      const sessionId = args[2] || "default";
      
      if (subCmd === "test") {
        const { testCompaction } = await import("./compactor.ts");
        const model = args[2] || "ollama:qwen2.5:0.5b";
        await testCompaction(model);
      } else if (subCmd === "status") {
        const history = agent.getCompactionHistory(sessionId);
        if (history.length === 0) {
          console.log("No compaction history for this session.");
        } else {
          console.log(`\n═════════ COMPACTION HISTORY (${sessionId}) ═════════\n`);
          for (const h of history) {
            console.log(`Date: ${h.created_at}`);
            console.log(`Messages compacted: ${h.messages_compacted}`);
            console.log(`Summary: ${h.summary.slice(0, 100)}...`);
            console.log("---");
          }
        }
        agent.close();
      } else if (sessionId) {
        // Manual compaction
        console.log(`Compacting session: ${sessionId}`);
        const { Compactor } = await import("./compactor.ts");
        const compactorCfg = config.compaction || { enabled: true, model: "ollama:qwen2.5:0.5b", triggerThreshold: 1, keepRecent: 10 };
        const providerCfg = agent.getProviderConfig?.(compactorCfg.model) || {};
        const compactor = new Compactor(compactorCfg, providerCfg);
        
        const messages = agent.getHistory();
        const { compacted, result } = await compactor.compact(messages);
        if (result) {
          console.log(`✓ Compacted ${result.originalCount} messages → 1 summary`);
          console.log(`  Tokens saved: ~${result.tokensSaved}`);
        } else {
          console.log("No compaction needed (below threshold)");
        }
        agent.close();
      }
      break;
    }

    case "remember": {
      const arg = args[1];
      if (!arg || !arg.includes("=")) {
        console.error("Usage: velo remember key=value");
        process.exit(1);
      }
      const [key, ...valueParts] = arg.split("=");
      const value = valueParts.join("=");
      agent.remember(key, value);
      console.log(`Remembered: ${key} = ${value}`);
      agent.close();
      break;
    }

    case "recall": {
      const key = args[1];
      if (!key) {
        console.error("Usage: velo recall key");
        process.exit(1);
      }
      const value = agent.recall(key);
      console.log(value || "(not found)");
      agent.close();
      break;
    }

    case "history": {
      const history = agent.getHistory();
      if (history.length === 0) {
        console.log("No history available.");
      } else {
        console.log("Recent messages:");
        for (const msg of history) {
          console.log(`[${msg.role}]: ${msg.content}`);
        }
      }
      agent.close();
      break;
    }

    case "sessions": {
      const sessions = agent.getSessions();
      if (sessions.length === 0) {
        console.log("No sessions found.");
      } else {
        console.log("\nSessions:");
        for (const session of sessions) {
          const count = agent.getSessionMessageCount(session);
          console.log(`  ${session} (${count} messages)`);
        }
        console.log("");
      }
      agent.close();
      break;
    }

    case "clear": {
      const sessionId = args[1] || "default";
      agent.clearSession(sessionId);
      console.log(`✓ Cleared session: ${sessionId}`);
      agent.close();
      break;
    }

    case "memory": {
      const subCmd = args[1];
      
      if (subCmd === "stats") {
        console.log(agent.getEnhancedMemoryStatus());
      } else if (subCmd === "search") {
        const query = args.slice(2).join(" ");
        if (!query) {
          console.log("Usage: velo memory search <query>");
          console.log("Example: velo memory search auth bug");
        } else {
          // Use memory's search directly
          const results = (agent as any).memory.searchObservations(query);
          if (results.length === 0) {
            console.log(`No observations found for "${query}"`);
          } else {
            console.log(`Found ${results.length} observations:\n`);
            for (const r of results) {
              console.log(`  #${r.id} [${r.type}] ${r.title}`);
            }
          }
        }
      } else if (subCmd === "recent") {
        console.log(agent.getRecentObservations(20));
      } else if (subCmd === "observe") {
        const type = args[2] as any;
        const title = args[3];
        const narrative = args.slice(4).join(" ");
        if (!type || !title) {
          console.log("Usage: velo memory observe <type> <title> <narrative>");
          console.log("Types: decision, bugfix, feature, discovery, gotcha, how-it-works, trade-off, change");
        } else {
          const id = agent.observe(type, title, narrative);
          console.log(`✓ Recorded observation #${id}`);
        }
      } else {
        console.log(agent.getMemoryStatus());
        console.log("\nMemory Commands:");
        console.log("  velo memory stats     - Show enhanced memory statistics");
        console.log("  velo memory search <q> - Search observations");
        console.log("  velo memory recent    - Show recent observations");
        console.log("  velo memory observe <type> <title> <narrative> - Record observation");
      }
      agent.close();
      break;
    }

    case "status": {
      console.log("═════════ VELO STATUS ═════════");
      console.log(`PID: ${process.pid}`);
      console.log(agent.getMemoryStatus());
      agent.close();
      break;
    }

    case "models": {
      const { getAvailableModels, compareModelCosts, formatCost } = await import("./pricing.ts");
      console.log("\n═════════ AVAILABLE MODELS ═════════\n");
      const comparison = compareModelCosts(1000, 500);
      for (const m of comparison.slice(0, 15)) {
        console.log(`${m.key}`);
        console.log(`  Input: $${m.pricing.input}/1M  Output: $${m.pricing.output}/1M`);
        console.log(`  Example cost (1K+500): ${formatCost(m.cost)}\n`);
      }
      console.log(`Total: ${comparison.length} models configured`);
      console.log("\n═══════════════════════════════");
      break;
    }

    case "recover": {
      const recovery = new (await import("./agent.ts")).CrashRecovery(config.memory.path);
      const crashed = recovery.getCrashed();
      if (crashed.length === 0) {
        console.log("✓ No crashed sessions found - clean state.");
      } else {
        console.log("═════════ CRASH RECOVERY ═════════");
        console.log(`Found ${crashed.length} crashed sessions:\n`);
        for (const c of crashed) {
          console.log(`Session: ${c.session_id}`);
          console.log(`Last input: ${(c.last_input || "(none)").slice(0, 50)}`);
          console.log(`Time: ${new Date(c.timestamp).toLocaleString()}`);
          console.log("---");
        }
      }
      recovery.close();
      agent.close();
      break;
    }

    case "telegram": {
      const token = args[1] || process.env.TELEGRAM_TOKEN;
      if (!token) {
        console.error("Usage: velo telegram <bot-token>");
        console.error("Example: velo telegram 123456:ABC-DEF...");
        console.error("Or set TELEGRAM_TOKEN in velo.env");
        process.exit(1);
      }
      
      // Acquire TELEGRAM-specific lock (allows other channels to run)
      if (!acquireChannelLock("telegram")) {
        console.error("✖ Telegram bot is already running");
        console.error("  Use 'velo stop' to stop it");
        process.exit(1);
      }
      
      console.log(`\n  ▓▓▓  Velo Telegram Bot  ▓▓▓\n`);
      console.log(`Model: ${config.agent.model}\n`);
      console.log(`PID: ${process.pid}\n`);
      
      const telegram = createTelegramChannel(agent, token);
      const server = telegram.start();
      
      // Handle shutdown
      process.on("SIGINT", () => {
        console.log("\nShutting down...");
        server.stop?.();
        agent.close();
        releaseChannelLock("telegram");
        process.exit(0);
      });
      break;
    }

    case "dashboard":
    case "ui": {
      console.log(`\n  ▓▓▓  Velo Dashboard  ▓▓▓\n`);
      console.log(`Starting web UI at http://localhost:3333`);
      console.log(`Config: ${configPath}\n`);
      
      // Look for dashboard in multiple locations
      const possiblePaths = [
        path.join(process.cwd(), "dashboard", "server.ts"),
        path.join(os.homedir(), ".velo", "dashboard", "server.ts"),
        "/usr/local/share/velo/dashboard/server.ts",
      ];
      
      let dashboardPath = null;
      for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
          dashboardPath = p;
          break;
        }
      }
      
      if (!dashboardPath) {
        console.error("Dashboard not found. Tried:");
        possiblePaths.forEach(p => console.error(`  ${p}`));
        process.exit(1);
      }
      
      console.log(`Dashboard: ${dashboardPath}`);
      
      // Spawn dashboard server
      const { spawn } = await import("bun");
      const dashboard = spawn({
        cmd: ["bun", "run", dashboardPath],
        cwd: path.dirname(dashboardPath),
        env: {
          ...process.env,
          VELO_HOME: path.dirname(configPath),
          DASHBOARD_PORT: args[1] || "3333",
        },
        stdout: "inherit",
        stderr: "inherit",
      });
      
      await dashboard.exited;
      break;
    }

    case "whatsapp": {
      const subCmd = args[1];
      
      if (subCmd === "login" || !subCmd) {
        console.log(`\n  ▓▓▓  Velo WhatsApp Login  ▓▓▓\n`);
        console.log(`This will start the WhatsApp bridge and display a QR code.`);
        console.log(`Scan it with WhatsApp (Settings > Linked Devices > Link a Device)\n`);
        
        const { WhatsAppChannel } = await import("./channels/whatsapp.ts");
        const channel = new WhatsAppChannel(agent, { enabled: true });
        await channel.login();
        
        // Keep running
        process.on("SIGINT", () => {
          console.log("\nShutting down WhatsApp bridge...");
          channel.disconnect();
          agent.close();
          process.exit(0);
        });
      } else if (subCmd === "status") {
        console.log("WhatsApp Status: Check ~/.velo/data/whatsapp-auth/ for session files");
      } else {
        console.log("\nWhatsApp Commands:");
        console.log("  velo whatsapp login  - Start QR login");
        console.log("  velo whatsapp status - Check connection status");
      }
      break;
    }

    case "build": {
      console.log("Building single-binary executable...");
      const { build } = await import("bun");
      await build({
        entrypoints: ["./src/index.ts"],
        outdir: "./dist",
        compile: true,
        naming: "velo",
      });
      console.log("Binary created at ./dist/velo");
      break;
    }


    case "mcp": {
      const subCmd = args[1];
      
      if (subCmd === "start") {
        // Start MCP server over stdio (for Claude Desktop integration)
        console.error("[MCP] Starting Velo MCP Server...");
        
        const { VeloMCPServer } = await import("./mcp.ts");
        const server = new VeloMCPServer({
          name: "Velo",
          version: VERSION,
          skills: (agent as any).skills,
          agent,
        });
        
        // Add memory as a resource
        server.addResource("velo://memory", "Memory", "Agent memory and facts", async () => {
          return agent.getMemoryStatus();
        });
        
        // Add config as a resource
        server.addResource("velo://config", "Config", "Agent configuration", async () => {
          return JSON.stringify(config, null, 2);
        });
        
        // Add a prompt template
        server.addPrompt("chat", "Start a conversation with Velo", "Hello! I'd like to chat with you.");
        
        await server.startStdio();
        
        // Keep process alive
        process.stdin.resume();
      } else if (subCmd === "tools") {
        const skills = Array.from((agent as any).skills?.keys?.() || []);
        console.log("\n📡 MCP Tools Available:\n");
        console.log(`  ${skills.length} tools registered\n`);
        console.log("To use with Claude Desktop, add to your config:");
        console.log(JSON.stringify({
          mcpServers: {
            velo: {
              command: "velo",
              args: ["mcp", "start"]
            }
          }
        }, null, 2));
        agent.close();
      } else {
        console.log("\n📡 MCP (Model Context Protocol):\n");
        console.log("  velo mcp start         Start MCP server (for Claude Desktop)");
        console.log("  velo mcp tools         List MCP tools with Claude config");
        console.log("\nMCP allows Claude Desktop and other AI apps to use Velo tools.");
        console.log("Run 'velo mcp start' to start the MCP server.\n");
        agent.close();
      }
      break;
    }

    case "subagent": {
      const prompt = args.slice(1).join(" ");
      if (!prompt) {
        console.log("\n🤖 Subagent Commands:\n");
        console.log("  velo subagent <prompt>   Spawn a subagent for parallel task");
        console.log("\nSubagents run tasks in parallel with the main agent.\n");
        agent.close();
      } else {
        console.log(`Spawning subagent for: ${prompt.slice(0, 50)}...`);
        const { spawnSubagent } = await import("./subagent.ts");
        const result = await spawnSubagent(prompt, config);
        console.log(result);
        agent.close();
      }
      break;
    }

    case "orchestrate": {
      const { runOrchestrationCLI } = await import("./orchestration.ts");
      await runOrchestrationCLI(args.slice(1));
      break;
    }

    case "learn": {
      const { runSelfImprovementCLI } = await import("./self_improvement.ts");
      await runSelfImprovementCLI(args.slice(1));
      break;
    }

    case "plugin": {
      const { runPluginCLI } = await import("./plugins.ts");
      await runPluginCLI(args.slice(1));
      break;
    }

    case "status": {
      console.log(agent.getMemoryStatus());
      agent.close();
      break;
    }

    case "recover": {
      console.log("✓ No crashed sessions found - clean state.");
      agent.close();
      break;
    }

    case "service": {
      // Service management - list running services (no agent needed)
      const { getChannelLockInfo } = await import("./lock.ts");
      const channels = ["telegram", "webhook", "discord", "whatsapp", "main"];

      console.log(`\n  ▓▓▓  Velo Services  ▓▓▓\n`);

      let anyRunning = false;
      for (const ch of channels) {
        const info = getChannelLockInfo(ch);
        if (info) {
          anyRunning = true;
          console.log(`  ${ch.padEnd(10)} PID: ${info.pid}  [running]`);
        } else {
          console.log(`  ${ch.padEnd(10)} --           [stopped]`);
        }
      }

      if (!anyRunning) {
        console.log("\n  No services running.\n");
        console.log("  Start a service:");
        console.log("    velo telegram <token>  # Telegram bot");
        console.log("    velo start             # All configured channels\n");
      } else {
        console.log("\n  Manage services:");
        console.log("    velo stop              # Stop all services");
        console.log("    velo restart <channel>  # Restart a specific service\n");
      }
      break;
    }

    case "stop": {
      // Gracefully stop running Velo instances (no agent needed)
      const { getChannelLockInfo } = await import("./lock.ts");
      const channels = ["telegram", "webhook", "discord", "whatsapp"];
      let stopped = false;

      for (const channel of channels) {
        const info = getChannelLockInfo(channel);
        if (info) {
          console.log(`Stopping ${channel} (PID ${info.pid})...`);
          try {
            process.kill(info.pid, "SIGINT");
            await new Promise((resolve) => setTimeout(resolve, 2000));
            console.log(`✓ ${channel} stopped`);
            stopped = true;
          } catch (e: any) {
            if (e.code === "ESRCH") {
              console.log(`✓ ${channel} was already stopped (stale lock removed)`);
            } else {
              console.error(`✖ Failed to stop ${channel}: ${e.message}`);
            }
          }
        }
      }

      // Also check main lock
      const mainLock = "/tmp/velo-locks/main.lock";
      if (fs.existsSync(mainLock)) {
        const pid = parseInt(fs.readFileSync(mainLock, "utf-8").trim());
        console.log(`Stopping main (PID ${pid})...`);
        try {
          process.kill(pid, "SIGINT");
          await new Promise((resolve) => setTimeout(resolve, 2000));
          console.log(`✓ main stopped`);
          stopped = true;
        } catch (e: any) {
          if (e.code !== "ESRCH") {
            console.error(`✖ Failed to stop main: ${e.message}`);
          }
        }
      }

      if (!stopped) {
        console.log("No running Velo instances found.");
      }
      break;
    }

    case "restart": {
      // Restart a running service (sends SIGINT, supervisord auto-restarts on Zo)
      const { getChannelLockInfo } = await import("./lock.ts");
      const channel = args[1] || "telegram";
      const info = getChannelLockInfo(channel);

      if (info) {
        console.log(`Restarting ${channel} (PID ${info.pid})...`);
        process.kill(info.pid, "SIGINT");
        console.log(`✓ ${channel} restart signal sent`);
        console.log(`  Service will resume automatically`);
      } else {
        console.error(`✖ No running ${channel} found`);
        console.error(`  Use 'velo telegram <token>' to start first`);
        process.exit(1);
      }
      break;
    }

    case "my-skills": {
      const subCmd = args[1];
      const target = args[2];
      
      const { MySkillsManager } = await import("./community.ts");
      const manager = new MySkillsManager();
      
      if (subCmd === "install" && target) {
        console.log(`Installing skill: ${target}`);
        const result = await manager.install(target);
        console.log(`✓ Installed: ${result.name}`);
        console.log(`  Location: ${result.path}`);
        console.log(`\nSkills are loaded from ~/.velo/my-skills/skills/`);
        console.log(`Restart velo to use the new skill.`);
      } else if (subCmd === "uninstall" && target) {
        manager.uninstall(target);
        console.log(`✓ Uninstalled: ${target}`);
      } else if (subCmd === "list") {
        const skills = manager.list();
        if (skills.length === 0) {
          console.log("No skills installed.");
          console.log("Install one: velo my-skills install <github-url>");
        } else {
          console.log("\n📦 My Skills:\n");
          for (const s of skills) {
            console.log(`  ${s.name}`);
            console.log(`    ${s.description}`);
            console.log(`    by ${s.author} • ${s.repo}`);
            console.log(`    ${s.installPath}`);
            console.log("");
          }
        }
      } else {
        console.log("\n📦 Velo My Skills\n");
        console.log("Install skills from GitHub directly:\n");
        console.log("  velo my-skills install <github-url>");
        console.log("  velo my-skills install https://github.com/user/velo-skill-crypto\n");
        console.log("  velo my-skills list           # Show installed");
        console.log("  velo my-skills uninstall <n>  # Remove a skill\n");
        console.log("Skills are installed to: ~/.velo/my-skills/skills/");
        console.log("They persist across updates and are loaded automatically.\n");
      }
      break;
    }

    case "help":
    case "--help":
    case "-h":
    default:
      printHelp();
      break;
  }
}

function getConfigPath(args: string[]): string {
  const idx = args.indexOf("--config");
  if (idx !== -1 && args[idx + 1]) {
    return args[idx + 1];
  }
  return path.join(os.homedir(), ".velo", "config.toml");
}

function getFlag(args: string[], flag: string): string | null {
  const idx = args.indexOf(flag);
  if (idx !== -1 && args[idx + 1]) {
    return args[idx + 1];
  }
  return null;
}

function getDefaultModel(provider: string): string {
  const defaults: Record<string, string> = {
    nvidia: "stepfun-ai/step-3.5-flash",
    openai: "gpt-4o-mini",
    anthropic: "claude-3-5-sonnet-20241022",
    openrouter: "openai/gpt-4o-mini",
    minimax: "minimax-m2.7",
    ollama: "llama3.2",
  };
  return defaults[provider] || "gpt-4o-mini";
}

class ConfigManager {
  private path: string;
  
  constructor(path: string) {
    this.path = path;
  }
  
  load(): Config {
    return loadConfig(this.path);
  }
  
  set(key: string, value: string): void {
    let content = fs.existsSync(this.path) ? fs.readFileSync(this.path, "utf-8") : "";
    
    // Parse key path (e.g., "agent.model" -> ["agent", "model"])
    const parts = key.split(".");
    
    // Simple TOML update
    const lines = content.split("\n");
    let inSection = "";
    let found = false;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Check for section
      const sectionMatch = line.match(/^\[([^\]]+)\]$/);
      if (sectionMatch) {
        inSection = sectionMatch[1];
        continue;
      }
      
      // Check for key match
      if (parts.length === 2 && inSection === parts[0]) {
        if (line.startsWith(`${parts[1]} =`)) {
          lines[i] = `${parts[1]} = "${value}"`;
          found = true;
        }
      } else if (parts.length === 1 && inSection === "") {
        if (line.startsWith(`${parts[0]} =`)) {
          lines[i] = `${parts[0]} = "${value}"`;
          found = true;
        }
      }
    }
    
    // If not found, add it
    if (!found) {
      if (parts.length === 2) {
        // Find or create section
        const sectionIdx = lines.findIndex(l => l.trim() === `[${parts[0]}]`);
        if (sectionIdx >= 0) {
          lines.splice(sectionIdx + 1, 0, `${parts[1]} = "${value}"`);
        } else {
          lines.push("", `[${parts[0]}]`, `${parts[1]} = "${value}"`);
        }
      }
    }
    
    fs.writeFileSync(this.path, lines.join("\n"), "utf-8");
  }
  
  setKey(provider: string, key: string): void {
    const envPath = this.path.replace(/\.toml$/, ".env");
    const envKey = `${provider.toUpperCase()}_API_KEY`;
    
    let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf-8") : "";
    const lines = envContent.split("\n").filter(l => !l.startsWith(envKey));
    lines.push(`${envKey}=${key}`);
    fs.writeFileSync(envPath, lines.join("\n"), "utf-8");
    
    // Also update TOML to reference the env var
    this.set(`providers.${provider}.api_key_env`, envKey);
  }
}

main().catch(console.error);