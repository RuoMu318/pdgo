---
name: flowstate-auto-next-task
description: "Apply the FlowState controllers, dispatch, and agents workflow when the concrete scenario is: Unlock and dispatch the next accepted dependent task. Produce next-task dispatch with evidence and status. Use for scenarios: Unlock and dispatch the next accepted dependent task. Do not use for: Do not use outside controllers, dispatch, and agents scenarios; Do not bypass approval, scope, evidence, or safety gates. Expected outputs: next-task dispatch; evidence, risks, blockers, and next action."
---

# Flowstate Auto Next Task

## Scope

- Scenario: Unlock and dispatch the next accepted dependent task
- Action: apply the Controllers, Dispatch, and Agents workflow within the declared scope
- Intended outcome: next-task dispatch
- Project scope: flowstate
- Departments: planning, execution, review
- Stages: discovery, design, implementation, validation
- Category: dispatch
- Subcategory: auto-next-task
- Tags: dispatch, auto-next-task

## Use when

- Unlock and dispatch the next accepted dependent task

## Do not use when

- Do not use outside controllers, dispatch, and agents scenarios
- Do not bypass approval, scope, evidence, or safety gates

## Required inputs

- classified project context
- plan or task-local artifacts
- current constraints

## Required outputs

- next-task dispatch
- evidence, risks, blockers, and next action

## Workflow

1. Confirm the scenario and project scope.
2. Verify the required inputs and prerequisites.
3. Perform only the declared action.
4. Produce every declared output and supporting evidence.
5. Report deviations, risks, blockers, and unresolved assumptions.

## Selection note

Use when the concrete scenario matches Unlock and dispatch the next accepted dependent task.

## Safety

- Respect the current project mode and approval gate.
- Do not expand scope or claim completion without evidence.
- Side effect to control: may create governed planning, execution, review, or audit records
