# Velo

**Fast, persistent AI agent framework** — the better, faster, smarter alternative to OpenClaw and Nanobot.

## Quick Start

```bash
# Option 1: Telegram bot (1 command!)
velo telegram YOUR_BOT_TOKEN

# Option 2: Interactive setup
velo setup
velo chat "Hello!"
```

## Telegram Setup (Easiest)

1. **Get a bot token**: Message [@BotFather](https://t.me/BotFather) on Telegram → `/newbot` → copy token
2. **Run Velo**: `velo telegram 123456:ABC-DEF...`
3. **Chat**: Message your bot on Telegram!

That's it. No config files, no setup wizard.

Each Telegram user gets their own isolated session (`telegram:12345678`).

## All Commands

### Chat & Memory
```bash
velo chat "What's up?"           # Single message
velo chat                         # Interactive REPL
velo remember name=John           # Store fact permanently
velo recall name                  # Retrieve fact
velo history                      # View recent messages
velo sessions                     # List all sessions
velo clear default                # Clear a session's history
```

### Configuration
```bash
velo config show                  # View current config
velo config model openai:gpt-4o-mini    # Change model
velo config key openai sk-xxxxx         # Set API key
velo config personality "You are..."    # Set personality
velo config set agent.name MyBot        # Set any value
```

### Channels
```bash
velo start                        # Start webhook + telegram servers
velo build                        # Build standalone binary
```

## Architecture

| Feature | Implementation |
|---------|----------------|
| **Startup** | ~200ms |
| **Persistence** | SQLite (bun:sqlite) |
| **Memory** | 3-tier (messages, facts, tasks) |
| **Providers** | NVIDIA, OpenAI, Anthropic, OpenRouter, MiniMax, Ollama |
| **Channels** | Webhook (HTTP), Telegram, (Discord/Email ready) |
| **Binary** | 100MB standalone executable |

## Message Management

```bash
# Session-based conversations
velo sessions
  default (17 messages)
  telegram:12345 (5 messages)

# View history
velo history
  [user]: Hello!
  [assistant]: Hi there!

# Clear when needed
velo clear default
```

**Auto-trimming**: Keeps last 50 messages per session (configurable).

**Facts**: Permanent memory injected into every system prompt.

## Memory Command (All Channels)

View your agent's complete memory from anywhere:

**CLI:**
```bash
velo memory
```

**Telegram:**
```
/memory
```

**Webhook API:**
```bash
curl http://localhost:3000/memory
```

**Output:**
```
═════════ AGENT MEMORY ═════════

📌 FACTS (permanent):
  name: John
  timezone: UTC
  preferences: concise responses

💬 SESSIONS:
  default (12 messages)
  telegram:12345 (8 messages)

═══════════════════════════════
```

**Also available:**
- `/clear` on Telegram - clear your conversation history
- `DELETE /session/:id` on webhook - clear a session

## API Server

```bash
velo start
# → Webhook on port 3000

# Chat endpoint
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello!", "session": "user1"}'

# Streaming
curl -X POST http://localhost:3000/chat/stream \
  -H "Content-Type: application/json" \
  -d '{"message": "Tell me a story"}'

# Memory
curl -X POST http://localhost:3000/remember \
  -d '{"key": "timezone", "value": "UTC"}'

curl http://localhost:3000/recall/timezone
```

## Config Files

**velo.toml** (auto-created):
```toml
[agent]
name = "Velo"
personality = "Helpful AI assistant"
model = "nvidia:stepfun-ai/step-3.5-flash"

[providers.nvidia]
api_key_env = "NVIDIA_API_KEY"
base_url = "https://integrate.api.nvidia.com/v1"

[memory]
path = "./data/velo.db"
max_context_messages = 50

[channels.webhook]
enabled = true
port = 3000
```

**velo.env** (API keys):
```
NVIDIA_API_KEY=nvapi-xxx
OPENAI_API_KEY=sk-xxx
```

## Supported Providers

| Provider | Models | Speed | Cost |
|----------|--------|-------|------|
| NVIDIA | stepfun-3.5, llama | ⚡ Fast | 💰 Cheap |
| OpenAI | gpt-4o, gpt-4o-mini | Fast | $$$ |
| Anthropic | claude-3.5-sonnet | Fast | $$$ |
| OpenRouter | all models | Varies | Varies |
| MiniMax | minimax-m2.7 | ⚡⚡ Fastest | 💰 Cheapest |
| Ollama | llama3.2, etc. | Local | Free |

## Comparison

| Feature | OpenClaw | Nanobot | Velo |
|---------|----------|---------|------|
| Startup | 5-10s | <1s | **~200ms** |
| Config | YAML/MD | Complex | **TOML + CLI** |
| Persistence | Checkpoints | None | **Full SQLite** |
| Multi-provider | No | Yes | **Yes** |
| Single binary | No | Yes | **Yes** |
| Memory | Partial | None | **3-tier** |
| Channels | Many | Few | **Extensible** |

## Project Structure

```
velo/
├── src/
│   ├── index.ts        # CLI entry
│   ├── agent.ts        # Core agent logic
│   ├── brain.ts        # LLM interface
│   ├── memory.ts       # SQLite persistence
│   ├── config.ts       # TOML parser
│   ├── scheduler.ts    # Autonomous tasks
│   ├── skills.ts       # Tool loading
│   └── channels/
│       ├── webhook.ts  # HTTP API
│       └── telegram.ts # Telegram bot
├── skills/             # Custom skills
├── data/               # SQLite database
├── dist/               # Compiled binary
├── velo.toml           # Config
└── velo.env            # API keys
```

## License

MIT