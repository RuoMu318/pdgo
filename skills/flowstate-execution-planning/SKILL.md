---
name: flowstate-execution-planning
description: "Turn a clarified objective into bounded tasks, dependencies, evidence, risks, blockers, and rollback conditions. Use for scenarios: A goal needs an executable task ledger; A plan must be prepared for user approval. Do not use for: Do not dispatch before approval; Do not hide risks or blockers. Expected outputs: descriptive plan; task ledger; risk register; approval request."
---

# FlowState Execution Planning

## Scope

- Scenario: approved-scope decomposition into executable tasks
- Action: write a versioned plan and task ledger
- Intended outcome: approval-ready execution plan
- Project scope: flowstate
- Departments: planning, execution, review
- Stages: discovery, design, implementation, validation
- Category: planning
- Subcategory: execution-planning
- Tags: planning, execution-planning

## Use when

- A goal needs an executable task ledger
- A plan must be prepared for user approval

## Do not use when

- Do not dispatch before approval
- Do not hide risks or blockers

## Required inputs

- goal
- repository context
- constraints
- acceptance needs

## Required outputs

- descriptive plan
- task ledger
- risk register
- approval request

## Workflow

1. Confirm the scenario and project scope.
2. Verify the required inputs and prerequisites.
3. Perform only the declared action.
4. Produce every declared output and supporting evidence.
5. Report deviations, risks, blockers, and unresolved assumptions.

## Selection note

Use when the concrete scenario matches approved-scope decomposition into executable tasks.

## Safety

- Respect the current project mode and approval gate.
- Do not expand scope or claim completion without evidence.
- Side effect to control: writes plan and index records
