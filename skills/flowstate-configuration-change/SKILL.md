---
name: flowstate-configuration-change
description: "Apply the FlowState implementation and workspace workflow when the concrete scenario is: Apply a bounded configuration change. Produce configuration diff with evidence and status. Use for scenarios: Apply a bounded configuration change. Do not use for: Do not use outside implementation and workspace scenarios; Do not bypass approval, scope, evidence, or safety gates. Expected outputs: configuration diff; evidence, risks, blockers, and next action."
---

# Flowstate Configuration Change

## Scope

- Scenario: Apply a bounded configuration change
- Action: apply the Implementation and Workspace workflow within the declared scope
- Intended outcome: configuration diff
- Project scope: flowstate
- Departments: planning, execution, review
- Stages: discovery, design, implementation, validation
- Category: development
- Subcategory: configuration-change
- Tags: development, configuration-change

## Use when

- Apply a bounded configuration change

## Do not use when

- Do not use outside implementation and workspace scenarios
- Do not bypass approval, scope, evidence, or safety gates

## Required inputs

- classified project context
- plan or task-local artifacts
- current constraints

## Required outputs

- configuration diff
- evidence, risks, blockers, and next action

## Workflow

1. Confirm the scenario and project scope.
2. Verify the required inputs and prerequisites.
3. Perform only the declared action.
4. Produce every declared output and supporting evidence.
5. Report deviations, risks, blockers, and unresolved assumptions.

## Selection note

Use when the concrete scenario matches Apply a bounded configuration change.

## Safety

- Respect the current project mode and approval gate.
- Do not expand scope or claim completion without evidence.
- Side effect to control: may create governed planning, execution, review, or audit records
