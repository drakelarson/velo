# Velo Codebase Guide

> For developers (Zo sessions + human). Not for end users or the Velo agent.

## What Broke Today (2026-04-02) — And How to Avoid It

### 1. Ollama Compaction Crash Loop

**What happened:**
The Ollama-based session compaction feature was crashing the bot repeatedly. Root causes:
- Compaction ran on EVERY session start (even new ones), not just old sessions
- It ran BEFORE the session was properly initialized, causing `messages.map is not a function`
- The 10-minute cooldown wasn't being respected because `lastCompactionTime` was reset to `now` at the top of `process()`, not just after compaction

**How to fix when this happens again:**
```bash
# Quick disable in ~/.velo/config.toml
sed -i '/\[compaction\]/,/enabled/{s/enabled = true/enabled = false/}' ~/.velo/config.toml

# Restart
kill -9 $(pgrep -f "dist/velo"); ./dist/velo telegram
```

**Prevention:**
- Compaction should ONLY trigger after N messages (40+), not on session start
- The cooldown check must be INSIDE the compaction conditional, not outside
- Always test compaction with `velo chat "hi" && velo chat "hi again"` before deploying

### 2. Skill Args Parsing Bug

**What happened:**
Many skills used `args.action || args.args || ""` to get the query. But Rica (the persona model) calls skills with `{ query: "..." }` not `{ action: "..." }`. This meant Rica's tool calls always got "No search query" — causing excessive retries.

**How to fix:**
```typescript
// WRONG (before)
const query = args.action || args.args || "";

// RIGHT (after)
const query = args.query || args.action || args.args || "";
```

Run this to fix all skills:
```bash
find skills -name "*.ts" -exec grep -l "args\.action || args\.args" {} \;
find skills -name "*.ts" -exec sed -i 's/args\.action || args\.args ||/args.query || args.action || args.args ||/g' {} \;
```

### 3. Web Skills Returned Empty Results (Rica Kept Retrying)

**What happened:**
- `web_search` tried to parse JSON from `webserp` output, but `webserp` returns plain text by default
- `reddit_fetch` was completely blocked on Modal infrastructure (network-level block on reddit.com)
- X/Twitter required JavaScript rendering — `web_extract` couldn't fetch it

**How to fix:**
```bash
# web_search: use --json flag
sed -i 's/--json/--json/g' skills/web/web_search.ts

# reddit_fetch: not fixable on Modal — use Zo's read_webpage instead
# X/Twitter: use x_fetch skill (VxTwitter API) instead of web_extract
```

### 4. Compaction Model Override (Ollama for Reflection, Rica for Everything Else)

**What happened:**
The `reflect()` method was calling `brain.think()` WITHOUT the `modelOverride` parameter, so it used Rica instead of free local Ollama. This cost real money on EVERY 3-minute inactivity trigger.

**How to fix:**
```typescript
// WRONG
const result = await this.brain.think(reflectionMsgs, systemPrompt, undefined);

// RIGHT
const result = await this.brain.thinkWithModel(reflectionMsgs, systemPrompt, "ollama:qwen2.5:0.5b", undefined);
```

### 5. Ollama Auto-Install + Pull

**What happened:**
`ollama_manager.ensureReady()` pulls the model EVERY TIME if it doesn't exist. On Modal, this works but is slow (model downloads to ephemeral storage). Also, Ollama binary wasn't installed by default.

**How it works:**
- First Ollama use: auto-installs Ollama binary, pulls `qwen2.5:0.5b`
- Subsequent uses: just checks if running, starts if not
- Model persists in `~/.ollama/` across restarts (if storage is persistent)

### 6. Telegram Channels Not Starting

**What happened:**
`channels.telegram.enabled = false` in `~/.velo/config.toml` — common after config resets.

**How to fix:**
```bash
python3 -c "
content = open('/root/.velo/config.toml').read()
content = content.replace('enabled = false', 'enabled = true', 1)
open('/root/.velo/config.toml', 'w').write(content)
print('Fixed telegram enabled')
"
```

### 7. Log File Not Being Created

**What happened:**
When running via `nohup ./dist/velo &` without redirection, stdout/stderr went nowhere and the `tee` in the wrapper script created an empty file that never got real content.

**How to fix always:**
```bash
nohup ./dist/velo telegram > /tmp/velo_telegram.log 2>&1 &
# Verify
sleep 3 && tail /tmp/velo_telegram.log
```

## Quick Reference

```bash
# Restart bot
kill -9 $(pgrep -f "dist/velo"); sleep 2
cd /home/workspace/velo
nohup ./dist/velo telegram > /tmp/velo_telegram.log 2>&1 &

# Disable compaction
sed -i '/\[compaction\]/,/enabled/{s/enabled = true/enabled = false/}' ~/.velo/config.toml

# Check what's running
ps aux | grep velo | grep -v grep

# Check logs
tail -50 /tmp/velo_telegram.log

# Force restart (if stuck)
pkill -9 -f "velo"; rm -f /tmp/velo_telegram*.log /tmp/velo_telegram.lock
```

## Velo Architecture

```
velo/                    # Root
├── src/                 # Core engine (~20 files)
│   ├── index.ts         # CLI entry point
│   ├── agent.ts         # Main agent, tool loop, reflection
│   ├── brain.ts         # LLM calls (OpenAI-compatible), think(), thinkWithModel()
│   ├── memory.ts        # SQLite: messages, facts, observations, FTS5
│   ├── config.ts        # TOML config loader
│   ├── skills.ts        # Skill loader
│   ├── types.ts         # TypeScript interfaces
│   ├── compactor.ts     # Ollama-based session compression
│   ├── channels/        # Input/output
│   │   ├── telegram.ts  # Telegram bot
│   │   └── webhook.ts    # HTTP webhook
│   └── recovery.ts       # Crash checkpoint system
├── skills/              # Built-in skills (~75 files)
│   ├── system/           # learn, orchestrate, mem-*, cron
│   ├── web/              # web_search, web_extract, x_fetch, reddit_fetch, etc.
│   ├── dev/              # git_*, docker_*, npm_*, pip_list
│   └── ...
├── plugins/             # Local plugins
├── data/                # Runtime data
│   └── velo.db          # SQLite database
└── dist/                # Compiled binary
```

## Key Tables

- `messages` — Session conversation history
- `facts` — Long-term key-value store
- `observations` — Structured learnings (decision, bugfix, feature, etc.)
- `session_summaries` — Cross-session context (user_goal, completed, learned, next_steps)
- `user_prompts` — Prompt history for "What did I ask about X?"
- `user_preferences` — Learned preferences (coffee=black, etc.)
- `usage` — Token usage tracking
- `observations_fts`, `session_summaries_fts`, `user_prompts_fts` — FTS5 search

## Common Patterns

### Tool Execution Loop
```
process(input)
  → buildSystemPrompt() [inject context index + persona]
  → brain.think(messages, systemPrompt, tools)
  → while (toolCalls.length > 0 && iterations < 3):
      → execute skill
      → brain.thinkWithToolResults()
  → return content
```

### Inactivity Reflection Flow
```
3 min silence → triggerReflection(sessionId)
  → build reflection prompt with full history
  → brain.thinkWithModel(reflectionMsgs, "ollama:qwen2.5:0.5b")
  → parse SKIP or observation data
  → store in observations table
  → update session_summaries
```

## Environment

- Config: `~/.velo/config.toml`
- Env: `~/.velo/velo.env`
- Database: `~/.velo/data/velo.db`
- Ollama models: `~/.ollama/`
- Personas: `~/.velo/personas/`

## Dependencies

- `bun:sqlite` — SQLite
- `openai` — OpenAI SDK (all providers)
- `telegraf` — Telegram bot
- `hono` — HTTP framework
- `@google/genai` — Google AI Studio (Gemma)
- `jsonrepair` — Fix malformed JSON from LLMs
