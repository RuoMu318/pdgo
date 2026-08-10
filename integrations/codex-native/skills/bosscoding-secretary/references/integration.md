# Secretary integration

## Authority order

Apply the active system/developer instructions, the nearest project `AGENTS.md`, the user's current instruction, the approved plan version, and the Skill method without allowing a lower layer to expand a higher layer's authority.

When two applicable rules produce different actions, do not silently choose. Explain the concrete conflict and impact, then ask the user whether the project rule should change.

## Start record

The durable task record must carry:

- `goal`
- `confirmed_decisions[]` with source links
- `allowed_objects[]` and `forbidden_objects[]`
- `allowed_actions[]` and `forbidden_actions[]`
- `completion_criteria[]`
- `accepter`
- `current_action`
- exact approved `plan_id` and `plan_version`

Do not rename a project's unique next step to the current task action.

## Existing and new projects

For an existing project:

1. Read the nearest rules and current-state files.
2. Reuse its source-of-truth structure.
3. Never run a project initializer, initialize Git, rewrite package metadata, or install hooks without a separate approved batch.
4. If Git already exists, preserve its workflow; if it does not, assess value before proposing it.

For a new project:

1. Ask about outcome, sensitivity, collaboration, rollback needs, and expected lifetime.
2. Recommend Git when the work will be revised, needs rollback/audit, spans multiple sessions, or benefits from remote recovery.
3. Explain that a private GitHub repository still sends files to a third party, depends on account access, and can accidentally include secrets or large/private material.
4. “No Git” remains valid for disposable, highly sensitive, or tiny one-off work.

Git is a project-level decision, not a per-task ritual. A feature branch is useful for risky or parallel code changes, but “every task must create a branch” is not a universal rule.

## Existing Skills

- `leader`: produce the long-task plan, checkpoints, `PROGRESS.md`, and `BLOCKED.md`.
- `skill-match`: only perform explicit live Skill matching when requested or required by project rules.
- `stay-on-track`: diagnose drift; it does not own the approved baseline.
- `dbs-decision`: record major decisions; it is not the task runtime.
- `boss-flow`: developer delivery mechanics; Git, npm, branches, preview, commit, and merge are conditional on project value and permission.
- `boss-ladder`: local-to-public deployment stages; it does not govern every task.
- `acy` or specialist selectors: help choose a bounded specialist; they do not replace PDGO identity and review gates.

## Closeout

Compare:

- approved baseline versus actual changed objects;
- completion criteria versus evidence;
- prohibited actions versus recorded events;
- project status versus task-system summary.

Report unknowns as unknowns. Only accepted evidence closes the task.
