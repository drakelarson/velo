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

### Config (velo config)

Every setting is visible and editable with simple commands:

```bash
velo config              # Beautiful status table — all settings at a glance
velo config get <key>   # Get a single value (e.g. velo config get agent.name)

# Set any value — dot notation for nested keys
velo config set agent.name            Cody        # Set agent name
velo config set agent.personality     "Friendly"  # Set personality
velo config set compaction.threshold   50          # Compact after N messages
velo config set compaction.keep_recent 10          # Keep last N messages

# Provider API keys
velo config set providers.nvidia.api_key     nvapi-YOUR-KEY-HERE
velo config set providers.google.api_key      YOUR-GOOGLE-KEY
velo config set providers.openai.api_key     sk-YOUR-OPENAI-KEY

# Special commands
velo config model      nvidia:stepfun-ai/step-3.5-flash  # Set AI model
velo config personality "You are a helpful assistant"      # Set personality text
```

Config file: `~/.velo/config.toml` (TOML format — human readable)

---

## Managing Running Services

Velo runs as background services once started. Manage them with:

```bash
velo start       # Start all enabled channels (telegram + webhook)
velo stop        # Stop all running services
velo restart     # Force kill all services and restart fresh

# If stuck (kill everything)
pkill -f velo; rm -f /tmp/velo-locks/*.lock
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

Sessions auto-compress when they get long (40+ messages) using **Google's free Gemma-3-4b-IT model** — no API costs, no Ollama needed.

Velo handles everything automatically:
- Uses Google AI Studio's free tier (gemma-3-4b-it)
- Compresses silently in background
- Reflection generates structured session summaries with type, title, narrative

```bash
# Manual compaction
velo compact default

# View compaction history
velo compact status default
```

> **Note:** Previous versions used Ollama with qwen2.5:3b. The current version uses Google Gemma via the OpenAI-compatible API — faster, no local model needed.

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
| Session Compaction | Yes | No | **Yes (FREE via Google Gemma)** |
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
