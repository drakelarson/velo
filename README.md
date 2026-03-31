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
| **MCP** | Model Context Protocol (stdio + HTTP) |
| **Compaction** | FREE auto-setup with local Ollama |

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
| MCP Support | Yes | No | **Yes (stdio + HTTP)** |
| Session Compaction | Yes | No | **Yes (FREE local)** |
| Subagents | No | No | **Yes** |
| Plugin System | Yes | No | **Yes (npm-based)** |

## MCP Integration

Velo supports the **Model Context Protocol** (MCP) — use Velo's tools from Claude Desktop, Cursor, or any MCP client.

### Claude Desktop Setup

Add to your Claude config:
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

Now Claude Desktop has access to all 91 Velo tools!

### Connect External MCP Servers

In chat, connect to MCP servers for additional tools:
```
mcp_connect npx -y @modelcontextprotocol/server-filesystem ./data
mcp_connect npx -y @modelcontextprotocol/server-github
```

### HTTP Transport

MCP over HTTP for remote access:
```bash
# List tools
curl http://localhost:3000/mcp/tools

# Call a tool
curl -X POST http://localhost:3000/mcp/call \
  -d '{"tool": "web_search", "args": {"query": "hello"}}'
```

### CLI Commands
```bash
velo mcp start    # Start MCP server (stdio)
velo mcp tools    # List available MCP tools
```

## Session Compaction (FREE)

Velo automatically compresses old messages using **FREE local models** — no API costs!

### How It Works

1. When session hits 40+ messages → triggers compaction
2. Keeps last 10 messages uncompressed
3. Summarizes older messages with **local Ollama** model
4. Stores summary + metadata in SQLite

### Zero Setup Required

Velo handles everything automatically:
- ✅ **Auto-installs Ollama** if not present
- ✅ **Wakes Ollama on demand** (starts service when needed)
- ✅ **Pulls model automatically** (qwen2.5:0.5b, ~500MB)
- ✅ **Zero config needed** — works out of the box

### CLI Commands
```bash
velo compact <session>              # Manual compaction
velo compact test qwen2.5:0.5b      # Test with specific model
velo compact status <session>       # View compaction history
```

### Config (optional)
```toml
[compaction]
enabled = true
model = "qwen2.5:0.5b"       # FREE, ~500MB
trigger_threshold = 40        # Compact at 40 messages
keep_recent = 10              # Keep last 10 uncompressed
```

### Supported Models (all FREE)
| Model | Size | Speed | Use Case |
|-------|------|-------|----------|
| qwen2.5:0.5b | ~500MB | ⚡ Fastest | Compaction |
| qwen2.5:1.5b | ~1GB | Fast | Better summaries |
| llama3.2:1b | ~1.3GB | Fast | General purpose |
| llama3.2:3b | ~2GB | Medium | High quality |

## Subagent Spawning

Spawn independent agents to work in parallel:

```bash
# In chat
spawn_agent "Research the latest AI news and summarize"
spawn_agent "Analyze the codebase and list all TODOs"

# Check status
check_agent subagent_1

# Wait for completion
wait_agent subagent_1
```

Each subagent runs independently with its own session and can use all tools.

## Plugin System (npm-based)

Extend Velo with npm packages or local plugins.

### Create a Plugin

```bash
velo plugin create slack    # Creates plugins/slack/
```

Generates:
```
plugins/slack/
├── package.json       # npm package config
├── velo-plugin.json   # Velo manifest
├── src/
│   └── index.ts       # Your skills
└── README.md
```

### Install Plugins

```bash
# From npm
velo plugin install velo-plugin-slack
velo plugin install @company/velo-plugin-custom

# From local directory
velo plugin install ./my-plugin
```

### Manage Plugins

```bash
velo plugin list              # List installed plugins
velo plugin enable slack      # Enable a plugin
velo plugin disable slack     # Disable a plugin
velo plugin uninstall slack   # Remove a plugin
```

### Plugin Manifest

```json
// velo-plugin.json
{
  "name": "velo-plugin-slack",
  "version": "1.0.0",
  "skills": ["src/index.ts"],
  "env": {
    "SLACK_TOKEN": "Required for Slack API"
  }
}
```

### Publishing to npm

```bash
cd plugins/slack
npm publish
# Users can now: velo plugin install velo-plugin-slack
```

## Multi-Agent Orchestration

Spawn specialized agents that

## Self-Improvement Loop

Velo learns from experience and improves over time:

- **Creates new skills** from repeated successful patterns
- **Enhances existing skills** based on effectiveness
- **Learns user preferences** with confidence scores
- **Tracks skill effectiveness** and suggests improvements

### How It Works

1. **Record outcomes** — After each task, record success/failure
2. **Extract patterns** — Identify reusable approaches from successes
3. **Create skills** — Auto-generate skills after 3+ similar successes
4. **Track effectiveness** — Score skills by success rate
5. **Suggest improvements** — Flag low-effectiveness skills for review

### CLI Commands

```bash
velo learn report              # Show learning progress
velo learn patterns             # List learned skill patterns
velo learn suggest              # Get improvement suggestions
velo learn preference tone concise  # Learn a user preference
```

### In Chat

The agent can learn during conversations:

```
User: I prefer concise responses, no filler
Agent: Got it! I'll remember that.
[Uses learn skill: learn preference:tone=concise]

User: That worked perfectly!
Agent: Great! I'll use this approach for similar tasks.
[Records: outcome=success]
```

### Learned Skills

Auto-created skills are saved to `skills/learned/`:

```
skills/learned/
├── learned_research_summaries_abc123.ts
├── learned_code_review_def456.ts
└── learned_data_analysis_ghi789.ts
```

Each learned skill includes:
- Trigger patterns (regex)
- Typical approach used
- Success patterns from previous executions
- Effectiveness score

### Comparison with Hermes

| Feature | Hermes | Velo |
|---------|--------|------|
| Pattern learning | ✅ | ✅ |
| Skill auto-creation | ✅ | ✅ |
| User preference learning | ✅ | ✅ |
| Effectiveness tracking | ✅ | ✅ |
| Skill enhancement | ✅ | ✅ |
| Learned skills as files | ❌ | ✅ |
| CLI learning commands | ❌ | ✅ |

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
## Built-in Skills (83 Tools)

Velo comes with 83 pre-built skills organized into 10 categories:

### Web (10 tools)
- `web_search` - Multi-engine search (Google, DuckDuckGo, Brave)
- `web_extract` - Extract content from URLs
- `http_request` - Make HTTP requests
- `url_shorten` - Shorten URLs
- `ip_lookup` - IP geolocation
- `dns_lookup` - DNS queries
- `rss_read` - Parse RSS feeds
- `sitemap_parse` - Parse sitemaps
- `robots_txt` - Read robots.txt
- `webhook_create` - Create webhook endpoints

### Files (10 tools)
- `file_read`, `file_write`, `file_append`, `file_list`, `file_delete`
- `file_exists`, `file_stat`, `dir_create`, `file_watch`, `grep`

### System (12 tools)
- `run_command`, `process_list`, `process_kill`, `system_info`
- `cpu_info`, `mem_info`, `uptime`, `hostname`, `whoami`, `date`, `sleep`

### Data (10 tools)
- `json_parse`, `csv_parse`, `csv_query`, `toml_parse`, `xml_parse`
- `diff_json`, `validate_json`, `base64_encode`, `base64_decode`
- `hash_text`, `uuid_generate`

### Productivity (12 tools)
- `weather_get`, `time_now`, `calculator`, `unit_convert`
- `timer`, `stopwatch`, `countdown`, `world_clock`
- `random_number`, `password_gen`, `quote`, `joke`

### Social (8 tools)
- `github_repo_info`, `github_search`, `github_user_info`
- `hackernews_top`, `reddit_hot`, `devto_articles`
- `product_hunt`, `wikipedia`

### Automation (8 tools)
- `schedule_task`, `schedule_list`, `reminder_set`, `reminder_add`, `reminder_list`
- `todo_add`, `todo_list`, `note_save`, `note_list`, `habit_track`

### Dev (10 tools)
- `git_status`, `git_log`, `git_branch`, `git_pull`
- `npm_install`, `pip_install`, `pip_list`
- `docker_ps`, `docker_images`, `docker_logs`, `test_run`

### Media (8 tools)
- `image_info`, `image_resize`, `image_convert`
- `video_info`, `video_thumbnail`
- `audio_info`, `audio_convert`, `pdf_to_text`

### AI (5 tools)
- `text_summarize`, `text_translate`, `code_explain`
- `sentiment_analyze`, `json_extract`

### Creating Custom Skills

Add a `.ts` file to `skills/`:

```typescript
import type { Skill } from "../src/types.ts";

export default {
  name: "my_skill",
  description: "What it does",
  async execute(args: Record<string, unknown>) {
    return "Result";
  },
} as Skill;
```

## Model Pricing (March 2026)

### Local Models (FREE)
| Model | Input | Output | Context |
|-------|-------|--------|---------|
| ollama:llama3.2 | FREE | FREE | 128K |
| ollama:llama4-scout | FREE | FREE | **10M** |
| ollama:llama4-maverick | FREE | FREE | 1M |
| ollama:deepseek-v3 | FREE | FREE | 164K |

### Budget Tier (< $1/M)
| Model | Input | Output | Context |
|-------|-------|--------|---------|
| nvidia:step-3.5-flash | $0.10 | $0.30 | 256K |
| meta:llama-4-scout | $0.08 | $0.30 | **10M** |
| google:gemini-3.1-flash | $0.10 | $0.40 | 1M |
| xai:grok-4.1-fast | $0.20 | $0.50 | 2M |
| deepseek:v3.2 | $0.27 | $1.10 | 164K |
| openai:gpt-5.4-nano | $0.20 | $0.80 | 128K |

### Standard Tier ($1-5/M)
| Model | Input | Output | Context |
|-------|-------|--------|---------|
| openai:gpt-5.4 | $2.50 | $15.00 | 1.05M |
| openai:gpt-5.2 | $1.75 | $14.00 | 400K |
| google:gemini-3.1-pro | $2.00 | $12.00 | 1M |
| xai:grok-4.20 | $2.00 | $6.00 | 2M |
| anthropic:claude-sonnet-4.6 | $3.00 | $15.00 | 200K |
| moonshot:kimi-k2.5 | $0.60 | $2.50 | 262K |

### Flagship Tier ($5+/M)
| Model | Input | Output | Context |
|-------|-------|--------|---------|
| anthropic:claude-opus-4.6 | $5.00 | $25.00 | 200K |
| openai:gpt-5.4-pro | $30.00 | $180.00 | 1.05M |

**Example cost:** 1K input + 500 output tokens
- Budget: ~$0.00025 (0.25μ)
- Standard: ~$0.005 (5m)
- Flagship: ~$0.018 (1.8¢)

```bash
velo models    # Show all 35 models with pricing
velo usage      # Your actual usage with accurate costs
```

## Voice Memo Transcription

Velo transcribes voice messages using local Whisper models - **no API costs!**

### Setup

```bash
# Whisper.cpp is auto-installed on first use
# Models download automatically (tiny: 75MB, base: 142MB)
```

### Usage

**Telegram:**
Just send a voice message - Velo auto-transcribes and responds.

**Chat:**
```
transcribe file="voice_memo.m4a"
transcribe file="meeting.mp3" model="base"  # Better accuracy
```

### Models

| Model | Size | Speed | Accuracy |
|-------|------|-------|----------|
| tiny | 75MB | ~2s | Good for short clips |
| base | 142MB | ~3s | Better accuracy |
| small | 466MB | ~5s | Best quality |

### Supported Formats

mp3, wav, m4a, ogg, flac, webm

### How It Works

1. User sends voice message (Telegram) or provides file path (chat)
2. Velo downloads model if not present
3. whisper.cpp transcribes locally (CPU, no GPU needed)
4. Text returned to conversation

**Privacy**: All processing happens locally - audio never leaves your machine.


## TTS (Text-to-Speech)

Velo responds with voice messages using **Kokoro TTS** - natural, human-like voices with **zero API costs!**

### Setup

```bash
# Kokoro auto-installs on first use (pip install kokoro)
# Models download automatically from HuggingFace (~82MB)
```

### Telegram Usage

```
/voice              # Toggle voice mode ON/OFF
/voice list         # Show all 10 available voices
/voice Emma         # Set voice to Emma (British female)
/voice on           # Enable voice mode
/voice off          # Disable voice mode
/voice exit         - Same as /voice off (disable voice mode)
/status             # Shows current voice mode & selected voice
```

When voice mode is ON, Velo responds with audio messages instead of text.

**Voice preference is saved per user** - set your favorite once and it persists!

### Available Voices

| Voice | Accent | Gender | Style |
|-------|--------|--------|-------|
| bella | American | Female | Natural, warm (default) |
| sarah | American | Female | Clear, professional |
| nicole | American | Female | Friendly |
| sky | American | Female | Soft |
| adam | American | Male | Deep voice |
| michael | American | Male | Conversational |
| emma | British | Female | Elegant |
| isabella | British | Female | Refined |
| george | British | Male | Authoritative |
| lewis | British | Male | Casual |

### CLI Usage

```bash
velo chat "use tts skill with text 'Hello world' and voice bella"
```

### Technical Details

- **Engine**: Kokoro TTS (VITS-based)
- **Model Size**: ~82MB total
- **Speed**: ~0.5s for 5s audio (CPU)
- **Quality**: Natural, human-like speech
- **Languages**: English (more coming)
