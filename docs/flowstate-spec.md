# FlowState Universal Project Method

## 1. Purpose and scope

FlowState is a human-gated, evidence-based method for coordinating project planning, execution,
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
Each node has a separate conversation and receives only the task-local context and artifact IDs it needs.
Cross-department communication uses versioned artifacts and control messages, not copied chat history.

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
current state
inputs and sources
assumptions and constraints
technical or operational approach
task ledger and dependencies
serial/parallel policy
acceptance criteria and evidence
risks and mitigations
blockers and resolution
questions/decisions
permissions and allowed paths
rollback and stop conditions
residual uncertainty
user approval request
```

The plan index records the title, one-sentence summary, search terms, knowledge domains, status,
related sessions, tasks, dependencies, and current version.

## 9. Risk and blocker gates

Each risk records its category, cause, probability, impact, severity, mitigation, contingency, owner,
trigger, rollback, and user decision. Each blocker records its dependency, impact, owner, required decision,
resolution, and status.

Required statuses:

```text
open
resolved with evidence
accepted non-blocking with owner and impact
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
An approved-with-conditions plan may dispatch only after every condition is machine-checkable and true.

## 11. Version locking and change control

An approved plan version is immutable. Any material change to scope, architecture, dependency, risk,
acceptance, permission, or rollback creates a new version in the same series and invalidates the old approval.

New high-impact risks or blockers discovered during execution pause the task, return it to planning, and
require re-review and user approval before continuation.

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

## 14. Serial and parallel execution

Serial execution is the default. Parallel fan-out is allowed only for independent tasks with no shared
mutable writes, no hidden dependency, and separate workspaces. A fan-in review must reconcile outputs before
dependent tasks are unlocked.

## 15. Evidence and completion

Evidence may include test logs, build output, diffs, screenshots, runtime observations, measurements,
source references, reproduction steps, and rollback checks. A self-reported success without evidence cannot
be marked `completed`.

## 16. Git and audit

Every completed change is linked to project, plan, version, task, session, dispatch, files, tests, and commit
when applicable. Before commit, inspect status, stage only current task paths, scan for secrets and oversized
files, and record known risks or deviations. External pushes and destructive operations follow project approval
policy.

## 17. Failure and recovery

Failures must state the attempted actions, observed evidence, cause hypothesis, remaining uncertainty, and next
decision. Retry limits are project-configurable; the default is two attempts before escalation. Never loop
indefinitely or silently switch scope.

## 18. Security and least privilege

Tasks specify allowed paths, commands, network policy, external effects, and secret handling. Secrets never enter
ordinary memory or examples. A project profile cannot weaken system safety or override a current user instruction.
