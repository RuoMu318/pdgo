---
name: flowstate-project-method
description: Universal project workflow for Codex tasks. Use at the start of every project task and whenever planning, selecting Skills, retrieving cross-session memory, dispatching work, executing approved tasks, reviewing results, handling risks or blockers, or recording changes. Classify the scenario before choosing any domain Skill; enforce user approval before execution.
---

# FlowState Project Method

Apply this Skill as the project-level coordination layer. Keep it active for the whole task and combine it
with a domain Skill only after scenario routing.

## Mandatory startup

1. Identify the project and load the nearest `AGENTS.md` files.
2. Classify operation, department, stage, scenario, inputs, outputs, constraints, risk, and current mode.
3. Locate the project profile and memory/index locations.
4. Search plan, knowledge, and session indexes before reading historical conversations.
5. Select a primary Skill by scenario, scope, prerequisites, outputs, and exclusions. Record why it was selected.
6. If no reliable Skill matches, stop with `skill-unresolved` and ask for a decision or add a Skill.

Read [routing.md](references/routing.md) for the selection contract.

## Mode and approval gate

Respect the current mode:

```text
discuss-only  no side effects
plan-only     planning/review artifacts only
execute       only user-approved, version-locked dispatches
```

Planning review is not user approval. Before execution, present the plan scope, non-goals, tasks, assumptions,
dependencies, acceptance criteria, rollback, every known risk, every blocker, unresolved questions, and residual
uncertainty. Require a version-bound `USER_PLAN_APPROVAL`. Never infer approval from silence or from a positive
comment that does not authorize execution.

Read [approval-gate.md](references/approval-gate.md) for the complete gate.

## Conversation isolation and memory

Use separate sessions for planning controllers, planning workers, execution controllers, execution workers, and
reviewers. Do not copy or assume another session's transcript. Pass only task-local artifact IDs and structured
inputs.

At session start record the instruction. During work record checkpoints, references, risks, blockers, and artifacts.
At close record the result, summary, decisions, unresolved items, and next action. Find historical content through
indexes first, read summaries before source turns, and record every cross-session reference.

## Plan and dispatch discipline

Use a stable series ID plus a descriptive plan title and version. An approved version is immutable. Any material
change to scope, architecture, dependency, risk, acceptance, permissions, or rollback creates a new version and
requires new approval.

Only an approved plan can produce `PLAN_DISPATCH`. The dispatch must include the exact plan version, task, inputs,
required Skills, allowed paths, forbidden actions, dependencies, acceptance criteria, evidence requirements, risk
profile, stop conditions, and return destination.

## Execution and review

Execute only within the dispatch. Use isolated workspaces for concurrent writers. Follow the domain workflow for
the scenario, including testing, debugging, review, and verification when applicable. Return actual changes,
tests, evidence, assumptions, deviations, new risks, and blockers.

Workers never self-approve. An independent reviewer checks evidence against the exact acceptance criteria. Return
the report to planning. Planning accepts, revises, blocks, or closes the task. Only accepted tasks unlock dependents.

## Risk, blocker, and failure policy

All known risks, blockers, assumptions, dependencies, and residual uncertainties must be visible. A hard blocker
or unanswered implementation decision stops execution. A new high-impact risk discovered during execution pauses
the task and returns it to planning and the user for re-review.

Do not fabricate evidence or silently expand scope. Report attempted actions, observed results, uncertainty, and the
next decision. Respect the project retry limit; after the limit, mark the task blocked and escalate.

## Change audit

Link each change to project, plan, version, task, session, dispatch, files, tests, and commit when applicable.
Before committing, inspect status, stage only current-task paths, scan for secrets and oversized files, and record
known risks or deviations.

## References

- [routing.md](references/routing.md)
- [approval-gate.md](references/approval-gate.md)
