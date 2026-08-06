# PDGO Universal Project Method

## 1. Purpose and scope

PDGO is a human-gated, evidence-based method for coordinating project planning, execution,
memory, Skill selection, review, and change audit across independent Agent conversations.

It applies to code, documentation, configuration, research, design, data, release, and operational
work. The core is generic; project profiles provide local paths, tools, roles, Skills, tests, and policy.

## 2. Authority order

```text
system safety
> current user instruction
> project profile
> approved plan version
> department policy
> role card
> Skill instructions
> defaults
```

The active mode is explicit:

```text
discuss-only  analysis and discussion; no side effects
plan-only     planning and review artifacts; no product changes
execute       only approved dispatches may change scoped artifacts
```

Silence is not approval. An Agent cannot impersonate the user or an authorized approver.

## 3. Identifiers

Every project operation carries stable identifiers:

```text
project_id, plan_series_id, plan_version, task_id, session_id,
dispatch_id, artifact_id, skill_id, role_id, review_id, trace_id
```

Plan names use:

```text
PROJECT-YYYYMMDD-NNN-readable-topic-vN
```

The series ID remains stable only when the objective, capability owner, target system, deliverable,
and acceptance lineage remain the same. A changed objective or independently accepted outcome starts a
new series.

## 4. Topology and conversation isolation

```text
project controller
├── planning controller session
│   ├── planning worker sessions
│   ├── research worker sessions
│   └── planning review session
└── execution controller session
    ├── execution worker sessions
    ├── validation worker sessions
    └── execution review session
```

Controllers coordinate. Workers perform bounded work. Reviewers independently evaluate artifacts.
Each worker and reviewer has a separate conversation and receives only the task-local context and artifact IDs it
needs. A series has one persistent planning-controller conversation and one persistent execution-controller
conversation. A version that extends the same series reuses that pair; a genuinely parallel series creates a new
pair, records `parallel_of`, and sends a structured fan-in message to the parent planning conversation. Cross-
department communication uses versioned artifacts and control messages, not copied chat history.

### No-project same-window mode

If no repository, project profile, or product path can be identified, the orchestrator uses an explicit unscoped
project identity and still completes the planning, execution reasoning, and review phases in the current visible
Codex window. The state records preserve the logical departments and approval gates, but no unknown product artifact
may be changed and no external dispatch may be created until a concrete scope and user approval exist. This mode
keeps the workflow usable for research, design, clarification, and method-level changes without pretending that a
project repository or remote worker exists.

## 5. Universal startup routing

At the beginning of every project task, before selecting a domain Skill or changing an artifact, classify:

```text
project
operation: code | docs | config | research | design | data | release | other
department: planning | execution | review | coordination
stage: intake | discovery | design | implementation | validation | release | maintenance
scenario
target artifacts
constraints and exclusions
risk level
mode and approval state
```

The router then:

1. loads applicable global and project guidance;
2. searches project memory indexes;
3. filters Skills by project scope, department, stage, scenario, inputs, prerequisites, and exclusions;
4. selects one primary Skill and optional supporting Skills;
5. records the selection reason and rejected candidates;
6. stops with `skill-unresolved` when no candidate is reliable.

Explicit user Skill selection wins when it is compatible. An incompatible selection is reported before work.

## 6. Role cards

Each role card defines:

```text
role_id
department
mission
applicable_scenarios
allowed_operations
forbidden_operations
required_inputs
expected_outputs
workflow
acceptance_criteria
failure_policy
success_metrics
```

The role catalog may contain planners, researchers, architects, implementers, testers, reviewers,
release coordinators, and change recorders. Names are labels; scenario and output contracts determine use.

## 7. Conversation memory

Every session stores separate records for:

```text
instruction
context
checkpoint
dispatch
result
summary
decisions
references
status
```

At start, record the immutable instruction, mode, project, department, scope, parent session, and plan.
During work, record checkpoints, artifacts, decisions, new risks, and new blockers. At close, record the
result, summary, unresolved items, references, and next action.

Memory status values include:

```text
approved | accepted | reference | draft | unverified | superseded | blocked
```

Index first. Read candidate summaries before source turns. Record every cross-session read in the current
session's references. Never treat a draft or unverified note as an execution fact.

## 8. Plan requirements

Every plan contains:

```text
goal and non-goals
project goal and observable target outcome
allowed modification scope and explicitly excluded scope
detail policy: do not deepen implementation detail without a user request or approved plan change
brainstorming discovery record and decisions
planning policy, including in-scope correction and revision limits
current state
inputs and sources
assumptions and constraints
technical or operational approach
task ledger and dependencies
ordered stages with serial/parallel policy and stage-level Skills/agents
serial/parallel policy
acceptance criteria and evidence
risks and mitigations
blockers and resolution
questions/decisions
permissions and allowed paths
rollback and stop conditions
residual uncertainty
user approval request
declared next_plan template, if any
```

The planning controller must make the goal, target outcome, modification scope, excluded scope, and detail policy
explicit before asking for approval. These fields are auditable boundaries, not suggestions.

The plan index records the title, one-sentence summary, search terms, knowledge domains, status,
related sessions, tasks, dependencies, and current version.

## 9. Risk and blocker gates

Each risk records its category, cause, probability, impact, severity, mitigation, contingency, owner,
trigger, rollback, and user decision. Each blocker records its dependency, impact, owner, required decision,
resolution, and status.

Required statuses:

```text
open
resolved
```

If a section has no entries, the plan must state `none` and explain the basis. Unknown risks cannot be
claimed away; residual uncertainty must be visible and acknowledged.

## 10. Mandatory user approval

Planning review is not user approval. A plan must enter `awaiting-user-approval` and present:

- scope and non-goals;
- all known risks and their treatment;
- all blockers and their disposition;
- assumptions and dependencies;
- permissions and external effects;
- acceptance and rollback conditions;
- residual risks and unknowns;
- conditions for automatic dispatch.

The user approval record is bound to `plan_id + plan_version`. Valid decisions are:

```text
approved
approved-with-conditions
rejected
revision-required
```

Hard blockers remain non-executable until resolved or an explicit policy exception changes the scope.
An approved-with-conditions plan may dispatch only after every condition is machine-checkable and true. A blocker is
not conditionally accepted: it must be resolved with recorded evidence before execution or automatic progression.

## 11. Version locking and change control

An approved plan version is immutable. Any material change to scope, architecture, dependency, risk,
acceptance, permission, or rollback creates a new version in the same series and invalidates the old approval.

New risks or blockers discovered during execution pause automatic progression and return the task to planning. High
or critical risks immediately clear the current approval; any risk or blocker must be dispositioned before correction,
dependent-task unlock, completion, or next-plan creation can continue. The user must re-review and approve a new
version whenever the change is outside the approved contract.

Any new risk, blocker, permission change, acceptance change, architecture change, rollback change, or material
scope change invalidates the current approval for automatic progression. An open blocker, including one discovered
in a report or review, prevents correction dispatch, dependent-task unlock, plan completion, and next-plan creation.
The blocker must have an explicit resolution and evidence before the plan can return to `approved`.

An in-scope correction is limited to redoing omitted approved work, repairing a defect, or using another
implementation method without changing the approved contract. It may reuse the current version when no new risk or
blocker exists, the approval still matches, and the revision limit is not exceeded. A correction outside those bounds
returns to planning and requires a new version and user approval. A task accepted with a new risk or blocker does not
make the plan `completed` and cannot create or dispatch `next_plan`.

## 12. Dispatch and execution

Only the execution controller can dispatch an approved task. It must verify the plan version, approval,
conditions, dependencies, Skill prerequisites, allowed paths, forbidden operations, and stop conditions.

Execution workers must:

- stay within the approved scope;
- use the required workflow Skill for the scenario;
- use isolated workspaces for concurrent writes;
- test or validate according to the acceptance contract;
- report actual changes, evidence, assumptions, deviations, new risks, and blockers;
- mark `blocked` instead of guessing when inputs are insufficient.

## 13. Review and acceptance

Workers never self-approve. Reviewers compare the result with the exact acceptance criteria and evidence.
The execution report returns to planning. Planning accepts, revises, blocks, or closes the task. Only an
accepted task unlocks its dependents. High-impact releases require an additional user acceptance gate.

### Planning controller responsibilities

The planning controller works with the user to clarify the objective and owns the full plan lifecycle. For a long
plan it creates ordered stages, classifies each stage as `serial` or `parallel`, and assigns stage-level Skills and
agent selectors. A serial stage must be accepted before a later stage becomes active. A parallel stage may dispatch
only independent tasks with no shared mutable writes, bounded by `max_parallel`; each result is reviewed and the
stage is not complete until its fan-in conditions pass.

After each execution report the controller performs or requests independent acceptance and classifies the result:

```text
accepted          -> record evidence and activate the next ready stage/task
revision-required -> issue an in-scope correction and repeat execution/review
blocked/failed    -> wait for resolution, retry within policy, or return to planning
```

An in-scope correction means redoing an omitted approved item, repairing a defect, or changing the implementation
method without changing the approved contract. It may reuse the same plan version while the approval is valid, no
new risk or blocker exists, and the revision limit is not exceeded. A new risk, blocker, permission, acceptance,
architecture, rollback, or scope change, or an explicit reapproval request, stops the loop and requires a new plan
version and user approval. The controller continues correction and review until acceptance or a stop condition;
it cannot skip an unsuccessful correction or proactively expand detail.

When every task is accepted and no blocker is open, the controller may prepare the declared `next_plan` in the same
series. Preparing it does not approve it: the new version remains `awaiting-user-approval` and cannot dispatch.

Brainstorming is a planning discovery aid for alternatives, assumptions, risks, questions, and trade-offs. It must
converge into explicit scope and acceptance, cannot modify product artifacts, cannot grant approval, and cannot
clear a blocker.

## 14. Series continuity and serial/parallel execution

The series ID is the continuity key:

```text
same plan_series_id + extension -> reuse planning_session_id and execution_session_id
parallel plan                  -> new plan_series_id and new controller sessions
parallel completion             -> PARALLEL_PLAN_SYNC to parent planning session
```

An extension may add a new immutable plan version, tasks, or evidence while preserving the objective, owner,
target system, and acceptance lineage. A material change still requires a new version and approval. It does not
create a new controller conversation. A parallel plan is an independently executable branch with no unsafe shared
mutable writes; its worker reports are reviewed in the branch and synchronized only after acceptance.

## 15. Serial and parallel execution

Serial execution is the default. Parallel fan-out is allowed only for independent tasks with no shared
mutable writes, no hidden dependency, and separate workspaces. A fan-in review must reconcile outputs before
dependent tasks are unlocked.

Stage contracts use `stage_id`, `order`, `kind`, `required_skills`, `agent_selectors`, and optional stage acceptance
criteria. Tasks carry `stage_id`, `stage_order`, and `stage_kind`. The dispatcher activates only the earliest
unfinished stage; parallel capacity is bounded and later stages remain pending until the active stage is accepted.

## 16. Evidence and completion

Evidence may include test logs, build output, diffs, screenshots, runtime observations, measurements,
source references, reproduction steps, and rollback checks. A self-reported success without evidence cannot
be marked `completed`.

## 17. Git and audit

Every completed change is linked to project, plan, version, task, session, dispatch, files, tests, and commit
when applicable. Before commit, inspect status, stage only current task paths, scan for secrets and oversized
files, and record known risks or deviations. External pushes and destructive operations follow project approval
policy.

## 18. Failure and recovery

Failures must state the attempted actions, observed evidence, cause hypothesis, remaining uncertainty, and next
decision. Retry limits are project-configurable; the default is two attempts before escalation. Never loop
indefinitely or silently switch scope.

## 19. Security and least privilege

Tasks specify allowed paths, commands, network policy, external effects, and secret handling. Secrets never enter
ordinary memory or examples. A project profile cannot weaken system safety or override a current user instruction.
