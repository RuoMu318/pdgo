---
name: flowstate-tdd
description: "Use a test-first loop inside the approved task scope and return the test evidence with the change. Use for scenarios: The task has a deterministic behavior contract; The project uses automated tests. Do not use for: Do not invent acceptance criteria; Do not skip the verification loop. Expected outputs: tests; implementation; test log; deviations."
---

# FlowState Test Driven Development

## Scope

- Scenario: a bounded code change needs test-first implementation
- Action: write a failing test, implement, and refactor
- Intended outcome: test-backed implementation evidence
- Project scope: flowstate
- Departments: planning, execution, review
- Stages: discovery, design, implementation, validation
- Category: review
- Subcategory: test-driven-development
- Tags: review, test-driven-development

## Use when

- The task has a deterministic behavior contract
- The project uses automated tests

## Do not use when

- Do not invent acceptance criteria
- Do not skip the verification loop

## Required inputs

- behavior contract
- test harness
- approved paths

## Required outputs

- tests
- implementation
- test log
- deviations

## Workflow

1. Confirm the scenario and project scope.
2. Verify the required inputs and prerequisites.
3. Perform only the declared action.
4. Produce every declared output and supporting evidence.
5. Report deviations, risks, blockers, and unresolved assumptions.

## Selection note

Use when the concrete scenario matches a bounded code change needs test-first implementation.

## Safety

- Respect the current project mode and approval gate.
- Do not expand scope or claim completion without evidence.
- Side effect to control: writes tests and implementation files
