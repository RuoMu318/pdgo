---
name: flowstate-bounded-implementation
description: "Apply the FlowState implementation and workspace workflow when the concrete scenario is: Implement exactly the approved task scope. Produce changed artifacts with evidence and status. Use for scenarios: Implement exactly the approved task scope. Do not use for: Do not use outside implementation and workspace scenarios; Do not bypass approval, scope, evidence, or safety gates. Expected outputs: changed artifacts; evidence, risks, blockers, and next action."
---

# Flowstate Bounded Implementation

## Scope

- Scenario: Implement exactly the approved task scope
- Action: apply the Implementation and Workspace workflow within the declared scope
- Intended outcome: changed artifacts
- Project scope: flowstate
- Departments: planning, execution, review
- Stages: discovery, design, implementation, validation
- Category: development
- Subcategory: bounded-implementation
- Tags: development, bounded-implementation

## Use when

- Implement exactly the approved task scope

## Do not use when

- Do not use outside implementation and workspace scenarios
- Do not bypass approval, scope, evidence, or safety gates

## Required inputs

- classified project context
- plan or task-local artifacts
- current constraints

## Required outputs

- changed artifacts
- evidence, risks, blockers, and next action

## Workflow

1. Confirm the scenario and project scope.
2. Verify the required inputs and prerequisites.
3. Perform only the declared action.
4. Produce every declared output and supporting evidence.
5. Report deviations, risks, blockers, and unresolved assumptions.

## Selection note

Use when the concrete scenario matches Implement exactly the approved task scope.

## Safety

- Respect the current project mode and approval gate.
- Do not expand scope or claim completion without evidence.
- Side effect to control: may create governed planning, execution, review, or audit records
