# Velo Codebase Guide

> For developers (Zo sessions + human). Not for end users or the Velo agent.

## Quick Reference

```
velo/                    # Root directory
├── src/                 # Core engine (~20 files)
│   ├── index.ts         # CLI entry point, command routing
│   ├── agent.ts         # Main Agent class (memory, skills, inactivity tracking)
│   ├── brain.ts         # LLM API calls (OpenAI-compatible), tool call parsing
│   ├── memory.ts        # SQLite persistence (messages, facts, observations, FTS5)
│   ├── config.ts        # TOML config loader, env loading
│   ├── skills.ts        # Skill loader (local + plugins)
│   ├── types.ts         # TypeScript interfaces (Config, Skill, Message, Tool)
│   ├── orchestration.ts # Multi-agent workflows (Coordinator, Researcher, etc.)
│   ├── subagent.ts      # Parallel task spawning
│   ├── compactor.ts     # Ollama-based session compression
│   ├── scheduler.ts     # Cron-like autonomous tasks
│   ├── lock.ts          # Process locking (prevent multiple instances)
│   ├── recovery.ts      # Crash checkpoint system
│   ├── mcp.ts           # Model Context Protocol server/client
│   ├── plugins.ts       # npm plugin system (velo-plugin-*)
│   ├── pricing.ts       # Model cost calculations
│   └── channels/        # Input/output channels
│       ├── telegram.ts  # Telegram bot (Telegraf)
│       ├── webhook.ts   # HTTP API (Hono)
│       ├── discord.ts   # Discord bot (partial)
│       ├── whatsapp.ts  # WhatsApp bridge
│       └── email.ts     # Email channel
├── skills/              # Built-in skills (~80 files, 10 categories)
│   ├── system/          # Core: learn, orchestrate, subagent, memory tools
│   ├── files/           # file_read, file_write, grep, file_watch
│   ├── web/             # http_request, web_search, dns_lookup
│   ├── data/            # csv_query, json_parse, base64, hash
│   ├── dev/             # git_*, docker_*, npm_install, test_run
│   ├── media/           # transcribe, tts, image_*, video_*
│   ├── automation/      # todo_*, reminder_*, schedule_list
│   ├── productivity/    # calculator, time_now, weather_get
│   ├── social/          # github_*, hackernews, reddit, wikipedia
│   └── browser.ts       # Puppeteer browser control
├── plugins/             # Local plugins (not npm packages)
│   └── slack/           # Example: Slack plugin
├── bridge/              # WhatsApp Go bridge
├── dashboard/           # Web UI (WIP)
├── data/                # Runtime data
│   ├── velo.db          # Main SQLite database
│   ├── velo_recovery.db # Crash checkpoints
│   └── velo_checkpoint.db
├── temp/                # Temporary files (audio, etc.)
├── dist/                # Compiled binary output
└── models/              # Local model files (piper TTS)
```

## Core Architecture

### Agent Class (`src/agent.ts`)

The main orchestrator. Key responsibilities:

1. **Session Management**
   - `setSession(id)` - Switch between conversation contexts
   - `process(input)` - Main entry point for user messages
   - `trackActivity(sessionId)` - Inactivity tracking (3 min timeout → reflection)

2. **Memory Integration**
   - Uses `Memory` class for all persistence
   - Injects context index at session start (progressive disclosure)
   - Records observations via `observe()` method

3. **Tool Execution Loop**
   - Builds system prompt with facts + context index
   - Calls `Brain.think()` with messages + tools
   - Executes tool calls, loops until no more tools
   - Tracks token usage per session

4. **Inactivity Reflection**
   - Background checker runs every 30s
   - After 3 min silence, calls `reflect(sessionId)`
   - Analyzes conversation, extracts observation
   - Stores in `observations` table

**Key methods:**
```typescript
agent.process(input)           // Main message processing
agent.remember(key, value)     // Store fact
agent.recall(key)              // Retrieve fact
agent.observe(type, title, narrative)  // Record observation
agent.getHistory()             // Get session messages
agent.close()                  // Cleanup (stops inactivity checker)
```

### Brain Class (`src/brain.ts`)

LLM abstraction layer. OpenAI-compatible API calls.

- Handles multiple providers via `provider:model` format
- Parses tool calls from API response (OpenAI native) or XML fallback
- `think()` - Single completion
- `thinkWithToolResults()` - Continue after tool execution

### Memory Class (`src/memory.ts`)

SQLite-backed persistence. Key tables:

```sql
messages           -- Session conversation history
facts              -- Long-term key-value store
observations       -- Structured learnings (decision, bugfix, feature, etc.)
session_summaries  -- Cross-session context
user_prompts       -- Prompt history for "What did I ask about X?"
user_preferences   -- Learned user preferences (coffee=black, etc.)
usage              -- Token usage tracking
compaction_summaries -- History of session compressions
```

**FTS5 Virtual Tables:**
- `observations_fts` - Full-text search over observations
- `session_summaries_fts` - Search session summaries
- `user_prompts_fts` - Search prompt history

**Progressive Disclosure:**
- `generateContextIndex(limit)` returns ~800 token summary of recent observations
- Agent decides what's relevant, fetches details on-demand
- ~10x token savings vs dumping all context

### Config System (`src/config.ts`)

- TOML format at `~/.velo/config.toml`
- Env file at `~/.velo/velo.env` (API keys)
- Auto-creates default config if missing

**Config structure:**
```toml
[agent]
name = "Velo"
model = "nvidia:stepfun-ai/step-3.5-flash"

[providers.nvidia]
api_key_env = "NVIDIA_API_KEY"
base_url = "https://integrate.api.nvidia.com/v1"

[memory]
path = "~/.velo/data/velo.db"

[channels.telegram]
enabled = true
token_env = "TELEGRAM_TOKEN"
```

### Skill System (`src/skills.ts`)

Skills are self-contained tools. Each skill:

```typescript
// skills/example.ts
export default {
  name: "skill_name",
  description: "What this skill does (shown to LLM)",
  async execute(args: Record<string, unknown>): Promise<string> {
    return "Result string";
  },
} as Skill;
```

**Loading:**
1. Walks `skills/` directory recursively
2. Imports all `.ts` files with default export
3. Also loads from `plugins/` and npm `velo-plugin-*` packages

**Built-in Skills:**
- `learn` - Store user preferences
- `orchestrate` - Multi-agent workflows
- `subagent_spawn` - Parallel task delegation
- `mem-search`, `mem-get`, `observe` - Memory tools
- 80+ others across 10 categories

### Channels (`src/channels/`)

Each channel is a message source:

| Channel | Protocol | Key File |
|---------|----------|----------|
| Telegram | Bot API (Telegraf) | `telegram.ts` |
| Webhook | HTTP (Hono) | `webhook.ts` |
| Discord | Bot API | `discord.ts` |
| WhatsApp | Go bridge | `whatsapp.ts` |
| Email | IMAP/SMTP | `email.ts` |

**Session ID format:** `{channel}:{user_id}`
- Telegram: `telegram:5967460976`
- Webhook: `webhook:session_name`

### Orchestration (`src/orchestration.ts`)

Multi-agent workflows with specialized roles:

**Roles:** Coordinator, Researcher, Writer, Coder, Reviewer, Analyst

**Patterns:**
- `sequential` - A → B → C
- `parallel` - A, B, C simultaneously
- `consensus` - Multiple agents vote
- `debate` - Pro vs con arguments
- `review-loop` - Create → Review → Revise

**Workflows:** `research_report`, `code_feature`, `parallel_analysis`, etc.

### Subagent System (`src/subagent.ts`)

Spawn child agents for parallel tasks:
- Max concurrent: 3 (configurable)
- Timeout: 60s default
- Skills inherited from parent

### Compactor (`src/compactor.ts`)

Session compression using local Ollama:
- Auto-installs Ollama if missing
- Pulls model on first use (default: qwen2.5:0.5b)
- Triggers at 40+ messages
- Keeps last 10 messages, summarizes rest

### Scheduler (`src/scheduler.ts`)

Cron-like autonomous tasks:
```toml
[[scheduler.tasks]]
name = "daily_summary"
interval = "24h"
prompt = "Summarize recent activity"
```

### MCP Support (`src/mcp.ts`)

Model Context Protocol for Claude Desktop integration:
- Server mode: `velo mcp start` (stdio transport)
- Client mode: Connect to external MCP servers
- All skills exposed as MCP tools

### Plugin System (`src/plugins.ts`)

npm-based extensibility:
- Package name: `velo-plugin-*` or `@scope/velo-plugin-*`
- Manifest: `velo-plugin.json` or `package.json` with `velo` key
- Local plugins in `plugins/` directory

## Database Schema

**Key relationships:**
```
session_summaries ─┐
                    │
observations ───────┼── FTS5 search
                    │
user_prompts ───────┘

messages ← session_id → session_summaries
facts (standalone key-value)
user_preferences (learned from chat)
```

## Important Patterns

### Inactivity Tracking Flow
```
User message → agent.process() → trackActivity(sessionId)
     ↓
[3 min silence]
     ↓
Inactivity checker → triggerReflection(sessionId)
     ↓
reflect() → Brain analyzes conversation → addObservation()
```

### Tool Execution Loop
```
process(input)
  → buildSystemPrompt() [inject context index]
  → brain.think(messages, tools)
  → while (toolCalls.length > 0):
      → execute skill
      → add tool result to messages
      → brain.thinkWithToolResults()
  → return content
```

### Memory Progressive Disclosure
```
Session start:
  memory.generateContextIndex(30) → ~800 tokens
  Agent sees: "📋 RECENT CONTEXT (30 observations)"
  
Agent needs detail:
  mem-search "auth bug" → FTS5 query
  mem-get 42 → Full observation details
```

## Common Gotchas

1. **Database path mismatch**: Config uses `~/.velo/data/velo.db`, not `./data/velo.db`. Skills that open their own DB connection must use `os.homedir() + "/.velo/data/velo.db"`.

2. **Env loading**: `loadConfig()` loads env from `~/.velo/velo.env`. Direct `bun run` won't auto-load it.

3. **Lock files**: `/tmp/velo-locks/{channel}.lock`. Stale locks if process crashes - delete manually or use `pkill -f velo`.

4. **Telegram dropPendingUpdates**: Set to `false` to process queued messages on startup.

5. **Inactivity only in long-running mode**: CLI commands like `velo chat "msg"` exit immediately, no time for reflection. Only works with `velo telegram`, `velo start`, or interactive REPL.

6. **Skill args parsing**: Skills receive `args.action` as the main parameter. Some skills also check `args.args` for backward compatibility.

## File Sizes (approx)

| Component | Files | Lines |
|-----------|-------|-------|
| Core src/ | 20 | ~4,000 |
| Skills | 80+ | ~2,000 |
| Channels | 5 | ~1,000 |
| Total | ~105 | ~7,000 |

## Key Dependencies

- `bun:sqlite` - SQLite (sync, zero-config)
- `openai` - OpenAI SDK (used for all providers)
- `telegraf` - Telegram bot
- `hono` - HTTP framework
- `@modelcontextprotocol/sdk` - MCP support
- `jsonrepair` - Fix malformed JSON from LLMs

## Testing Patterns

```bash
# Test agent with memory
velo chat "What did we work on recently?"

# Test memory search
velo memory search "auth bug"

# Test inactivity (must wait 3 min)
velo telegram <token>  # Long-running process

# Test orchestration
velo orchestrate run research_report "AI in 2026"

# Test compaction (requires Ollama)
velo compact test ollama:qwen2.5:0.5b
```

## Recent Changes (2026-04-01)

1. **Added inactivity tracking** - 3 min timeout → reflection → observation
2. **Added FTS5 search** - Full-text search over observations, summaries, prompts
3. **Added progressive disclosure** - Context index at session start (~800 tokens)
4. **Fixed user_preferences table** - Now created in memory.ts init
5. **Fixed learn.ts DB path** - Uses `~/.velo/data/velo.db`
6. **Enhanced reflection** - Extracts user_goal, completed, next_steps, message_count
7. **Session summaries injection** - Recent 5 summaries injected into system prompt
8. **Removed skill duplication bug** - Skills were listed TWICE (categories + full list)
9. **Compressed system prompt** - Skill list now comma-separated (~200 tokens, down from ~5,000)

## TODO / Known Issues

- Dashboard UI incomplete
- Discord channel minimal
- Email channel untested
- Crash recovery not auto-triggered (manual `/recover` needed)
- Session compaction not automatic (only manual via CLI)