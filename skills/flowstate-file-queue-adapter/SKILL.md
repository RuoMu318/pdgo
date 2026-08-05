---
name: flowstate-file-queue-adapter
description: "Apply the FlowState platform adapters and session transport workflow when the concrete scenario is: Use an auditable local queue without a conversation API. Produce queue message with evidence and status. Use for scenarios: Use an auditable local queue without a conversation API. Do not use for: Do not use outside platform adapters and session transport scenarios; Do not bypass approval, scope, evidence, or safety gates. Expected outputs: queue message; evidence, risks, blockers, and next action."
---

# Flowstate File Queue Adapter

## Scope

- Scenario: Use an auditable local queue without a conversation API
- Action: apply the Platform Adapters and Session Transport workflow within the declared scope
- Intended outcome: queue message
- Project scope: flowstate
- Departments: planning, execution, review
- Stages: discovery, design, implementation, validation
- Category: adapters
- Subcategory: file-queue-adapter
- Tags: adapters, file-queue-adapter

## Use when

- Use an auditable local queue without a conversation API

## Do not use when

- Do not use outside platform adapters and session transport scenarios
- Do not bypass approval, scope, evidence, or safety gates

## Required inputs

- classified project context
- plan or task-local artifacts
- current constraints

## Required outputs

- queue message
- evidence, risks, blockers, and next action

## Workflow

1. Confirm the scenario and project scope.
2. Verify the required inputs and prerequisites.
3. Perform only the declared action.
4. Produce every declared output and supporting evidence.
5. Report deviations, risks, blockers, and unresolved assumptions.

## Selection note

Use when the concrete scenario matches Use an auditable local queue without a conversation API.

## Safety

- Respect the current project mode and approval gate.
- Do not expand scope or claim completion without evidence.
- Side effect to control: may create governed planning, execution, review, or audit records
