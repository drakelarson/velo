# Velo

**Fast, persistent AI agent framework** that runs everywhere — your laptop, a VPS, or as a 24/7 service.

One command to start. Infinite memory. Zero vendor lock-in.

---

## TL;DR — Get Running in 60 Seconds

```bash
# 1. Install (any Linux/macOS)
curl -fsSL https://raw.githubusercontent.com/drakelarson/velo/master/install.sh | bash

# 2. Run the setup wizard (guides you through everything)
velo setup

# 3. Start
velo start
```

Done. The setup wizard asks for your Telegram bot token, AI provider, and preferences.
Then Velo runs as a 24/7 background service.

---

## Quick Command Reference

| Task | Command |
|------|---------|
| Start Telegram | `velo telegram <token>` |
| Interactive chat | `velo chat` |
| Chat single message | `velo chat "Hello"` |
| Setup wizard | `velo setup` |
| Stop all services | `velo stop` |
| Check status | `velo service` |
| Restart a service | `velo restart telegram` |
| Force start (bypass lock) | `velo telegram --force` |

---

## First-Time Setup

### Telegram (1 minute)

1. **Get a bot token**
   Open Telegram → chat [@BotFather](https://t.me/BotFather) → send `/newbot` → follow prompts → copy the token

2. **Run the setup wizard**
   ```bash
   velo setup
   ```
   This guides you through everything: provider, API key, Telegram token, agent name.

3. **Done**
   Velo is running. Message your bot on Telegram.


### Other Channels

**WhatsApp** — QR code scan (no token needed):
```bash
velo whatsapp
# Scan the QR with your phone → done
```

**Web Dashboard** — browser UI for monitoring and config:
```bash
velo dashboard
# Opens at http://localhost:3333
```

---

## Configuration

### Interactive Setup Wizard

```bash
velo setup
```

Guides you through:
- Choosing an AI provider (NVIDIA recommended)
- Entering your API key
- Enabling/disabling channels
- Setting your agent's name and personality

### Manual Config

```bash
# Show current config
velo config show

# Set model
velo config model nvidia:stepfun-ai/step-3.5-flash

# Set API key
velo config key nvidia nvapi-YOUR-KEY-HERE

# Set personality
velo config personality "You are a helpful coding assistant"

# Set any value directly
velo config set agent.name MyBot
```

Config lives at `~/.velo/config.toml`, keys at `~/.velo/velo.env`.

---

## Managing Running Services

Velo runs as background services once started. Manage them with:

```bash
# See what's running
velo service

# Stop everything gracefully
velo stop

# Restart a specific service
velo restart telegram
velo restart webhook
```

No more `pkill` commands — Velo handles it cleanly.

---

## Memory & Sessions

Every conversation gets its own session. Your agent remembers facts across sessions.

```bash
# Store a permanent fact
velo remember name=John
velo remember timezone=UTC
velo remember prefers_short_responses=true

# Recall a fact
velo recall name

# View session history
velo history

# List all sessions
velo sessions

# Clear a session
velo clear default
```

**Telegram:** `/memory`, `/clear`, `/history` work too.

---

## Voice & Audio

Velo speaks and listens natively — no API costs.

**Telegram voice messages:** Just send a voice memo. Velo transcribes and responds.

**Voice responses:**
```
/voice on    # Enable voice mode
/voice off   # Disable voice mode
/voice list  # See available voices
/voice emma  # British female voice
```

Voices: `bella`, `sarah`, `nicole`, `sky`, `adam`, `michael`, `emma`, `isabella`, `george`, `lewis`

---

## Free Session Compaction

Sessions auto-compress when they get long (40+ messages) using a **free local AI model** — no API costs.

Velo handles everything automatically:
- Installs [Ollama](https://ollama.ai) if needed
- Pulls the compression model (qwen2.5:3b, ~500MB)
- Compresses silently in background

```bash
# Manual compaction
velo compact default

# Test compaction with a specific model
velo compact test qwen2.5:1.5b

# View compaction history
velo compact status default
```

---

## MCP Integration

Connect Velo to Claude Desktop, Cursor, or any MCP client.

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "velo": {
      "command": "velo",
      "args": ["mcp", "start"]
    }
  }
}
```

Restart Claude Desktop. All 83 Velo tools are now available.

### CLI
```bash
velo mcp start   # Start MCP server (stdio)
velo mcp tools    # List available tools
```

---

## Plugins

Extend Velo with npm packages or custom plugins.

```bash
# Create a plugin scaffold
velo plugin create my-plugin

# Install from npm
velo plugin install velo-plugin-slack

# Install from local dir
velo plugin install ./my-plugin

# Manage
velo plugin list
velo plugin enable my-plugin
velo plugin disable my-plugin
velo plugin uninstall my-plugin
```

---

## Multi-Agent Orchestration

Spawn parallel subagents for complex tasks:

```
spawn_agent "Research the latest AI news"
spawn_agent "Analyze this codebase"
check_agent agent_1
```

Each runs independently with its own session.

---

## Deployment

### Linux (systemd) — 24/7

```bash
sudo cat > /etc/systemd/system/velo.service << 'EOF'
[Unit]
Description=Velo AI Agent
After=network.target

[Service]
Type=simple
User=YOUR_USER
WorkingDirectory=/home/YOUR_USER/.velo
Environment="TELEGRAM_TOKEN=YOUR_TOKEN"
ExecStart=/usr/local/bin/velo telegram YOUR_TOKEN
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl enable velo
sudo systemctl start velo
```

### macOS (launchd)

```bash
cat > ~/Library/LaunchAgents/com.velo.agent.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.velo.agent</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/velo</string>
        <string>telegram</string>
        <string>YOUR_TOKEN</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
</dict>
</plist>
EOF

launchctl load ~/Library/LaunchAgents/com.velo.agent.plist
```

### Zo Computer

Velo registers as a native service — auto-starts on boot, survives sleep cycles.

### Build a Binary

```bash
velo build
# Output: dist/velo (standalone executable)
```

---

## Troubleshooting

**Bot not responding?**
```bash
# Check if running
velo service

# Check logs
tail -50 ~/.velo/velo.log

# Restart
velo stop && velo telegram YOUR_TOKEN
```

**Token not found?**
```bash
echo "TELEGRAM_TOKEN=123456:ABC-DEF..." >> ~/.velo/velo.env
velo telegram 123456:ABC-DEF...
```

**Need to start fresh?**
```bash
velo setup    # Re-run the setup wizard
```

---

## Reference

### Supported Providers

| Provider | Best For | Speed | Cost |
|----------|----------|-------|------|
| **NVIDIA** | General use | ⚡ Fast | 💰 Cheap |
| **OpenAI** | GPT-4 tasks | Fast | $$$ |
| **Anthropic** | Claude tasks | Fast | $$$ |
| **OpenRouter** | All models | Varies | Varies |
| **MiniMax** | Budget | ⚡⚡ Fastest | 💰 Cheapest |
| **Ollama** | Local/free | Local | Free |

### Available Commands

```
Chat & Memory
  velo chat [msg]          Interactive or single-message chat
  velo remember <k=v>       Store permanent fact
  velo recall <key>         Retrieve fact
  velo history              View recent messages
  velo sessions             List all sessions
  velo clear [session]      Clear session history

Configuration
  velo setup                Interactive setup wizard
  velo config show          View full config
  velo config model <m>     Set AI model
  velo config key <p> <k>   Set API key
  velo config set <k> <v>   Set any config value

Services
  velo service              List running services
  velo stop                 Stop all services
  velo restart [channel]    Restart a service

Advanced
  velo compact [session]     Compact session history
  velo mcp start             Start MCP server
  velo plugin [cmd]          Manage plugins
  velo orchestrate [cmd]     Multi-agent workflows
  velo build                 Build standalone binary
  velo dashboard             Start web UI
```

### Skills (83 Built-in Tools)

| Category | Tools |
|----------|-------|
| **Web** | search, extract, request, shorten, IP lookup, DNS, RSS, sitemap |
| **Files** | read, write, append, list, delete, exists, stat, mkdir, watch, grep |
| **System** | run, process_list, kill, info, cpu, mem, uptime, hostname, whoami, date |
| **Data** | parse JSON/CSV/TOML/XML, diff, validate, encode, hash, UUID |
| **Productivity** | weather, time, calc, convert, timer, countdown, password, quote, joke |
| **Social** | GitHub info/search, Hacker News, Reddit, Dev.to, Product Hunt, Wikipedia |
| **Dev** | git status/log/branch/pull, npm/pip install, docker ps/images/logs |
| **Media** | image info/resize/convert, video info/thumbnail, audio, PDF |
| **AI** | summarize, translate, explain code, sentiment, extract |

---

## Comparison

| | OpenClaw | Nanobot | **Velo** |
|-|----------|---------|----------|
| Startup | 5-10s | <1s | **~200ms** |
| Config | YAML/MD | Complex | **Simple TOML + CLI** |
| Persistence | Checkpoints | None | **Full SQLite** |
| Multi-provider | No | Yes | **Yes** |
| Single binary | No | Yes | **Yes** |
| Memory | Partial | None | **3-tier** |
| Session Compaction | Yes | No | **Yes (FREE local)** |
| MCP Support | Yes | No | **Yes** |
| Plugins | Yes | No | **Yes (npm)** |
| Subagents | No | No | **Yes** |

---

## Project Status

| Feature | Status |
|---------|--------|
| Core Agent | ✅ |
| Telegram | ✅ |
| WhatsApp | ✅ |
| Web Dashboard | ✅ |
| Voice (TTS/STT) | ✅ |
| MCP | ✅ |
| Session Compaction | ✅ |
| Plugins | ✅ |
| Multi-Agent | ✅ |
| Self-Improvement | ✅ |
| Docker | 🚧 |
| Windows | 🚧 |

---

**Install:** `curl -fsSL https://raw.githubusercontent.com/drakelarson/velo/master/install.sh | bash`

**Questions?** Open an issue at [github.com/drakelarson/velo](https://github.com/drakelarson/velo)
