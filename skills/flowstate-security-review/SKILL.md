---
name: flowstate-security-review
description: "Apply the FlowState review, testing, and validation workflow when the concrete scenario is: Review permissions, secrets, and unsafe side effects. Produce security findings with evidence and status. Use for scenarios: Review permissions, secrets, and unsafe side effects. Do not use for: Do not use outside review, testing, and validation scenarios; Do not bypass approval, scope, evidence, or safety gates. Expected outputs: security findings; evidence, risks, blockers, and next action."
---

# Flowstate Security Review

## Scope

- Scenario: Review permissions, secrets, and unsafe side effects
- Action: apply the Review, Testing, and Validation workflow within the declared scope
- Intended outcome: security findings
- Project scope: flowstate
- Departments: planning, execution, review
- Stages: discovery, design, implementation, validation
- Category: review
- Subcategory: security-review
- Tags: review, security-review

## Use when

- Review permissions, secrets, and unsafe side effects

## Do not use when

- Do not use outside review, testing, and validation scenarios
- Do not bypass approval, scope, evidence, or safety gates

## Required inputs

- classified project context
- plan or task-local artifacts
- current constraints

## Required outputs

- security findings
- evidence, risks, blockers, and next action

## Workflow

1. Confirm the scenario and project scope.
2. Verify the required inputs and prerequisites.
3. Perform only the declared action.
4. Produce every declared output and supporting evidence.
5. Report deviations, risks, blockers, and unresolved assumptions.

## Selection note

Use when the concrete scenario matches Review permissions, secrets, and unsafe side effects.

## Safety

- Respect the current project mode and approval gate.
- Do not expand scope or claim completion without evidence.
- Side effect to control: may create governed planning, execution, review, or audit records
