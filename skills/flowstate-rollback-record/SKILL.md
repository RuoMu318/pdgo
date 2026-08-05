---
name: flowstate-rollback-record
description: "Apply the FlowState release, audit, and external effects workflow when the concrete scenario is: Record rollback readiness and actual rollback results. Produce rollback record with evidence and status. Use for scenarios: Record rollback readiness and actual rollback results. Do not use for: Do not use outside release, audit, and external effects scenarios; Do not bypass approval, scope, evidence, or safety gates. Expected outputs: rollback record; evidence, risks, blockers, and next action."
---

# Flowstate Rollback Record

## Scope

- Scenario: Record rollback readiness and actual rollback results
- Action: apply the Release, Audit, and External Effects workflow within the declared scope
- Intended outcome: rollback record
- Project scope: flowstate
- Departments: planning, execution, review
- Stages: discovery, design, implementation, validation
- Category: release-audit
- Subcategory: rollback-record
- Tags: release-audit, rollback-record

## Use when

- Record rollback readiness and actual rollback results

## Do not use when

- Do not use outside release, audit, and external effects scenarios
- Do not bypass approval, scope, evidence, or safety gates

## Required inputs

- classified project context
- plan or task-local artifacts
- current constraints

## Required outputs

- rollback record
- evidence, risks, blockers, and next action

## Workflow

1. Confirm the scenario and project scope.
2. Verify the required inputs and prerequisites.
3. Perform only the declared action.
4. Produce every declared output and supporting evidence.
5. Report deviations, risks, blockers, and unresolved assumptions.

## Selection note

Use when the concrete scenario matches Record rollback readiness and actual rollback results.

## Safety

- Respect the current project mode and approval gate.
- Do not expand scope or claim completion without evidence.
- Side effect to control: may create governed planning, execution, review, or audit records
