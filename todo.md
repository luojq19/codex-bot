# Todo

- [x] Implement a Codex app-server thread runtime for persistent Discord conversations.

# Details

## Implement a Codex app-server thread runtime for persistent Discord conversations.

Replace the current one-shot `codex exec` path with a session-aware runtime inspired by OpenClaw's Codex app-server design.

Key notes:
- Introduce an `LLMRuntime` abstraction with the current `CodexExecRuntime` as fallback and a new `CodexThreadRuntime` for persistent conversations.
- Bind each Discord conversation key, such as `discord:<channelId>:<userId>`, to a durable Codex thread id.
- Start a new thread when no binding exists, resume the existing thread on later turns, and persist bindings across bot restarts.
- Keep skill and scheduled task execution separate from interactive Discord conversation threads; scheduled workflows can use isolated task-scoped threads later.
- Investigate whether the installed Codex CLI exposes app-server/thread APIs locally before implementation; if not, evaluate `codex exec resume <sessionId>` as an intermediate option.
- Preserve memory as a separate layer: active memory should inject compact recall context into a thread turn, not replace thread persistence.
