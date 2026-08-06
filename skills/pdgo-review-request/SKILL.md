---
name: pdgo-review-request
description: "Request an independent review against the immutable plan, acceptance criteria, diff, tests, risks, and questions."
---

# PDGO Request Review

Request an independent review against the immutable plan, acceptance criteria, diff, tests, risks, and questions.

## Routing and department contract

The review request must identify the exact plan ID and version, task, allowed paths, acceptance criteria, changed files, test commands and output, evidence links, risks, and unresolved questions. The implementer cannot be the approving reviewer.

## PDGO operating contract

This Skill is the active PDGO route for the declared scenario. Apply the workflow below only after startup routing has classified the project, operation, department, stage, inputs, outputs, constraints, risk, mode, and approval state. A Skill name or keyword is never sufficient evidence for selection.

The Planning Department owns the contract with the user: objective, observable outcome, modification scope, excluded scope, assumptions, dependencies, acceptance criteria, expected evidence, risks, blockers, rollback, stop conditions, and the explicit rule not to deepen implementation detail without a request. Long work is split into named serial and parallel stages. Each stage declares its required Skills, candidate specialist Agents, dependencies, isolation policy, and acceptance gate.

The Planning Department also controls the loop: dispatch one stage or an isolated parallel set, collect worker reports, obtain an independent review, accept only evidence that matches the exact plan version, and issue an in-scope correction when a review returns `revision-required`. A failed or blocked item is not silently skipped. Dependents unlock only after acceptance and all blockers are `resolved` with evidence.

The Execution Department receives one immutable `PLAN_DISPATCH` at a time. It may edit only allowed paths, must observe forbidden actions and stop conditions, must run the declared verification, and must return changed paths, tests, evidence, assumptions, deviations, risks, and blockers. Workers cannot self-approve or expand the plan.

Every session records the instruction, checkpoints, dispatches, reports, decisions, summaries, unresolved items, and cross-session references. Search indexes first and read summaries before source turns. Link artifacts to project, plan, version, task, dispatch, session, tests, and commit where applicable.

Specialist Agents are advisory task workers selected from the locked catalog and its evidence metadata. Search by the concrete scenario and division, inspect the source prompt SHA, and include the exact `external_agent_id` in the approved dispatch. A low-confidence or `manual-only` entry cannot be auto-routed. A specialist Agent cannot approve a plan, close a blocker, change scope, or replace an independent review.

Continuous dispatch is permitted only when the exact user approval matches `plan_id` and `plan_version`, every acknowledged risk and blocker disposition is present, dependencies are accepted, the active stage is ready, the selected Agent metadata is eligible, the transport returned real session IDs, and the scope has not changed. File queues are explicit, auditable handoff adapters; they do not prove a live Agent session. Missing transport, invalid SHA, missing evidence, a new material risk, a new blocker, or a scope change pauses the series and returns it to planning and the user.

Do not claim completion from intent, queued files, mock responses, or a self-reported status. Completion requires independent review, verification evidence, no unresolved blockers, and the exact approved acceptance criteria. Rollback follows the approved plan and is recorded as an auditable event.

## Evidence and stop conditions

Return actual commands and outputs, changed paths, and unresolved uncertainty. Stop immediately when the approved scope, plan version, transport capability, Agent source SHA, or acceptance contract no longer matches.

## Integrated workflow

# Requesting Code Review

Dispatch a code reviewer subagent to catch issues before they cascade. The reviewer gets precisely crafted context for evaluation — never your session's history.

**Core principle:** Review early, review often.

## When to Request Review

**Mandatory:**
- After each task in subagent-driven development
- After completing major feature
- Before merge to main

**Optional but valuable:**
- When stuck (fresh perspective)
- Before refactoring (baseline check)
- After fixing complex bug

## How to Request

**1. Get git SHAs:**
```bash
BASE_SHA=$(git rev-parse HEAD~1)  # or origin/main
HEAD_SHA=$(git rev-parse HEAD)
```

**2. Dispatch code reviewer subagent:**

Dispatch a `general-purpose` subagent, filling the template at [code-reviewer.md](code-reviewer.md)

**Placeholders:**
- `{DESCRIPTION}` - Brief summary of what you built
- `{PLAN_OR_REQUIREMENTS}` - What it should do
- `{BASE_SHA}` - Starting commit
- `{HEAD_SHA}` - Ending commit

**3. Act on feedback:**
- Fix Critical issues immediately
- Fix Important issues before proceeding
- Note Minor issues for later
- Push back if reviewer is wrong (with reasoning)

## Example

```
[Just completed Task 2: Add verification function]

You: Let me request code review before proceeding.

BASE_SHA=$(git log --oneline | grep "Task 1" | head -1 | awk '{print $1}')
HEAD_SHA=$(git rev-parse HEAD)

[Dispatch code reviewer subagent]
  DESCRIPTION: Added verifyIndex() and repairIndex() with 4 issue types
  PLAN_OR_REQUIREMENTS: Task 2 from docs/pdgo/plans/deployment-plan.md
  BASE_SHA: a7981ec
  HEAD_SHA: 3df7661

[Subagent returns]:
  Strengths: Clean architecture, real tests
  Issues:
    Important: Missing progress indicators
    Minor: Magic number (100) for reporting interval
  Assessment: Ready to proceed

You: [Fix progress indicators]
[Continue to Task 3]
```

## Common Rationalizations

| Excuse | Reality |
|--------|---------|
| "I'll just review the diff myself instead of dispatching a reviewer" | You're the coordinator — reviewing the diff inline burns the context window you need to keep driving the work. Dispatch a reviewer subagent: the diff and the evaluation live in its context, and only the findings come back to you. |
| "The reviewer needs my whole session history to understand the change" | Hand it precisely crafted context, never your session's history. That keeps the reviewer on the work product, not your thought process. |

## Red Flags

**Never:**
- Skip review because "it's simple"
- Ignore Critical issues
- Proceed with unfixed Important issues
- Argue with valid technical feedback

**If reviewer wrong:**
- Push back with technical reasoning
- Show code/tests that prove it works
- Request clarification

See template at: [code-reviewer.md](code-reviewer.md)
