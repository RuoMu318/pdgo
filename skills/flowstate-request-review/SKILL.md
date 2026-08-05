---
name: flowstate-request-review
description: "Package the exact plan version, acceptance criteria, diff, tests, risks, and questions for an independent reviewer. Use for scenarios: A worker report is ready for review; The plan requires independent acceptance. Do not use for: Do not ask the worker to approve itself; Do not change acceptance criteria in the review request. Expected outputs: review request; review scope; review questions."
---

# FlowState Request Review

## Scope

- Scenario: completed work needs an independent review
- Action: prepare a criteria-bound review request
- Intended outcome: review dispatch
- Project scope: flowstate
- Departments: planning, execution, review
- Stages: discovery, design, implementation, validation
- Category: review
- Subcategory: request-review
- Tags: review, request-review

## Use when

- A worker report is ready for review
- The plan requires independent acceptance

## Do not use when

- Do not ask the worker to approve itself
- Do not change acceptance criteria in the review request

## Required inputs

- execution report
- plan acceptance
- evidence

## Required outputs

- review request
- review scope
- review questions

## Workflow

1. Confirm the scenario and project scope.
2. Verify the required inputs and prerequisites.
3. Perform only the declared action.
4. Produce every declared output and supporting evidence.
5. Report deviations, risks, blockers, and unresolved assumptions.

## Selection note

Use when the concrete scenario matches completed work needs an independent review.

## Safety

- Respect the current project mode and approval gate.
- Do not expand scope or claim completion without evidence.
- Side effect to control: creates review dispatch
