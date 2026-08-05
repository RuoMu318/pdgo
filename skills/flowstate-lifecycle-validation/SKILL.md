---
name: flowstate-lifecycle-validation
description: "Apply the FlowState review, testing, and validation workflow when the concrete scenario is: Check resource ownership and cleanup lifecycle. Produce lifecycle report with evidence and status. Use for scenarios: Check resource ownership and cleanup lifecycle. Do not use for: Do not use outside review, testing, and validation scenarios; Do not bypass approval, scope, evidence, or safety gates. Expected outputs: lifecycle report; evidence, risks, blockers, and next action."
---

# Flowstate Lifecycle Validation

## Scope

- Scenario: Check resource ownership and cleanup lifecycle
- Action: apply the Review, Testing, and Validation workflow within the declared scope
- Intended outcome: lifecycle report
- Project scope: flowstate
- Departments: planning, execution, review
- Stages: discovery, design, implementation, validation
- Category: review
- Subcategory: lifecycle-validation
- Tags: review, lifecycle-validation

## Use when

- Check resource ownership and cleanup lifecycle

## Do not use when

- Do not use outside review, testing, and validation scenarios
- Do not bypass approval, scope, evidence, or safety gates

## Required inputs

- classified project context
- plan or task-local artifacts
- current constraints

## Required outputs

- lifecycle report
- evidence, risks, blockers, and next action

## Workflow

1. Confirm the scenario and project scope.
2. Verify the required inputs and prerequisites.
3. Perform only the declared action.
4. Produce every declared output and supporting evidence.
5. Report deviations, risks, blockers, and unresolved assumptions.

## Selection note

Use when the concrete scenario matches Check resource ownership and cleanup lifecycle.

## Safety

- Respect the current project mode and approval gate.
- Do not expand scope or claim completion without evidence.
- Side effect to control: may create governed planning, execution, review, or audit records
