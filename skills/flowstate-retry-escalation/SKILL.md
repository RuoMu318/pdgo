---
name: flowstate-retry-escalation
description: "Apply the FlowState controllers, dispatch, and agents workflow when the concrete scenario is: Retry bounded failures and escalate after the limit. Produce retry decision with evidence and status. Use for scenarios: Retry bounded failures and escalate after the limit. Do not use for: Do not use outside controllers, dispatch, and agents scenarios; Do not bypass approval, scope, evidence, or safety gates. Expected outputs: retry decision; evidence, risks, blockers, and next action."
---

# Flowstate Retry Escalation

## Scope

- Scenario: Retry bounded failures and escalate after the limit
- Action: apply the Controllers, Dispatch, and Agents workflow within the declared scope
- Intended outcome: retry decision
- Project scope: flowstate
- Departments: planning, execution, review
- Stages: discovery, design, implementation, validation
- Category: dispatch
- Subcategory: retry-escalation
- Tags: dispatch, retry-escalation

## Use when

- Retry bounded failures and escalate after the limit

## Do not use when

- Do not use outside controllers, dispatch, and agents scenarios
- Do not bypass approval, scope, evidence, or safety gates

## Required inputs

- classified project context
- plan or task-local artifacts
- current constraints

## Required outputs

- retry decision
- evidence, risks, blockers, and next action

## Workflow

1. Confirm the scenario and project scope.
2. Verify the required inputs and prerequisites.
3. Perform only the declared action.
4. Produce every declared output and supporting evidence.
5. Report deviations, risks, blockers, and unresolved assumptions.

## Selection note

Use when the concrete scenario matches Retry bounded failures and escalate after the limit.

## Safety

- Respect the current project mode and approval gate.
- Do not expand scope or claim completion without evidence.
- Side effect to control: may create governed planning, execution, review, or audit records
