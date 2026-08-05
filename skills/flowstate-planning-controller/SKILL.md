---
name: flowstate-planning-controller
description: "Apply the FlowState controllers, dispatch, and agents workflow when the concrete scenario is: Coordinate planning workers and user approval. Produce planning control record with evidence and status. Use for scenarios: Coordinate planning workers and user approval. Do not use for: Do not use outside controllers, dispatch, and agents scenarios; Do not bypass approval, scope, evidence, or safety gates. Expected outputs: planning control record; evidence, risks, blockers, and next action."
---

# Flowstate Planning Controller

## Scope

- Scenario: Coordinate planning workers and user approval
- Action: apply the Controllers, Dispatch, and Agents workflow within the declared scope
- Intended outcome: planning control record
- Project scope: flowstate
- Departments: planning, execution, review
- Stages: discovery, design, implementation, validation
- Category: dispatch
- Subcategory: planning-controller
- Tags: dispatch, planning-controller

## Use when

- Coordinate planning workers and user approval

## Do not use when

- Do not use outside controllers, dispatch, and agents scenarios
- Do not bypass approval, scope, evidence, or safety gates

## Required inputs

- classified project context
- plan or task-local artifacts
- current constraints

## Required outputs

- planning control record
- evidence, risks, blockers, and next action

## Workflow

1. Confirm the scenario and project scope.
2. Verify the required inputs and prerequisites.
3. Perform only the declared action.
4. Produce every declared output and supporting evidence.
5. Report deviations, risks, blockers, and unresolved assumptions.

## Selection note

Use when the concrete scenario matches Coordinate planning workers and user approval.

## Safety

- Respect the current project mode and approval gate.
- Do not expand scope or claim completion without evidence.
- Side effect to control: may create governed planning, execution, review, or audit records
