# OpenClaw & Hermes Tool Calling Research

> How mature frameworks handle tool calling + hallucination prevention for local models

## OpenClaw's Approach

### Tool Calling Architecture
- **`createOpenClawTools()`** — Constructs suite of tools (web search, file handling, exec, etc.)
- **Tool registration via hooks** — `before_tool_call` / `after_tool_call` hooks for interception
- **`compat.openaiCompletionsTools`** — Compatibility flag for OpenAI-like models
- **`modelSupportsTools()`** — Detects if local model supports tool calling

### Known Issues with Local Models
| Issue | Root Cause | Fix |
|-------|-----------|-----|
| Simulated tool calls (#45049) | Model outputs tool calls as text instead of executing | Detection + forced tool invocation |
| XML instead of execution (#26942) | API/router misconfiguration | Use OpenAI completions API instead of Ollama native |
| Arguments as strings (#46679, #50689) | JSON strings passed to Ollama instead of objects | `JSON.parse()` before sending |
| Local models hang (#31399, #41871) | Request format mismatch | Use `/v1/chat/completions` not `/api/chat` |

### OpenClaw's Solutions
1. **`supportedParameters` field** — Models declare tool support capability
2. **Argument normalization** — Parse string arguments to objects
3. **Retry mechanisms** — `after_tool_call` hook triggers retries on failure
4. **Forced tool invocation** — Deterministic routing when tool detection fails

---

## Hermes Agent's Approach

### Tool Calling Architecture
- **`model_tools.py`** — Orchestration layer for tool execution
- **Tool registry** — Tools self-register at import time
- **Toolsets** — Group tools by category (web, files, vision, etc.)
- **MCP integration** — External tools via Model Context Protocol

### Key Features
- **Async event loop management** — Persistent loops for thread safety
- **Tool discovery** — Dynamic registration via `tools/` directory
- **Schema validation** — Tools define own schemas + handlers
- **OpenAI-compatible function calling** — Standard format

### Hermes Function Calling Model
- **Fine-tuned model** — `Hermes-Pro` specifically trained for function calling
- **JSON mode** — Structured output for reliable parsing
- **Custom functions** — Users add own via `functions.py`

---

## Hallucination Prevention Techniques

### 1. Prompt Engineering
```
CRITICAL: You MUST ONLY use information from tool results.
If tool returns empty/error, say "I don't have that information."
NEVER invent, assume, or simulate data.
```

### 2. Schema Design
- **Flatten parameters** — Avoid nested objects (40-60% reduction in hallucinations)
- **Consistent notation** — Use `__` or `.` delimiters
- **Truncate responses** — Limit output length

### 3. Grounding
- **Tool output verification** — Compare model response against actual tool result
- **Token-level detection** — Real-time check if each token matches ground truth
- **Internal representations** — Detect hallucinations in forward pass (86.4% accuracy)

### 4. Architecture Patterns
- **Multi-agent validation** — Second agent checks first agent's work
- **Database-driven guardrails** — Rules stored in DB, updated without redeploy
- **Semantic tool routing** — Match user intent to correct tool semantically

---

## What Velo Should Implement

### Immediate Fixes
1. **Argument parsing** — Ensure `arguments` is object, not string
2. **Anti-hallucination prompts** — Explicit grounding instructions
3. **Tool result verification** — Compare response to tool output
4. **Retry on simulation** — Detect text tool calls, force real invocation

### Medium-Term
1. **Tool routing rules** — URL → `url_fetch`, search → `web_search`
2. **Before/after hooks** — Pre/post tool execution validation
3. **Model capability detection** — `modelSupportsTools()` equivalent

### Long-Term
1. **Real-time hallucination detection** — Token-level verification
2. **Multi-agent validation** — Second agent checks output
3. **Fine-tuned model** — Train small model specifically for tool calling

---

## Key Learnings

| Problem | OpenClaw | Hermes | Velo |
|---------|----------|--------|------|
| Simulated tools | Hook detection | Tool registry | ✅ Need to add |
| String arguments | `JSON.parse()` | Schema validation | ✅ Need to add |
| Hallucination | Grounding prompts | Hermes-Pro fine-tuned | ⚠️ Partial |
| Local model support | `compat` flags | OpenAI-compatible | ✅ Using `/v1/chat` |

---

## References

- OpenClaw Issue #45049 — Simulated tool calls
- OpenClaw Issue #46679 — Ollama arguments as strings
- OpenClaw Issue #50689 — Tool loop broken
- Hermes `model_tools.py` — Tool orchestration
- Hermes Function Calling — Fine-tuned model
- arxiv:2601.05214 — Real-time hallucination detection
- Dev.to — 3 Patterns That Fix LLM API Calling