# PDGO repository rules

## Scope

This repository defines the PDGO universal project method and its Codex Skills. Keep the core
contracts project-agnostic. Project-specific rules belong under `profiles/` or a consuming repository.

## Required workflow

1. Read the applicable root and nested `AGENTS.md` files.
2. Classify the change as discussion, specification, Skill, schema, documentation, or runtime code.
3. For implementation work, create or update a plan with a descriptive series name and version.
4. Record risks, blockers, assumptions, dependencies, acceptance criteria, and rollback conditions.
5. Do not treat a plan as executable until the user approval contract is satisfied.
6. Validate schema examples and the Skill before declaring completion.

## Abnormal execution stop escalation

- Normal completion is not an abnormal stop and must not enter the blocker escalation path.
- If execution stops abnormally, the Execution Department must immediately send a formal `BLOCKER_REPORT` to the fixed Planning Department conversation. Every blocker must state its reason, impact, recommended solution, and whether user action is required.
- Planning must record the report and send `PLANNING_BLOCKER_OPINION` to execution. If planning can resolve every blocker without changing the approved contract, it records the resolutions and re-dispatches the stopped task.
- If planning cannot resolve a blocker, it must send `USER_ACTION_REQUIRED` in the planning conversation and keep execution paused until the user resolves it. Silent state changes and silent retries are forbidden.

## Compatibility

- Preserve existing file names and fields when adding fields to a contract.
- New fields must be optional unless the specification explicitly marks them required.
- Prefer additive status values and metadata over renaming existing values.
- Do not remove a legacy field without a migration note and compatibility path.

## Quality and safety

- Do not fabricate execution evidence, test results, or external state.
- Keep examples free of credentials, tokens, private paths, and machine-specific data.
- Keep generated runtime state, caches, logs, and temporary files out of the repository.
- Before commit, inspect staged paths and validate the Skill with `quick_validate.py`.
