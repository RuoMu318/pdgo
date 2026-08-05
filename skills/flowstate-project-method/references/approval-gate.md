# Approval gate reference

## Required plan sections

Before requesting approval, the plan must contain:

- objective and non-goals;
- current state and sources;
- task ledger and dependencies;
- assumptions and permissions;
- acceptance criteria and evidence;
- rollback and stop conditions;
- all known risks with treatment and owner;
- all blockers with resolution or explicit exception path;
- questions and decisions;
- residual uncertainty.

If a section has no entries, write `none` and explain the basis.

## Item decisions

Risk decisions are `accept`, `mitigate`, `avoid`, or `defer`. Blocker decisions are `resolved`,
`approved-with-condition`, `blocked`, or `needs-user-decision`.

`open`, `blocked`, and `needs-user-decision` items prevent ordinary execution. A hard blocker cannot be bypassed
by a generic approval; it requires resolution or a separately authorized policy exception that changes scope.

## Approval record

```yaml
message_type: USER_PLAN_APPROVAL
approval_id: approval-id
plan_id: plan-id
plan_version: vN
approved_scope: []
acknowledged_risks: []
resolved_blockers: []
accepted_assumptions: []
accepted_residual_risks: []
conditions: []
decision: approved
approver: user
```

Approval is valid only for the exact plan version and only while its conditions remain true. A material plan change
or new high-impact risk invalidates it and requires a new version and approval.
