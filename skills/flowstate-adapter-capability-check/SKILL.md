---
name: flowstate-adapter-capability-check
description: "Apply the FlowState platform adapters and session transport workflow when the concrete scenario is: Check whether a platform supports a required operation. Produce capability result with evidence and status. Use for scenarios: Check whether a platform supports a required operation. Do not use for: Do not use outside platform adapters and session transport scenarios; Do not bypass approval, scope, evidence, or safety gates. Expected outputs: capability result; evidence, risks, blockers, and next action."
---

# Flowstate Adapter Capability Check

## Scope

- Scenario: Check whether a platform supports a required operation
- Action: apply the Platform Adapters and Session Transport workflow within the declared scope
- Intended outcome: capability result
- Project scope: flowstate
- Departments: planning, execution, review
- Stages: discovery, design, implementation, validation
- Category: adapters
- Subcategory: adapter-capability-check
- Tags: adapters, adapter-capability-check

## Use when

- Check whether a platform supports a required operation

## Do not use when

- Do not use outside platform adapters and session transport scenarios
- Do not bypass approval, scope, evidence, or safety gates

## Required inputs

- classified project context
- plan or task-local artifacts
- current constraints

## Required outputs

- capability result
- evidence, risks, blockers, and next action

## Workflow

1. Confirm the scenario and project scope.
2. Verify the required inputs and prerequisites.
3. Perform only the declared action.
4. Produce every declared output and supporting evidence.
5. Report deviations, risks, blockers, and unresolved assumptions.

## Selection note

Use when the concrete scenario matches Check whether a platform supports a required operation.

## Safety

- Respect the current project mode and approval gate.
- Do not expand scope or claim completion without evidence.
- Side effect to control: may create governed planning, execution, review, or audit records
