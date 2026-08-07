# Execution report {{dispatch_id}}

## Identity

- Project: {{project_id}}
- Plan: {{plan_id}}
- Version: {{plan_version}}
- Task: {{task_id}}
- Session: {{session_id}}
- Execution controller session: {{execution_session_id}}
- Planning return session: {{planning_session_id}}

## Status

{{status}}

- Abnormal stop: {{abnormal_stop}}
- Message type: {{message_type}}

## Result

{{summary}}

## Changes

- Files/artifacts:
- Scope deviations:

## Verification evidence

- Tests:
- Build:
- Runtime or visual evidence:
- Review evidence:

## New risks and blockers

- Blocker ID:
- Dependency:
- Reason:
- Impact:
- Recommended solution:
- Requires user: true | false
- Owner:
- Status: open | resolved

When status is `blocked` or execution stopped abnormally, send this report as `BLOCKER_REPORT` to the fixed planning
conversation immediately. Normal completion must remain `EXECUTION_REPORT` and does not use blocker escalation.

## Recommendation to planning

{{recommended_next_action}}
