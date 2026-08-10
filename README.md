# PDGO - Project Development Governance Orchestrator

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
  -> send a REVIEW_REQUEST to the bound independent reviewer
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

For a project series, planning, execution, and independent review controllers have three persistent, distinct session identities. Task workers remain task-scoped. An extension reuses the controller trio; a genuinely parallel branch gets a new series and a `parallel_of` link.

When no repository or project is available, the orchestrator may still perform read-only planning in the current Codex window. Logical roles in one window are not independent review evidence, so acceptance remains unavailable until a concrete scope, approval, and distinct reviewer session exist.

## Planning Controller Responsibilities

The planning controller owns the plan lifecycle and blocker disposition. It works with the user to define the goal, target outcome, modification scope, excluded scope, acceptance criteria, evidence, rollback, risks, blockers, assumptions, and stop conditions. It does not accept its own plan or proactively deepen implementation details beyond what the user requested.

For a long plan, the controller splits work into explicit stages and marks each stage as serial or parallel. Every stage and task declares the required Skills and, when applicable, an agent selector. Serial stages must be accepted before later stages activate. Parallel stages may fan out only for independent tasks with isolated workspaces and a later fan-in review.

After each normal execution report, the dispatcher sends the result to the bound independent reviewer:

```text
accepted          -> record evidence -> unlock the next stage/task
revision-required -> issue an in-scope correction -> repeat review
blocked/failed    -> wait, retry within policy, or return to planning
```

An abnormal execution stop is not a normal completion. A crash, unexpected termination, or explicit abnormal-stop
signal immediately produces a formal `BLOCKER_REPORT` in the fixed planning conversation. The report must list each
blocker's reason, impact, recommended solution, and whether user action is required. Planning must answer execution
with `PLANNING_BLOCKER_OPINION`: if every blocker is resolvable inside the approved contract, planning records the
resolutions and re-dispatches the stopped task; otherwise it sends `USER_ACTION_REQUIRED` in the planning conversation
and keeps execution paused. Silent retries and silent blocker state changes are forbidden.

An ordinary correction is limited to work the approved plan already required: redo an omitted item, repair a defect, or use another implementation method that preserves the approved contract. These corrections can be automatically re-dispatched while the revision limit and original approval remain valid. A new risk or blocker always pauses progression for planning disposition. After the first failed-review baseline, two completed correction rounds that repeat the same issue without new evidence stop as `repeated-no-progress`; partial progress or new evidence resets that count.

When every task is accepted, no blocker is open, no new risk is awaiting disposition, and the current plan status is `completed`, the controller may prepare a declared next plan in the same series. The new version remains `awaiting-user-approval` and cannot be dispatched automatically. Brainstorming is used during planning discovery to compare options; it is not an execution authorization.

## Continuous automatic dispatch

Continuous automatic dispatch means that the runtime advances a previously approved series without requiring a new user message for every task:

```text
approved plan
  -> dispatch ready task A
  -> receive execution report
  -> independent review accepts report A
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

The `plan_series_id` is reused for a scope-preserving extension. The extension creates a new immutable version and reuses the same planning/execution/review controller identities. A parallel objective creates a new series, uses a new controller trio, and records `parallel_of` so its accepted result can be synchronized back to the parent.

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
| `FileQueueAdapter` | Local, CI, manual handoff, and audit review | Logical IDs are not author authentication; queued reviews remain non-authoritative without host source attestation |
| `CodexAppServerAdapter` | Real planning, execution, reviewer, and worker threads | Requires an injected reachable transport |
| `AgencyAgentsAdapter` | Scenario-based external role selection wrapped around a base adapter | External role prompts remain advisory and cannot approve, expand scope, or clear blockers |

Adapters must return real session identifiers or an explicit `adapter-unavailable` status. The Codex-native integration lives under `integrations/codex-native/`; its Skill calls built-in subagent tools, then binds the real returned IDs. Node never fabricates or launches a Codex subagent.

### BossCoding cold start

The installed BossCoding secretary resolves one schema-1.1 descriptor at `<CodexHome>/runtime/bosscoding/runtime.json`. The descriptor contains `schema_version`, `integration_id`, `runtime_root`, nested `manifest` and `dispatcher` objects, and mandatory `runtime_tree`. The descriptor pins the manifest; that hashed manifest is the single source for the complete runtime path list, including the dispatcher, its imported libraries, the cold-start resolver, and the configured specialist index, metadata index, and prompt tree. A missing descriptor, path escape, integration mismatch, incomplete tree, or hash mismatch is a blocker rather than permission to search the disk or use an unverified runtime.

Each consuming project uses isolated state at `<CodexHome>/state/bosscoding/projects/<name>-<hash16>`, where the suffix is derived from the canonical project root. The secretary and bridge resolve these paths themselves. A BossCoding user is not asked to run the CLI or move dispatch JSON between Agents.

Cold start is deliberately ordered so inspection cannot become an unapproved write: resolve and verify the runtime with zero writes; draft the exact baseline, IDs, roles, file/test batch, and state root in memory; obtain one approval covering state creation and all three roles; then ensure state, persist and approve the exact plan, and spawn/bind planning, review, and execution. New BossCoding plans use the complete `bosscoding-v2` role contract. `host_agent_type` is recorded from the real `spawn_agent.agent_type` argument; `selection_source` is the approved role-selection record, not a spawn argument or cryptographic proof. The installed resolver's verified invoke entry rechecks the descriptor, recomputes the project state root, and forbids arbitrary root or catalog overrides before every BossCoding state action. Direct dispatcher CLI remains a separately opted-in legacy PDGO interface. These checks protect against mistakes and ordinary local drift; they do not claim isolation from a malicious process already running as the same OS user.

The dispatcher separates resolver-owned verified BossCoding invocation from the direct legacy CLI: the direct CLI rejects caller-supplied interface claims and BossCoding v2 state, while resolver-owned creation rejects legacy plans. State and queue writers reject linked or non-canonical paths inside the isolated state tree. The installer publishes a complete ownership record atomically, snapshots every existing target before staging, refuses concurrent target or source drift, verifies committed targets, and preserves externally modified files instead of deleting them during rollback.

Users can invoke the combined flow directly: `秘书，用 acy 选合适专家完成 <任务>，并用 $munger 的 Lens 检查可避免的失败。` `acy` selects functional roles, while `$munger` is only an advisory method lens. `$nuwa-skill` is reserved for creating, updating, or auditing Persona Skills; ordinary work invokes the installed Persona Skill itself. Optional lens `purpose` and `evidence_cutoff` survive into the execution dispatch without gaining authority.

An adapter may mark review identity as authenticated only for the exact transport its `receiveReviews` method polls;
wrapping a trusted worker launcher around a plain file queue does not make queued reviews trusted.

## BossCoding quick start

In Codex, say `秘书：<任务>`, `秘书，按 BossCoding 做：<任务>`, or invoke
`$bosscoding-secretary <任务>`. The secretary resolves the verified runtime, drafts one exact batch, obtains one
approval, and coordinates planning, execution, and independent review. BossCoding users do not run a dispatcher CLI
or move JSON between Agents.

## Legacy PDGO direct CLI

The direct CLI is developer compatibility for plans that explicitly declare
`role_contract.version: legacy-v1` and `migration: role-assignments-not-recorded`. It cannot create or operate
BossCoding v2 state. Use a legacy-specific input rather than the v2 `schemas/plan.yaml` template:

```powershell
node scripts/flowstate-dispatcher.mjs --action create-plan --input legacy-plan.json --root .flowstate --project demo
node scripts/flowstate-dispatcher.mjs --action approve --input legacy-approval.json --root .flowstate --project demo
node scripts/flowstate-dispatcher.mjs --action dispatch --input legacy-dispatch.json --root .flowstate --project demo
```

Legacy recovery remains explicit; `watch` is opt-in and must not be started by BossCoding:

```powershell
node scripts/flowstate-dispatcher.mjs --action resume --root .flowstate --project demo
node scripts/flowstate-dispatcher.mjs --action watch --root .flowstate --project demo --interval-ms 1000
```

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
