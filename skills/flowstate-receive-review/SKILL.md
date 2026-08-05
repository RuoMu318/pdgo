---
name: flowstate-receive-review
description: "Record accepted, revision-required, blocked, or failed outcomes without silently changing the approved scope. Use for scenarios: A reviewer returns a decision; A planning controller must unlock or block a task. Do not use for: Do not accept missing evidence; Do not unlock dependents on a blocked decision. Expected outputs: review record; task status; next dispatch or blocker."
---

# FlowState Receive Review

## Scope

- Scenario: an independent review report returns to planning
- Action: compare evidence with exact acceptance criteria
- Intended outcome: review decision and next action
- Project scope: flowstate
- Departments: planning, execution, review
- Stages: discovery, design, implementation, validation
- Category: review
- Subcategory: receive-review
- Tags: review, receive-review

## Use when

- A reviewer returns a decision
- A planning controller must unlock or block a task

## Do not use when

- Do not accept missing evidence
- Do not unlock dependents on a blocked decision

## Required inputs

- review decision
- acceptance criteria
- evidence

## Required outputs

- review record
- task status
- next dispatch or blocker

## Workflow

1. Confirm the scenario and project scope.
2. Verify the required inputs and prerequisites.
3. Perform only the declared action.
4. Produce every declared output and supporting evidence.
5. Report deviations, risks, blockers, and unresolved assumptions.

## Selection note

Use when the concrete scenario matches an independent review report returns to planning.

## Safety

- Respect the current project mode and approval gate.
- Do not expand scope or claim completion without evidence.
- Side effect to control: may unlock a dependent task
