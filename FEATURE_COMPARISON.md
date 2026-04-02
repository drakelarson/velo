# Velo vs Other Agent Frameworks — Feature Gap Analysis

Deep research of OpenClaw, ZeroClaw, Nanobot, and Hermes to identify missing features in Velo.

---

## Quick Summary

| Feature | Velo | OpenClaw | ZeroClaw | Nanobot | Hermes |
|---------|:----:|:--------:|:--------:|:-------:|:------:|
| **Core** |
| Lightweight binary | ✅ 100MB | ❌ Heavy | ✅ 9MB | ✅ Python | ✅ Python |
| Low memory | ❌ ~200MB | ❌ Heavy | ✅ <5MB | ✅ ~50MB | ✅ ~50MB |
| Fast startup | ✅ 200ms | ❌ 5-10s | ✅ Fast | ✅ Fast | ✅ Fast |
| Multi-provider | ✅ 12 | ✅ 50+ | ✅ 28+ | ✅ 15+ | ✅ 400+ |
| **Channels** |
| Telegram | ✅ | ✅ | ✅ | ✅ | ✅ |
| WhatsApp | ✅ | ✅ | ✅ | ✅ | ✅ |
| Discord | ❌ | ✅ | ✅ | ✅ | ✅ |
| Slack | ❌ | ✅ | ✅ | ✅ | ✅ |
| Email | ❌ | ✅ | ✅ | ❌ | ✅ |
| Signal | ❌ | ✅ | ❌ | ❌ | ✅ |
| Matrix | ❌ | ❌ | ❌ | ✅ | ❌ |
| iMessage | ❌ | ✅ | ❌ | ❌ | ❌ |
| Webhook | ✅ | ✅ | ✅ | ✅ | ✅ |
| Web Dashboard | ✅ | ✅ | ❌ | ❌ | ❌ |
| Cross-channel messaging | ❌ | ✅ | ❌ | ❌ | ❌ |
| **Memory** |
| SQLite persistence | ✅ | ✅ | ✅ | ✅ | ✅ |
| FTS5 search | ✅ | ✅ | ✅ | ❌ | ✅ |
| Semantic search/RAG | ❌ | ✅ | ✅ | ❌ | ✅ |
| Embeddings | ❌ | ✅ | ✅ | ❌ | ✅ |
| Time-decay weighting | ❌ | ✅ | ❌ | ❌ | ❌ |
| 3-layer memory | Partial | ✅ | ❌ | ❌ | ❌ |
| Memory consolidation | ✅ | ✅ | ❌ | ✅ | ✅ |
| **Agent Features** |
| Subagent spawning | ✅ | ✅ | ❌ | ✅ | ✅ |
| Self-elected continuation | ❌ | ✅ | ❌ | ❌ | ❌ |
| Workflow orchestration | ✅ | ✅ | ❌ | ✅ | ❌ |
| Scheduled tasks/cron | ✅ | ✅ | Partial | ✅ | ✅ |
| Self-improvement | ✅ | ❌ | ❌ | ❌ | ✅ |
| Learning loop | ❌ | ❌ | ❌ | ❌ | ✅ |
| Thinking mode | ❌ | ❌ | ❌ | ✅ | ❌ |
| **Security** |
| Credential broker | ❌ | ✅ | ✅ | ❌ | ❌ |
| Per-agent cost budget | ❌ | ✅ | ❌ | ❌ | ❌ |
| Session lifecycle hooks | ❌ | ✅ | ❌ | ❌ | ✅ |
| **Infrastructure** |
| Docker container | ❌ | ✅ | ✅ | ✅ | ✅ |
| Systemd service | Manual | ✅ | ✅ | Manual | ✅ |
| MCP Server Mode | ✅ | ✅ | ✅ | ✅ | ✅ |
| ACP Server Mode | ❌ | ❌ | ✅ | ❌ | ❌ |
| Profiles (multi-instance) | ❌ | ❌ | ❌ | ❌ | ✅ |
| Fallback provider chain | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Observability** |
| Real-time event stream | ❌ | ✅ | ❌ | ❌ | ❌ |
| Activity visibility | ❌ | ✅ | ❌ | ❌ | ❌ |
| Cost tracking | ✅ | ✅ | ❌ | ❌ | ✅ |
| **Voice/Media** |
| TTS | ✅ | ✅ | ❌ | ❌ | ❌ |
| Voice transcription | ✅ | ✅ | ❌ | ❌ | ❌ |
| Image understanding | ❌ | ✅ | ❌ | ✅ | ✅ |

---

## Critical Missing Features (High Priority)

### 1. **Credential Broker** (Security)
- OpenClaw/ZeroClaw isolate secrets from agent execution context
- Velo exposes API keys in environment variables
- **Impact**: Security risk — credentials could leak via logs, tool outputs

### 2. **Self-Elected Continuation** (Autonomy)
- OpenClaw agents can autonomously schedule their next turn with `CONTINUE_WORK`
- Enables persistent autonomous sessions without external triggers
- **Impact**: Velo requires external cron/scheduler for autonomous loops

### 3. **Semantic Memory / RAG** (Intelligence)
- OpenClaw, ZeroClaw, Hermes have embedding-based semantic search
- Velo only has FTS5 keyword search
- **Impact**: Cannot find conceptually similar memories, only exact matches

### 4. **Real-Time Event Stream** (Observability)
- OpenClaw emits structured JSON events over Unix sockets/TCP
- Enables dashboards, debugging, monitoring
- **Impact**: Hard to debug agent behavior, no visibility into tool calls

### 5. **More Channels**
- Discord, Slack, Email, Signal all missing
- OpenClaw has all of these
- **Impact**: Users limited to Telegram/WhatsApp/Webhook

---

## Important Missing Features (Medium Priority)

### 6. **Cross-Channel Messaging**
- OpenClaw can route messages between channels (Telegram → Discord)
- Velo sessions are bound to originating channel

### 7. **Fallback Provider Chain**
- Hermes has ordered fallback: Primary → Backup → Emergency
- Velo fails if primary provider is down

### 8. **Per-Agent Cost Budget Enforcement**
- OpenClaw can enforce daily/monthly spending caps per agent
- Velo only has observability, no enforcement

### 9. **Session Lifecycle Hooks**
- OpenClaw can run scripts on session start/end/compaction
- Useful for initialization, cleanup, state management

### 10. **Profiles (Multi-Instance)**
- Hermes can run multiple isolated agents with separate configs
- Velo needs separate installations for different agents

---

## Nice-to-Have Features (Lower Priority)

### 11. **Thinking Mode**
- Nanobot has experimental extended reasoning
- Improves complex problem-solving

### 12. **ACP Server Mode**
- ZeroClaw supports Agent Control Protocol for IDE integration
- Alternative to MCP for some clients

### 13. **Image Understanding**
- OpenClaw, Nanobot, Hermes can process images
- Velo is text-only

### 14. **Time-Decay Memory Weighting**
- OpenClaw prioritizes recent memories over old ones
- Improves relevance for long-running agents

### 15. **Dynamic Node Discovery**
- OpenClaw/ZeroClaw can discover external capabilities at runtime
- Enables IoT, mobile, home automation integration

---

## What Velo Has That Others Don't

| Feature | Velo Advantage |
|---------|----------------|
| **Setup Wizard** | Interactive `velo setup` — others require manual config |
| **Built-in Compaction** | FREE local Ollama summarization |
| **my-skills/** | User-installable skills from GitHub |
| **Both .ts + .md skills** | Code skills AND prompt skills |
| **Simple UX** | One-command start: `velo telegram <token>` |
| **Service Commands** | `velo stop/restart/service` built-in |
| **Voice TTS/STT** | Kokoro TTS + Whisper transcription (some have this) |

---

## Recommended Implementation Order

### Phase 1 — Security & Autonomy (Critical)
1. Credential broker — isolate secrets
2. Self-elected continuation — autonomous loops
3. Real-time event stream — observability

### Phase 2 — Intelligence (Important)
4. Semantic memory with embeddings
5. More channels (Discord, Slack)
6. Cross-channel messaging

### Phase 3 — Reliability (Enhancement)
7. Fallback provider chain
8. Per-agent cost budgets
9. Session lifecycle hooks
10. Profiles/multi-instance

---

## Research Sources

- OpenClaw: github.com/openclaw/openclaw
- ZeroClaw: github.com/zeroclaw-labs/zeroclaw
- Nanobot: github.com/HKUDS/nanobot
- Hermes: github.com/NousResearch/hermes-agent