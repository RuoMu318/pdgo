# PDGO / FlowState

**Language:** English (default) | [简体中文](README.zh-CN.md)

PDGO means **Project Development Governance Orchestrator**. It is the reference implementation of **FlowState**, a human-gated, evidence-based project method for Codex and other tool-using agents.

FlowState turns a request into a governed chain of planning, execution, review, memory, and audit records. It is deliberately project-agnostic: a consuming project supplies its repository profile, local rules, Skills, paths, tools, and tests.

## What PDGO provides

PDGO is designed for work that must remain understandable after a long conversation, a restart, a handoff, or a failed task.

- Scenario-based Skill routing instead of name-only matching.
- A planning department that records scope, non-goals, tasks, dependencies, risks, blockers, evidence, rollback, and residual uncertainty.
- An execution department that receives one exact, version-locked task at a time.
- A review department that checks evidence independently and controls dependent-task unlocks.
- User approval bound to the exact `plan_id + plan_version`.
- Conversation-first memory with plan, session, and knowledge indexes.
- Stable plan-series continuity for extensions and explicit isolation for parallel branches.
- Auditable dispatch, report, review, retry, blocker, and failure events.
- Platform adapters for a local file queue and an injected Codex App Server transport.
- A restart-safe runtime with one-shot recovery and opt-in continuous watching.

## Core lifecycle

```text
project intake
  -> classify operation, department, stage, scenario, risk, and mode
  -> load project rules and search memory indexes
  -> select Skills by scenario, boundaries, inputs, outputs, and prerequisites
  -> write a descriptive plan series and version
  -> review risks, blockers, dependencies, evidence, and rollback
  -> request explicit user approval for the exact plan version
  -> dispatch one ready task to execution
  -> collect an execution report
  -> send the report to planning for independent acceptance
  -> accept, revise, block, or fail the task
  -> unlock and dispatch the next dependent task when all gates pass
  -> write checkpoints, summaries, indexes, and audit records
```

Planning review is not user approval. A worker report is not completion approval. Only an accepted report can unlock a dependent task, and only a valid user approval can authorize a dispatch.

## Departments and roles

| Department | Responsibility | Cannot do |
| --- | --- | --- |
| Planning | Discover context, classify scenarios, write plans, register risks/blockers, request approval | Change product artifacts before approval or silently enlarge scope |
| Execution | Perform one exact approved task, test it, and return evidence | Approve its own work or change the approved contract |
| Review | Compare reports and evidence with acceptance criteria | Rewrite scope silently or clear an unresolved blocker |
| Coordination | Route Skills, maintain state, persist memory, dispatch messages, and audit transitions | Infer approval, fabricate evidence, or claim an unavailable adapter completed work |

For a project series, planning and execution controllers have persistent session identities. Task workers and reviewers remain task-scoped. An extension reuses the series controller identities; a genuinely parallel branch gets a new series and a `parallel_of` link.

When no repository or project is available, the orchestrator still performs planning, execution reasoning, and acceptance in the current Codex window. It uses an explicit unscoped project identity, keeps planning/execution/review as logical roles in the state record, and does not modify unknown product files or dispatch external work without a concrete scope and approval.

## Planning Controller Responsibilities

The planning controller owns the workflow from a clarified objective through final acceptance. It works with the user to define the goal, target outcome, modification scope, excluded scope, acceptance criteria, evidence, rollback, risks, blockers, assumptions, and stop conditions. It does not proactively deepen implementation details beyond what the user requested.

For a long plan, the controller splits work into explicit stages and marks each stage as serial or parallel. Every stage and task declares the required Skills and, when applicable, an agent selector. Serial stages must be accepted before later stages activate. Parallel stages may fan out only for independent tasks with isolated workspaces and a later fan-in review.

After each execution report, the controller sends the result through independent planning review:

```text
accepted          -> record evidence -> unlock the next stage/task
revision-required -> issue an in-scope correction -> repeat review
blocked/failed    -> wait, retry within policy, or return to planning
```

An ordinary correction is limited to work the approved plan already required: redo an omitted item, repair a defect, or use another implementation method that preserves the approved contract. These corrections can be automatically re-dispatched while the revision limit and original approval remain valid. A new risk, blocker, permission, acceptance, architecture, rollback, or scope change, or an explicit reapproval request, invalidates the old approval and pauses the series for a new plan version and user approval. The controller repeats correction and review until the task is accepted or a stop condition is reached; it never silently skips a failed correction.

When every task is accepted, no blocker is open, no new risk is awaiting disposition, and the current plan status is `completed`, the controller may prepare a declared next plan in the same series. The new version remains `awaiting-user-approval` and cannot be dispatched automatically. Brainstorming is used during planning discovery to compare options; it is not an execution authorization.

## Continuous automatic dispatch

Continuous automatic dispatch means that the runtime advances a previously approved series without requiring a new user message for every task:

```text
approved plan
  -> dispatch ready task A
  -> receive execution report
  -> planning accepts report A
  -> dispatch ready dependent task B
  -> receive report B
  -> continue until the series is complete or a gate stops it
```

The next dispatch is allowed only when all of these conditions are true:

```text
planning_review == accepted
user_approval.plan_id == current plan.plan_id
user_approval.plan_version == current plan.plan_version
open blockers == 0
task dependencies == accepted
execution adapter/session == available
task is ready and has not already been dispatched
```

Stage scheduling uses `stages[].stage_id`, `order`, `kind`, `required_skills`, and `agent_selectors`; tasks carry
`stage_id`, `stage_order`, and `stage_kind`. Only the earliest unfinished stage is active. A parallel stage is
bounded by `max_parallel` and requires independent tasks plus a fan-in review before the next stage activates.

The accepted-review condition applies to unlocking a different dependent task. A same-task correction may use this
separate gate: `decision == revision-required`, the correction is limited to omitted approved work/defect repair/an
alternate method, `open blockers == 0`, no new risk or material change exists, the original approval still matches,
and the revision limit is not exceeded.

The runtime stops and returns control to planning and the user when it sees a new risk, an unresolved blocker, a revision-required review that is outside the approved scope, a failed retry limit, an unavailable session, or a material plan change. A routine omission or alternate-method correction stays inside the approved version and can be re-dispatched automatically. A new version requires new approval. "Worker reported done" never bypasses these gates.

PDGO exposes this behavior through:

- `resume` / `run-once`: process queued reports and reviews, then recover ready tasks after a restart;
- `watch`: run the same cycle repeatedly as an explicit long-running process;
- `FlowStateRuntime.runOnce()` and `FlowStateRuntime.watch()` for embedding in a host service.

The file queue remains explicit and auditable. Fully unattended cross-conversation execution additionally requires a reachable App Server transport or another real consumer for the queue.

## Approval, risk, and blocker policy

Every plan must make the following visible before approval:

- project goal and observable target outcome;
- allowed modification scope and explicitly excluded scope;
- a detail policy that prevents proactive deepening without a user request or approved plan change;
- scope and non-goals;
- assumptions and dependencies;
- acceptance criteria and expected evidence;
- allowed paths and forbidden actions;
- rollback and stop conditions;
- all known risks and their treatment;
- all blockers and their owner/resolution;
- residual uncertainty and external effects;
- conditions for automatic dispatch.

An approval is bound to the exact plan identity:

```text
plan_id + plan_version + approved scope + acknowledged risks + blocker dispositions
```

Material changes create a new immutable version and invalidate the previous approval. Any new risk or blocker stops
automatic correction, dependent-task unlock, completion, and next-plan preparation; a high or critical risk also
immediately clears the current approval and requires re-review. A blocker is resolved only with an explicit resolution
record and evidence.

## Plan identity and series continuity

Use a stable series ID and a descriptive plan title. A recommended human-readable plan identity is:

```text
PROJECT-YYYYMMDD-NNN-readable-topic-vN
```

The `plan_series_id` is reused for a scope-preserving extension. The extension creates a new immutable version and reuses the same planning/execution controller identities. A parallel objective creates a new series, uses new controller identities, and records `parallel_of` so its accepted result can be synchronized back to the parent.

## Conversation memory and indexes

Memory is rooted in conversations. Each session records its instruction, context, checkpoints, dispatches, result, summary, decisions, unresolved items, and cross-session references.

Indexes are searched before historical source records are opened:

```text
conversations/<session_id>/
plans/<plan_series_id>/<plan_version>/
knowledge/<domain>/
indexes/plan-index.json
indexes/session-index.json
indexes/knowledge-index.json
```

The dispatcher emits derived `plan-index.json` and `session-index.json` beside its state file. Indexes are discovery aids; source records remain authoritative. Every cross-session read is recorded in the current session.

## Scenario-based Skill routing

Startup routing classifies:

```text
project, operation, department, stage, scenario,
inputs, outputs, constraints, risk, mode, approval state
```

The router filters Skills by positive scenario, negative scenario, boundaries, inputs, outputs, prerequisites, side effects, and risk. A Skill name or keyword is never enough. If no reliable Skill matches, the operation stops with `skill-unresolved` instead of guessing.

The repository includes coordination, planning, implementation, validation, debugging, release, memory, and adapter Skills. The searchable catalog is generated from their scenario metadata.

## Active PDGO Skills

The active route has exactly ten Skills. Their complete workflow baselines are combined with PDGO governance rules when the active files are generated.

| Skill | Integrated capability |
| --- | --- |
| `pdgo-route-work` | startup routing and governed capability selection |
| `pdgo-dialogue-memory` | indexed conversation memory and handoff |
| `pdgo-plan-work` | planning, brainstorming, and writing plans |
| `pdgo-execute-work` | execution, parallel dispatch, subagents, and worktrees |
| `pdgo-review-request` | independent review requests |
| `pdgo-review-receive` | evidence-bound review decisions |
| `pdgo-debug-work` | systematic debugging |
| `pdgo-tdd-work` | test-driven development |
| `pdgo-completion-work` | verification and branch completion |
| `pdgo-skill-authoring` | Skill authoring and validation |

Fourteen workflow baselines are held in a read-only integration archive. The machine audit records SHA-256 and Git blob hashes and maps every logical block into an active PDGO Skill without exposing source branding in the active route.

## Specialist Agent catalog

The locked catalog contains 271 specialist Agent prompts across 18 divisions. Each prompt has evidence-backed metadata for routing, integrity verification, and audit.

Search by the concrete scenario and division, then use the exact `external_agent_id` in the approved dispatch. Only high-confidence entries with structured inputs and outputs can be selected automatically; the remaining entries are `manual-only`. An external Agent cannot approve a plan, close a blocker, change scope, or replace independent review. Department candidate divisions and required Skills are defined in `profiles/pdgo-agent-routing.json`.

## Runtime and adapters

`FlowStateDispatcher` owns the state machine. `FlowStateStore` persists plans, tasks, dispatches, reports, reviews, blockers, events, and derived indexes.

| Adapter | Use | Limitation |
| --- | --- | --- |
| `FileQueueAdapter` | Local, CI, manual handoff, and audit review | Requires a queue consumer; it does not claim a remote conversation exists |
| `CodexAppServerAdapter` | Real `thread/start` and `turn/start` transport | Requires an injected reachable transport |
| `AgencyAgentsAdapter` | Scenario-based external role selection wrapped around a base adapter | External role prompts remain advisory and cannot approve, expand scope, or clear blockers |

Adapters must return real session identifiers or an explicit `adapter-unavailable` status. They must never fabricate a completion.

## Quick start

Install or copy the project-method Skill:

```powershell
Copy-Item -Recurse -Force .\skills\pdgo-route-work `
  "$env:USERPROFILE\.codex\skills\pdgo-route-work"
```

Create and approve a plan, then dispatch it through the deterministic CLI:

```powershell
node scripts/flowstate-dispatcher.mjs --action create-plan --input plan.json --root .flowstate --project demo
node scripts/flowstate-dispatcher.mjs --action approve --input approval.json --root .flowstate --project demo
node scripts/flowstate-dispatcher.mjs --action dispatch --input dispatch.json --root .flowstate --project demo
```

Recover after a restart or run a continuous local queue consumer:

```powershell
node scripts/flowstate-dispatcher.mjs --action resume --root .flowstate --project demo
node scripts/flowstate-dispatcher.mjs --action watch --root .flowstate --project demo --interval-ms 1000
```

`watch` is opt-in and explicit. It should be supervised by a service manager or CI when unattended operation is desired.

## Repository layout

```text
AGENTS.md                         repository contribution and safety rules
docs/                             normative specification and runtime guides
schemas/                          versioned plan, dispatch, report, review, and session contracts
templates/                        plan, summary, and report templates
profiles/                         project profiles and Skill catalogs
skills/                           installable scenario-based Skills and indexes
scripts/lib/flowstate-dispatcher  state store, adapters, dispatcher, and runtime
scripts/                          CLI, catalog, import, and validation tools
integrations/                     cached external role catalog and source metadata
tests/                            contract, dispatcher, adapter, and Skill tests
```

## Compatibility and extension

New fields must be additive and optional unless a contract explicitly makes them required. Existing identifiers and statuses remain valid. New departments, roles, Skills, adapters, and locales must declare their scenario, boundaries, inputs, outputs, side effects, permissions, and validation evidence.

## Languages

`README.md` is the default English entry point for GitHub. Published translations use the convention `README.<locale>.md`; the language selector at the top of each entry point links only to files present in the repository. The current reference translation is [Simplified Chinese](README.zh-CN.md). Additional common-language translations can be added without changing the PDGO contracts or runtime.

## Validation

```powershell
npm.cmd run test:node
npm.cmd run validate
```

The test suite covers Skill inventory, approval binding, series continuity, dispatch contracts, queue idempotency, restart recovery, blocker handling, external-role boundaries, and generated indexes.

## Status and license

PDGO is an MIT-licensed reference implementation of the FlowState method. The repository is intentionally platform-neutral; a platform adapter is required for any conversation or background capability that the local file system cannot provide.
