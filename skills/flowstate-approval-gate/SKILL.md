---
name: flowstate-approval-gate
description: "Apply the FlowState coordination and governance workflow when the concrete scenario is: Request and verify version-bound user approval. Produce approval record with evidence and status. Use for scenarios: Request and verify version-bound user approval. Do not use for: Do not use outside coordination and governance scenarios; Do not bypass approval, scope, evidence, or safety gates. Expected outputs: approval record; evidence, risks, blockers, and next action."
---

# Flowstate Approval Gate

## Scope

- Scenario: Request and verify version-bound user approval
- Action: apply the Coordination and Governance workflow within the declared scope
- Intended outcome: approval record
- Project scope: flowstate
- Departments: planning, execution, review
- Stages: discovery, design, implementation, validation
- Category: coordination
- Subcategory: approval-gate
- Tags: coordination, approval-gate

## Use when

- Request and verify version-bound user approval

## Do not use when

- Do not use outside coordination and governance scenarios
- Do not bypass approval, scope, evidence, or safety gates

## Required inputs

- classified project context
- plan or task-local artifacts
- current constraints

## Required outputs

- approval record
- evidence, risks, blockers, and next action

## Workflow

1. Confirm the scenario and project scope.
2. Verify the required inputs and prerequisites.
3. Perform only the declared action.
4. Produce every declared output and supporting evidence.
5. Report deviations, risks, blockers, and unresolved assumptions.

## Selection note

Use when the concrete scenario matches Request and verify version-bound user approval.

## Safety

- Respect the current project mode and approval gate.
- Do not expand scope or claim completion without evidence.
- Side effect to control: may create governed planning, execution, review, or audit records
