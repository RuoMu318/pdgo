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
| `scripts/` | Deterministic validation and conversion utilities |

An adapter may translate conversation creation, dispatch, memory lookup, review, or worktree operations. It may
not weaken user approval, scope locking, evidence requirements, or audit identity.

Adapters should return `adapter-unavailable` when a platform cannot support a required operation. They must not
pretend that an unsupported background task, approval, or tool call occurred.
