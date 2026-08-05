---
name: flowstate-failure-recovery
description: "Apply the FlowState debugging and recovery workflow when the concrete scenario is: Recover from a failed task within policy. Produce recovery decision with evidence and status. Use for scenarios: Recover from a failed task within policy. Do not use for: Do not use outside debugging and recovery scenarios; Do not bypass approval, scope, evidence, or safety gates. Expected outputs: recovery decision; evidence, risks, blockers, and next action."
---

# Flowstate Failure Recovery

## Scope

- Scenario: Recover from a failed task within policy
- Action: apply the Debugging and Recovery workflow within the declared scope
- Intended outcome: recovery decision
- Project scope: flowstate
- Departments: planning, execution, review
- Stages: discovery, design, implementation, validation
- Category: debugging
- Subcategory: failure-recovery
- Tags: debugging, failure-recovery

## Use when

- Recover from a failed task within policy

## Do not use when

- Do not use outside debugging and recovery scenarios
- Do not bypass approval, scope, evidence, or safety gates

## Required inputs

- classified project context
- plan or task-local artifacts
- current constraints

## Required outputs

- recovery decision
- evidence, risks, blockers, and next action

## Workflow

1. Confirm the scenario and project scope.
2. Verify the required inputs and prerequisites.
3. Perform only the declared action.
4. Produce every declared output and supporting evidence.
5. Report deviations, risks, blockers, and unresolved assumptions.

## Selection note

Use when the concrete scenario matches Recover from a failed task within policy.

## Safety

- Respect the current project mode and approval gate.
- Do not expand scope or claim completion without evidence.
- Side effect to control: may create governed planning, execution, review, or audit records
