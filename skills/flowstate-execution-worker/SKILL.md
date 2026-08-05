---
name: flowstate-execution-worker
description: "Apply the FlowState controllers, dispatch, and agents workflow when the concrete scenario is: Perform one exact approved task. Produce execution report with evidence and status. Use for scenarios: Perform one exact approved task. Do not use for: Do not use outside controllers, dispatch, and agents scenarios; Do not bypass approval, scope, evidence, or safety gates. Expected outputs: execution report; evidence, risks, blockers, and next action."
---

# Flowstate Execution Worker

## Scope

- Scenario: Perform one exact approved task
- Action: apply the Controllers, Dispatch, and Agents workflow within the declared scope
- Intended outcome: execution report
- Project scope: flowstate
- Departments: planning, execution, review
- Stages: discovery, design, implementation, validation
- Category: dispatch
- Subcategory: execution-worker
- Tags: dispatch, execution-worker

## Use when

- Perform one exact approved task

## Do not use when

- Do not use outside controllers, dispatch, and agents scenarios
- Do not bypass approval, scope, evidence, or safety gates

## Required inputs

- classified project context
- plan or task-local artifacts
- current constraints

## Required outputs

- execution report
- evidence, risks, blockers, and next action

## Workflow

1. Confirm the scenario and project scope.
2. Verify the required inputs and prerequisites.
3. Perform only the declared action.
4. Produce every declared output and supporting evidence.
5. Report deviations, risks, blockers, and unresolved assumptions.

## Selection note

Use when the concrete scenario matches Perform one exact approved task.

## Safety

- Respect the current project mode and approval gate.
- Do not expand scope or claim completion without evidence.
- Side effect to control: may create governed planning, execution, review, or audit records
