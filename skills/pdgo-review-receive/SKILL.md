---
name: pdgo-review-receive
description: "Receive independent review feedback, verify it against the approved contract, and accept, revise, block, or fail the task."
---

# PDGO Receive Review

Receive independent review feedback, verify it against the approved contract, and accept, revise, block, or fail the task.

## Routing and department contract

Assess technical correctness rather than agreeing performatively. Missing evidence, a new risk, a blocker, or a material scope change pauses the series. Only `accepted` unlocks dependents; `revision-required` is limited to the approved correction policy.

## PDGO operating contract

This Skill is the active PDGO route for the declared scenario. Apply the workflow below only after startup routing has classified the project, operation, department, stage, inputs, outputs, constraints, risk, mode, and approval state. A Skill name or keyword is never sufficient evidence for selection.

The Planning Department owns the contract with the user: objective, observable outcome, modification scope, excluded scope, assumptions, dependencies, acceptance criteria, expected evidence, risks, blockers, rollback, stop conditions, and the explicit rule not to deepen implementation detail without a request. Long work is split into named serial and parallel stages. Each stage declares its required Skills, candidate specialist Agents, dependencies, isolation policy, and acceptance gate.

The Planning Department also controls the loop: dispatch one stage or an isolated parallel set, collect worker reports, obtain an independent review, accept only evidence that matches the exact plan version, and issue an in-scope correction when a review returns `revision-required`. A failed or blocked item is not silently skipped. Dependents unlock only after acceptance and all blockers are `resolved` with evidence.

The Execution Department receives one immutable `PLAN_DISPATCH` at a time. It may edit only allowed paths, must observe forbidden actions and stop conditions, must run the declared verification, and must return changed paths, tests, evidence, assumptions, deviations, risks, and blockers. Workers cannot self-approve or expand the plan.

An abnormal execution stop is never normal completion. The Execution Department must immediately send a formal `BLOCKER_REPORT` to the fixed Planning Department conversation with the blocker reason, impact, recommended solution, and `requires_user` disposition. Planning must record and answer it with `PLANNING_BLOCKER_OPINION`: when planning can resolve every blocker inside the approved contract it records the resolutions and re-dispatches the stopped task; when it cannot, it sends `USER_ACTION_REQUIRED` in the planning conversation and keeps execution paused. Normal completion does not trigger this escalation path.

Every session records the instruction, checkpoints, dispatches, reports, decisions, summaries, unresolved items, and cross-session references. Search indexes first and read summaries before source turns. Link artifacts to project, plan, version, task, dispatch, session, tests, and commit where applicable.

Specialist Agents are advisory task workers selected from the locked catalog and its evidence metadata. Search by the concrete scenario and division, inspect the source prompt SHA, and include the exact `external_agent_id` in the approved dispatch. A low-confidence or `manual-only` entry cannot be auto-routed. A specialist Agent cannot approve a plan, close a blocker, change scope, or replace an independent review.

Continuous dispatch is permitted only when the exact user approval matches `plan_id` and `plan_version`, every acknowledged risk and blocker disposition is present, dependencies are accepted, the active stage is ready, the selected Agent metadata is eligible, the transport returned real session IDs, and the scope has not changed. File queues are explicit, auditable handoff adapters; they do not prove a live Agent session. Missing transport, invalid SHA, missing evidence, a new material risk, a new blocker, or a scope change pauses the series and returns it to planning. Planning escalates to the user only when it cannot resolve the blocker inside the approved contract or a material change requires new approval.

Do not claim completion from intent, queued files, mock responses, or a self-reported status. Completion requires independent review, verification evidence, no unresolved blockers, and the exact approved acceptance criteria. Rollback follows the approved plan and is recorded as an auditable event.

## Evidence and stop conditions

Return actual commands and outputs, changed paths, and unresolved uncertainty. Stop immediately when the approved scope, plan version, transport capability, Agent source SHA, or acceptance contract no longer matches.

## Integrated workflow

# Code Review Reception

## Overview

Code review requires technical evaluation, not emotional performance.

**Core principle:** Verify before implementing. Ask before assuming. Technical correctness over social comfort.

## The Response Pattern

```
WHEN receiving code review feedback:

1. READ: Complete feedback without reacting
2. UNDERSTAND: Restate requirement in own words (or ask)
3. VERIFY: Check against codebase reality
4. EVALUATE: Technically sound for THIS codebase?
5. RESPOND: Technical acknowledgment or reasoned pushback
6. IMPLEMENT: One item at a time, test each
```

## Forbidden Responses

**NEVER:**
- "You're absolutely right!" (explicit instruction-file violation)
- "Great point!" / "Excellent feedback!" (performative)
- "Let me implement that now" (before verification)

**INSTEAD:**
- Restate the technical requirement
- Ask clarifying questions
- Push back with technical reasoning if wrong
- Just start working (actions > words)

## Handling Unclear Feedback

```
IF any item is unclear:
  STOP - do not implement anything yet
  ASK for clarification on unclear items

WHY: Items may be related. Partial understanding = wrong implementation.
```

**Example:**
```
your human partner: "Fix 1-6"
You understand 1,2,3,6. Unclear on 4,5.

❌ WRONG: Implement 1,2,3,6 now, ask about 4,5 later
✅ RIGHT: "I understand items 1,2,3,6. Need clarification on 4 and 5 before proceeding."
```

## Source-Specific Handling

### From your human partner
- **Trusted** - implement after understanding
- **Still ask** if scope unclear
- **No performative agreement**
- **Skip to action** or technical acknowledgment

### From External Reviewers
```
BEFORE implementing:
  1. Check: Technically correct for THIS codebase?
  2. Check: Breaks existing functionality?
  3. Check: Reason for current implementation?
  4. Check: Works on all platforms/versions?
  5. Check: Does reviewer understand full context?

IF suggestion seems wrong:
  Push back with technical reasoning

IF can't easily verify:
  Say so: "I can't verify this without [X]. Should I [investigate/ask/proceed]?"

IF conflicts with your human partner's prior decisions:
  Stop and discuss with your human partner first
```

**your human partner's rule:** "External feedback - be skeptical, but check carefully"

## YAGNI Check for "Professional" Features

```
IF reviewer suggests "implementing properly":
  grep codebase for actual usage

  IF unused: "This endpoint isn't called. Remove it (YAGNI)?"
  IF used: Then implement properly
```

**your human partner's rule:** "You and reviewer both report to me. If we don't need this feature, don't add it."

## Implementation Order

```
FOR multi-item feedback:
  1. Clarify anything unclear FIRST
  2. Then implement in this order:
     - Blocking issues (breaks, security)
     - Simple fixes (typos, imports)
     - Complex fixes (refactoring, logic)
  3. Test each fix individually
  4. Verify no regressions
```

## When To Push Back

Push back when:
- Suggestion breaks existing functionality
- Reviewer lacks full context
- Violates YAGNI (unused feature)
- Technically incorrect for this stack
- Legacy/compatibility reasons exist
- Conflicts with your human partner's architectural decisions

**How to push back:**
- Use technical reasoning, not defensiveness
- Ask specific questions
- Reference working tests/code
- Involve your human partner if architectural

**If you're uncomfortable pushing back out loud:** Name that tension, then tell your partner about the issue you've seen. They'll appreciate your honesty.

## Acknowledging Correct Feedback

When feedback IS correct:
```
✅ "Fixed. [Brief description of what changed]"
✅ "Good catch - [specific issue]. Fixed in [location]."
✅ [Just fix it and show in the code]

❌ "You're absolutely right!"
❌ "Great point!"
❌ "Thanks for catching that!"
❌ "Thanks for [anything]"
❌ ANY gratitude expression
```

**Why no thanks:** Actions speak. Just fix it. The code itself shows you heard the feedback.

**If you catch yourself about to write "Thanks":** DELETE IT. State the fix instead.

## Gracefully Correcting Your Pushback

If you pushed back and were wrong:
```
✅ "You were right - I checked [X] and it does [Y]. Implementing now."
✅ "Verified this and you're correct. My initial understanding was wrong because [reason]. Fixing."

❌ Long apology
❌ Defending why you pushed back
❌ Over-explaining
```

State the correction factually and move on.

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Performative agreement | State requirement or just act |
| Blind implementation | Verify against codebase first |
| Batch without testing | One at a time, test each |
| Assuming reviewer is right | Check if breaks things |
| Avoiding pushback | Technical correctness > comfort |
| Partial implementation | Clarify all items first |
| Can't verify, proceed anyway | State limitation, ask for direction |

## Real Examples

**Performative Agreement (Bad):**
```
Reviewer: "Remove legacy code"
❌ "You're absolutely right! Let me remove that..."
```

**Technical Verification (Good):**
```
Reviewer: "Remove legacy code"
✅ "Checking... build target is 10.15+, this API needs 13+. Need legacy for backward compat. Current impl has wrong bundle ID - fix it or drop pre-13 support?"
```

**YAGNI (Good):**
```
Reviewer: "Implement proper metrics tracking with database, date filters, CSV export"
✅ "Grepped codebase - nothing calls this endpoint. Remove it (YAGNI)? Or is there usage I'm missing?"
```

**Unclear Item (Good):**
```
your human partner: "Fix items 1-6"
You understand 1,2,3,6. Unclear on 4,5.
✅ "Understand 1,2,3,6. Need clarification on 4 and 5 before implementing."
```

## GitHub Thread Replies

When replying to inline review comments on GitHub, reply in the comment thread (`gh api repos/{owner}/{repo}/pulls/{pr}/comments/{id}/replies`), not as a top-level PR comment.
