---
name: flowstate-external-push-approval
description: "Apply the FlowState release, audit, and external effects workflow when the concrete scenario is: Gate a remote push on explicit authorization. Produce push approval with evidence and status. Use for scenarios: Gate a remote push on explicit authorization. Do not use for: Do not use outside release, audit, and external effects scenarios; Do not bypass approval, scope, evidence, or safety gates. Expected outputs: push approval; evidence, risks, blockers, and next action."
---

# Flowstate External Push Approval

## Scope

- Scenario: Gate a remote push on explicit authorization
- Action: apply the Release, Audit, and External Effects workflow within the declared scope
- Intended outcome: push approval
- Project scope: flowstate
- Departments: planning, execution, review
- Stages: discovery, design, implementation, validation
- Category: release-audit
- Subcategory: external-push-approval
- Tags: release-audit, external-push-approval

## Use when

- Gate a remote push on explicit authorization

## Do not use when

- Do not use outside release, audit, and external effects scenarios
- Do not bypass approval, scope, evidence, or safety gates

## Required inputs

- classified project context
- plan or task-local artifacts
- current constraints

## Required outputs

- push approval
- evidence, risks, blockers, and next action

## Workflow

1. Confirm the scenario and project scope.
2. Verify the required inputs and prerequisites.
3. Perform only the declared action.
4. Produce every declared output and supporting evidence.
5. Report deviations, risks, blockers, and unresolved assumptions.

## Selection note

Use when the concrete scenario matches Gate a remote push on explicit authorization.

## Safety

- Respect the current project mode and approval gate.
- Do not expand scope or claim completion without evidence.
- Side effect to control: may create governed planning, execution, review, or audit records
