# Hooks

Hooks are optional enforcement points around session start, prompt submission, tool calls, and completion.

The default SessionStart behavior is documented in `docs/skill-routing.md`: classify the project task and select
Skills by scenario before work begins. A consuming project may attach a platform-specific hook, but hooks must not
pretend to approve plans or bypass user authorization.
