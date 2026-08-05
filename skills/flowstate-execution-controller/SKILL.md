---
name: flowstate-execution-controller
description: "Apply the FlowState controllers, dispatch, and agents workflow when the concrete scenario is: Dispatch approved tasks and collect worker reports. Produce execution control record with evidence and status. Use for scenarios: Dispatch approved tasks and collect worker reports. Do not use for: Do not use outside controllers, dispatch, and agents scenarios; Do not bypass approval, scope, evidence, or safety gates. Expected outputs: execution control record; evidence, risks, blockers, and next action."
---

# Flowstate Execution Controller

## Scope

- Scenario: Dispatch approved tasks and collect worker reports
- Action: apply the Controllers, Dispatch, and Agents workflow within the declared scope
- Intended outcome: execution control record
- Project scope: flowstate
- Departments: planning, execution, review
- Stages: discovery, design, implementation, validation
- Category: dispatch
- Subcategory: execution-controller
- Tags: dispatch, execution-controller

## Use when

- Dispatch approved tasks and collect worker reports

## Do not use when

- Do not use outside controllers, dispatch, and agents scenarios
- Do not bypass approval, scope, evidence, or safety gates

## Required inputs

- classified project context
- plan or task-local artifacts
- current constraints

## Required outputs

- execution control record
- evidence, risks, blockers, and next action

## Workflow

1. Confirm the scenario and project scope.
2. Verify the required inputs and prerequisites.
3. Perform only the declared action.
4. Produce every declared output and supporting evidence.
5. Report deviations, risks, blockers, and unresolved assumptions.

## Selection note

Use when the concrete scenario matches Dispatch approved tasks and collect worker reports.

## Safety

- Respect the current project mode and approval gate.
- Do not expand scope or claim completion without evidence.
- Side effect to control: may create governed planning, execution, review, or audit records
