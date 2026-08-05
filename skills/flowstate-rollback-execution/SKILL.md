---
name: flowstate-rollback-execution
description: "Apply the FlowState debugging and recovery workflow when the concrete scenario is: Execute an approved rollback and verify it. Produce rollback evidence with evidence and status. Use for scenarios: Execute an approved rollback and verify it. Do not use for: Do not use outside debugging and recovery scenarios; Do not bypass approval, scope, evidence, or safety gates. Expected outputs: rollback evidence; evidence, risks, blockers, and next action."
---

# Flowstate Rollback Execution

## Scope

- Scenario: Execute an approved rollback and verify it
- Action: apply the Debugging and Recovery workflow within the declared scope
- Intended outcome: rollback evidence
- Project scope: flowstate
- Departments: planning, execution, review
- Stages: discovery, design, implementation, validation
- Category: debugging
- Subcategory: rollback-execution
- Tags: debugging, rollback-execution

## Use when

- Execute an approved rollback and verify it

## Do not use when

- Do not use outside debugging and recovery scenarios
- Do not bypass approval, scope, evidence, or safety gates

## Required inputs

- classified project context
- plan or task-local artifacts
- current constraints

## Required outputs

- rollback evidence
- evidence, risks, blockers, and next action

## Workflow

1. Confirm the scenario and project scope.
2. Verify the required inputs and prerequisites.
3. Perform only the declared action.
4. Produce every declared output and supporting evidence.
5. Report deviations, risks, blockers, and unresolved assumptions.

## Selection note

Use when the concrete scenario matches Execute an approved rollback and verify it.

## Safety

- Respect the current project mode and approval gate.
- Do not expand scope or claim completion without evidence.
- Side effect to control: may create governed planning, execution, review, or audit records
