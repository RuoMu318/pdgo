# PDGO organization architecture

PDGO is organized as a layered project method rather than a flat list of prompts. Each layer has a single
responsibility and communicates with the next layer through explicit artifacts and contracts.

## 1. Repository map

```text
PDGO
├── core
│   ├── startup classification
│   ├── authority and modes
│   ├── state machine
│   ├── approval gate
│   └── evidence policy
├── departments
│   ├── planning
│   ├── execution
│   └── review
├── skills
│   ├── project-method
│   ├── planning
│   ├── implementation
│   ├── validation
│   ├── debugging
│   └── release
├── roles
│   ├── controllers
│   ├── workers
│   └── reviewers
├── memory
│   ├── session records
│   ├── plan records
│   ├── knowledge records
│   └── indexes
├── protocols
│   ├── plan dispatch
│   ├── user approval
│   ├── execution report
│   └── review decision
├── adapters
│   ├── Codex
│   ├── local CLI
│   └── future platforms
└── project profiles
    ├── paths
    ├── local Skills
    ├── tests
    └── approval policy
```

## 2. Core layer

Only the bounded three-mode bootstrap is always active. It routes the request before model extensions, subagents,
PDGO state writes, formal plans, governance prompts, or role processes can run.

- Lightweight work stays in the current Agent and has zero PDGO governance side effects.
- Standard work stays in the current Agent with a proportionate self-check, zero governance-prompt loads, and zero new PDGO approval rounds.
- High-assurance work, or an explicit secretary/BossCoding entry, loads the secretary contract but stays with the
  current Agent by default. External, destructive, difficult-to-reverse, or explicitly independently reviewed work
  adds at most one read-only reviewer. Full PDGO three-role orchestration is explicit opt-in only.

Lightweight and standard share one authorization gate before work-depth selection. They require a structured
`current_request_boundary` whose closed-set action and file targets match the local action. Targets are normalized and
contained within an approved absolute local root; traversal, out-of-root paths, broad targets, forbidden actions,
contradictions, missing evidence, or any declared risk fail closed. Both modes emit
`authorization_source=explicit-current-user-request` and `pdgo_new_approval_rounds=0`. This source-level boundary is
not live host attestation, which remains unimplemented for ordinary routing.

The high-assurance core performs only the planning, approval checks, failure handling, and evidence needed for the
actual risk. Default single-agent work does not create PDGO state or load role processes. Explicit full PDGO may add
memory lookup, Skill routing, task state transitions, role binding, recovery, and audit linking. The core must not
contain product-specific instructions and delegates domain decisions to project profiles and scoped Skills.

The dispatcher also supports an optional fail-closed authorization policy. It hashes only the immutable approved
boundary with stable JSON plus SHA-256 and accepts host attestation only from an injected transport or adapter. When
enabled, the same envelope must survive plan, approval, dispatch, report, and review; unchanged internal artifacts do
not create item-by-item approval rounds. A material target, object, action, risk, third-party effect, authorization
boundary, or acceptance change requires a new exact approval. Missing, expired, mismatched, version-drifted,
scope-drifted, or role-drifted artifacts stop. Legacy plans without the policy remain compatible.

## 3. Department layer

### Planning department

Produces an immutable, titled, indexed plan series version. It owns discovery, research, decomposition, risk
registration, dependency analysis, acceptance design, and the user approval request. It does not modify product
artifacts before approval.

The planning controller owns plan lifecycle and blocker disposition. It divides long plans into ordered serial or
parallel stages and assigns stage-level Skills and agent selectors, but it does not accept ordinary execution results.
Every normal report is sent to the persistent independent review controller, which either unlocks the next work or
issues a correction. A correction stays in the same approved version only
when it is an omitted approved item, a defect repair, or an alternate implementation method with no unresolved risk
or blocker and no permission, acceptance, architecture, rollback, or scope change. Every new blocker pauses the
series for planning disposition. Planning may resolve it inside the approved contract; otherwise it clears approval
when required and requests a new version or user action. Open blockers prevent correction, completion, and next-plan
creation. The controller does not proactively deepen detail beyond the user request or approved plan.

The blocker escalation path is explicit. An abnormal execution stop sends `BLOCKER_REPORT` to the fixed planning
conversation; normal completion does not. Planning returns `PLANNING_BLOCKER_OPINION`. It may resolve and re-dispatch
the stopped task only inside the approved contract. Otherwise it sends `USER_ACTION_REQUIRED` in the planning
conversation and keeps execution paused.

### Execution department

Consumes one exact approved plan version and one bounded task. It selects the execution worker, performs changes in
an isolated workspace, verifies the result, and returns a structured report. It cannot change the approved scope.

### Review department

Independently checks the plan or execution result against evidence and acceptance criteria. It can accept, request
revision, block, or fail a result; it cannot silently rewrite the plan.

## 4. Controller, worker, and reviewer roles

```text
controller  decides routing and creates bounded dispatches
worker      performs one bounded operation
reviewer    checks outputs independently
```

Controllers and workers use different sessions when the task is handed off. For one `plan_series_id`, planning,
execution, and review controllers are three distinct persistent sessions. A series extension reuses all three; a
parallel series gets a new controller trio and a `parallel_of` link. The reviewer receives artifacts and evidence,
not an assumed shared transcript. Only a decision observed from its bound session can unlock dependent work.

When no project can be identified, the host may use an unscoped project identity for read-only planning and method
work. Logical departments in one visible window are not independent identity evidence: acceptance remains unavailable
until the host binds a distinct reviewer session. Unknown product paths remain read-only.

## 5. Skill organization

Skills are organized by scenario and output contract:

```text
skills/
├── project-method/       startup, memory, routing, approval, audit
├── planning/             discovery, brainstorming, architecture, decomposition
├── implementation/       bounded changes, testing, refactoring
├── validation/           tests, visual checks, performance, lifecycle
├── debugging/            reproduction, hypothesis, controlled fixes
└── release/              packaging, change records, rollback, handoff
```

Each Skill declares positive scenarios, negative scenarios, inputs, outputs, prerequisites, side effects, and risk.
The router chooses a primary Skill and optional supporting Skills after classification. A directory or file name is
never a sufficient routing condition.

The brainstorming Skill is planning-only: it produces candidate approaches, assumptions, risks, questions, and
trade-offs that must be resolved into an explicit plan. It cannot modify product artifacts, approve execution, clear a
blocker, or expand detail beyond the user request. The plan's `detail_policy` remains the boundary for all follow-up
work.

Stage metadata is part of the routing contract. A stage declares `stage_id`, `order`, `kind` (`serial` or
`parallel`), `required_skills`, `agent_selectors`, and optional acceptance criteria. Tasks repeat their
`stage_id`, `stage_order`, and `stage_kind`. The dispatcher activates only the earliest unfinished stage; a parallel
stage fans out independent tasks within `max_parallel`, then waits for review of every branch before activating the
next stage.

## 6. Workflow modules

The default workflow modules are composable:

```text
clarify goal
→ research context
→ brainstorm and converge on decisions (planning only)
→ write plan
→ review risks and blockers
→ request user approval
→ execute bounded task
→ test and verify
→ send a review request to the bound reviewer
→ receive a source-verified review decision
→ accept, issue in-scope correction, block, or fail
→ unlock dependent task
→ dispatch next task in the same series controller sessions
```

A module can stop the workflow. For example, missing requirements stop at clarification, an open blocker stops at
approval and dispatch, a routine test omission returns to the same task for correction, and a new risk or material
change returns to planning and the user. Brainstorming never modifies product artifacts or grants approval.

## 7. Memory organization

Memory is conversation-first:

```text
memory/
├── conversations/<session_id>/
│   ├── instruction
│   ├── checkpoint
│   ├── result
│   ├── summary
│   ├── decisions
│   └── references
├── plans/<plan_series_id>/<version>/
├── knowledge/<domain>/
└── indexes/
```

The dispatcher also emits a derived `plan-index.json` and `session-index.json` beside its state file. These indexes
are discovery aids only; the plan, session records, reports, and summaries remain authoritative source artifacts.

Indexes are for discovery. Source records remain authoritative for evidence. Cross-project retrieval is disabled
unless the current task explicitly records the relationship and reason.

## 8. Protocol layer

The protocol layer uses versioned YAML or JSON contracts from `schemas/`. Every message includes project, plan,
version, task, session, dispatch, and trace identifiers. Unknown fields may be added compatibly; existing fields
must not be silently renamed or removed.

## 9. Adapter layer

Adapters translate PDGO protocols to a platform's conversation, filesystem, worktree, and review primitives. The
core remains platform-neutral. A missing platform capability must be reported as a bounded limitation rather than
simulated.

## 10. Project profiles

Profiles define local behavior: repository root, memory root, project Skills, test commands, worktree policy, retry
limit, risk thresholds, and external-change approval. A profile can add stricter rules but cannot weaken user approval,
evidence, safety, or isolation requirements.

## 11. Extension rules

To add a new department, role, Skill, adapter, or project profile:

1. define its input and output contract;
2. define positive and negative scenarios;
3. define permissions and side effects;
4. define verification evidence;
5. add a compatible schema or manifest;
6. test routing and failure behavior;
7. document migration and compatibility if an existing contract is extended.
