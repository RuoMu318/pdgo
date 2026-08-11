# Secretary integration

This reference is loaded only for high-assurance mode or an explicit secretary or BossCoding entry. Lightweight and standard modes do not load the secretary, this reference, PDGO state, formal plans, governance prompts, or role processes, and do not add PDGO approval rounds.

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

## Role selection and one exact approval

Before formal work starts, show the user a Chinese `本次用人卡`. For each role, the first mention uses `中文名（English exact host type）`; later mentions may use only the Chinese name. State its `用途`, `为何选中`, `范围`, and `权限`. The card explains the drafted or approved assignment and never creates approval.

When the user asks for `能力图` or `为什么选它`, read the catalog verifiable at query time and use this fixed query and selection order: the host's currently available roles, the currently installed and available Persona and Skill catalog, then the manifest hash-verified external Agent catalog. Query the relevant live sources before answering. The answer does not hard-code role or Persona counts or a complete inventory, and does not expose internal IDs. README, cache, memory, and static excerpt are reference clues, not real-time sources.

The secretary first performs the zero-write runtime inspection. It then drafts in memory the five execution-baseline fields, exact `plan_id + plan_version`, exact project-state root, planning/execution/review role assignments, allowed files, prohibited actions, and validation batch before any state write or subagent starts. `acy` only selects roles; it is not approval and its prose cannot authorize a call, write, or external action.

Present that complete batch once. One exact user approval covers creation of the isolated project-state root, the declared planning, execution, and review subagents, and the declared implementation and validation. After approval, ensure the state root, persist the exact drafted plan, record the matching approval, and explicitly invoke `$pdgo-codex-native-bridge`; do not wait for implicit bridge routing. Every BossCoding state action then uses the installed resolver's `invoke` entry so the runtime is revalidated and the project state root is recomputed instead of accepted from caller input. Direct dispatcher CLI remains a separately selected legacy PDGO interface. If persistence would alter the drafted plan body, stop and show the changed version instead of borrowing the prior approval.

The approved planning subagent validates or refines the frozen plan. Continue without another question only when the goal, scope, permissions, accepter, external actions, material risks, role assignments, and Persona modes remain materially unchanged. Otherwise create a higher plan version and request a new exact approval.

Record Codex `agent_type` in `role_assignments[].host_agent_type`. Every new BossCoding plan uses `role_contract.version: bosscoding-v2` and complete planning/execution/review assignments. `legacy-v1` is allowed only for a migrated old plan carrying `migration: role-assignments-not-recorded`; it is not a new-task fallback. Keep PDGO `external_agent_id` in the existing external-Agent selector contract. Never infer, copy, or convert one identifier into the other by display-name similarity.

Every governed bind carries two different records. `host_agent_type` is recorded by the main Agent from the actual `spawn_agent.agent_type` argument. `selection_source` is the approved role-selection provenance from the plan, such as `approved-role-selection:acy`; it is not a `spawn_agent` argument. Neither value is a cryptographic or host-independent proof: the dispatcher only checks exact consistency among the approved plan, the main Agent's binding input, and persisted state. Child prose, self-description, and task names are never sources for either field. A bound session's `host_agent_type` is immutable; changing the role type requires a new session or plan series.

Execution `permission_mode` is exactly `read-only` or `approved-scope-write`, and a read-only execution assignment cannot carry modification `allowed_paths`. This is a governance and dispatch boundary, not an OS sandbox; current Codex permissions, project rules, and user approval must enforce the actual read/write boundary.

Persona Skills belong in `method_lenses`, not `role_assignments`. Lens is the default; Voice and Rehearsal require `explicit_opt_in: true`. Their authority is always `advisory`, they cannot apply to review, and they cannot supply identity, permissions, acceptance, or facts. `applies_to` is limited to `planning`, `execution`, an actual task id, or `task:<actual-task-id>`. A separate functional reviewer may inspect their advisory output but must decide from the approved criteria and evidence.

`method_lenses` may preserve `purpose` and `evidence_cutoff` so the worker knows why the lens applies and where its dated evidence ends. These fields remain context, not authority.

User-facing examples:

- `秘书，用 acy 选合适专家完成登录修复，并用 $munger 的 Lens 检查可避免的权限漏洞。`
- `秘书，按 BossCoding 做这项长程任务；acy 负责选角色，$munger 只用 Lens，不要 Voice。`
- `$nuwa-skill` is reserved for creating, updating, or auditing a Persona Skill; ordinary work invokes the installed Persona Skill itself.

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
- `acy` or specialist selectors: help choose a bounded specialist; they do not approve calls or replace PDGO identity and review gates.

## Closeout

Give the user a Chinese `实际贡献卡`: state the `实际贡献` of each `角色和 Lens` separately. When an entry added no material value, write `没有实质价值` instead of crediting mere participation.

Persist capability learning only when evidence from the current run proves it effective and it is reusable across tasks. Prefer updating an existing knowledge note; do not create empty directories or static capability directories.

Compare:

- approved baseline versus actual changed objects;
- completion criteria versus evidence;
- prohibited actions versus recorded events;
- project status versus task-system summary.

Report unknowns as unknowns. Only accepted evidence closes the task.
