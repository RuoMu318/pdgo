# FlowState repository rules

## Scope

This repository defines the FlowState universal project method and its Codex Skill. Keep the core
contracts project-agnostic. Project-specific rules belong under `profiles/` or a consuming repository.

## Required workflow

1. Read the applicable root and nested `AGENTS.md` files.
2. Classify the change as discussion, specification, Skill, schema, documentation, or runtime code.
3. For implementation work, create or update a plan with a descriptive series name and version.
4. Record risks, blockers, assumptions, dependencies, acceptance criteria, and rollback conditions.
5. Do not treat a plan as executable until the user approval contract is satisfied.
6. Validate schema examples and the Skill before declaring completion.

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
