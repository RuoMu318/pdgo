# PDGO Plan Work overlay

Use dialogue with the user to converge on the goal and observable result before drafting tasks. Do not start product changes while brainstorming or writing the plan. Every stage and task names its Skills, candidate Agents, evidence, dependencies, blockers, risks, rollback, and stop conditions. Approval is requested only after the plan is complete and internally reviewed. On `BLOCKER_REPORT`, planning must issue a recorded `PLANNING_BLOCKER_OPINION`; resolve and re-dispatch only inside the approved contract, otherwise send `USER_ACTION_REQUIRED` and wait.

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
