# Adapter structure

PDGO keeps one universal contract and offers thin platform adapters. The repository structure reserves the
following locations so that adding a platform does not change the core method:

| Location | Purpose |
|---|---|
| `.codex-plugin/` | Codex plugin manifest and Skill entry point |
| `.claude-plugin/` | Claude-compatible manifest and instructions |
| `.cursor-plugin/` | Cursor-compatible manifest and instructions |
| `.kimi-plugin/` | Kimi-compatible manifest and instructions |
| `.opencode/` | OpenCode-compatible manifest and instructions |
| `.pi/extensions/` | Pi extension adapter boundary |
| `gemini-extension.json` | Gemini extension metadata |
| `CLAUDE.md` / `GEMINI.md` | Platform-local guidance that points back to the core contract |
| `hooks/` | Optional lifecycle enforcement points |
| `scripts/` | Deterministic validation, Skill authoring, and dispatch utilities |

An adapter may translate conversation creation, dispatch, memory lookup, review, or worktree operations. It may
not weaken user approval, scope locking, evidence requirements, or audit identity.

Adapters should return `adapter-unavailable` when a platform cannot support a required operation. They must not
pretend that an unsupported background task, approval, or tool call occurred.

## Runtime dispatcher adapters

`FlowStateDispatcher` is platform-neutral. It stores series, plan versions, tasks, dispatches, reports, reviews,
blockers, and events through `FlowStateStore`, then delegates conversation operations to an adapter.

- `FileQueueAdapter` writes `PLAN_DISPATCH`, report, and review messages to an explicit queue directory. It is the
  auditable fallback when no conversation API is available.
- `CodexAppServerAdapter` maps `thread/start` and `turn/start` calls through an injected request function. It creates
  the two controller threads once for a series, creates task-scoped worker threads, and sends structured messages.
  An optional `receive({ session_id, message_types })` function lets `FlowStateRuntime` poll execution reports and
  independent review decisions and planning blocker opinions from a host transport. If no receive function is injected, the adapter exposes an empty
  receive boundary and makes no claim that a platform message was delivered.

The adapter must return real session identifiers. A failed or unavailable adapter is recorded as a dispatch failure;
the dispatcher never claims that a task or conversation ran when the platform did not confirm it.

When a plan enables the optional authorization policy, the injected host transport or adapter must implement
`attestAuthorization` and return proof bound to the dispatcher-supplied plan id, plan version, immutable boundary
digest, and expiry. The dispatcher does not trust an envelope, `verified` flag, or parent-Agent statement carried in
ordinary JSON. `FileQueueAdapter` intentionally has no authenticated proof channel, so required authorization fails
closed instead of treating a queue file as host attestation.
