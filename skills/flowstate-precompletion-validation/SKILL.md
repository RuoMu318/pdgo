---
name: flowstate-precompletion-validation
description: "Check every acceptance criterion, required evidence item, rollback condition, and new risk before completion. Use for scenarios: A worker reports completion; A dependent task is about to unlock. Do not use for: Do not treat self-reported success as evidence; Do not close unresolved blockers. Expected outputs: completion decision; evidence checklist; remaining risks."
---

# FlowState Precompletion Validation

## Scope

- Scenario: a task is about to be marked complete
- Action: run the declared validation and audit the evidence
- Intended outcome: completion gate decision
- Project scope: flowstate
- Departments: planning, execution, review
- Stages: discovery, design, implementation, validation
- Category: review
- Subcategory: precompletion-validation
- Tags: review, precompletion-validation

## Use when

- A worker reports completion
- A dependent task is about to unlock

## Do not use when

- Do not treat self-reported success as evidence
- Do not close unresolved blockers

## Required inputs

- plan acceptance
- execution report
- tests
- diff

## Required outputs

- completion decision
- evidence checklist
- remaining risks

## Workflow

1. Confirm the scenario and project scope.
2. Verify the required inputs and prerequisites.
3. Perform only the declared action.
4. Produce every declared output and supporting evidence.
5. Report deviations, risks, blockers, and unresolved assumptions.

## Selection note

Use when the concrete scenario matches a task is about to be marked complete.

## Safety

- Respect the current project mode and approval gate.
- Do not expand scope or claim completion without evidence.
- Side effect to control: runs validation commands
