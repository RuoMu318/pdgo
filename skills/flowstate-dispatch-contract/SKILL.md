---
name: flowstate-dispatch-contract
description: "Apply the FlowState controllers, dispatch, and agents workflow when the concrete scenario is: Build a complete PLAN_DISPATCH message. Produce dispatch contract with evidence and status. Use for scenarios: Build a complete PLAN_DISPATCH message. Do not use for: Do not use outside controllers, dispatch, and agents scenarios; Do not bypass approval, scope, evidence, or safety gates. Expected outputs: dispatch contract; evidence, risks, blockers, and next action."
---

# Flowstate Dispatch Contract

## Scope

- Scenario: Build a complete PLAN_DISPATCH message
- Action: apply the Controllers, Dispatch, and Agents workflow within the declared scope
- Intended outcome: dispatch contract
- Project scope: flowstate
- Departments: planning, execution, review
- Stages: discovery, design, implementation, validation
- Category: dispatch
- Subcategory: dispatch-contract
- Tags: dispatch, dispatch-contract

## Use when

- Build a complete PLAN_DISPATCH message

## Do not use when

- Do not use outside controllers, dispatch, and agents scenarios
- Do not bypass approval, scope, evidence, or safety gates

## Required inputs

- classified project context
- plan or task-local artifacts
- current constraints

## Required outputs

- dispatch contract
- evidence, risks, blockers, and next action

## Workflow

1. Confirm the scenario and project scope.
2. Verify the required inputs and prerequisites.
3. Perform only the declared action.
4. Produce every declared output and supporting evidence.
5. Report deviations, risks, blockers, and unresolved assumptions.

## Selection note

Use when the concrete scenario matches Build a complete PLAN_DISPATCH message.

## Safety

- Respect the current project mode and approval gate.
- Do not expand scope or claim completion without evidence.
- Side effect to control: may create governed planning, execution, review, or audit records
