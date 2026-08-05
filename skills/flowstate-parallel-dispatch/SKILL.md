---
name: flowstate-parallel-dispatch
description: "Dispatch only independent tasks with isolated workspaces, then synchronize accepted evidence to the parent planning session. Use for scenarios: Tasks have no hidden dependency or shared mutable writes; A parallel plan is explicitly approved. Do not use for: Do not parallelize shared writes; Do not create a parallel branch without a parent series. Expected outputs: parallel dispatches; worker reports; fan-in synchronization."
---

# FlowState Parallel Dispatch

## Scope

- Scenario: independent tasks need concurrent execution
- Action: fan out approved dispatches and reconcile results
- Intended outcome: audited parallel execution and fan-in report
- Project scope: flowstate
- Departments: planning, execution, review
- Stages: discovery, design, implementation, validation
- Category: execution
- Subcategory: parallel-dispatch
- Tags: execution, parallel-dispatch

## Use when

- Tasks have no hidden dependency or shared mutable writes
- A parallel plan is explicitly approved

## Do not use when

- Do not parallelize shared writes
- Do not create a parallel branch without a parent series

## Required inputs

- approved parallel plan
- task dependencies
- workspace policy

## Required outputs

- parallel dispatches
- worker reports
- fan-in synchronization

## Workflow

1. Confirm the scenario and project scope.
2. Verify the required inputs and prerequisites.
3. Perform only the declared action.
4. Produce every declared output and supporting evidence.
5. Report deviations, risks, blockers, and unresolved assumptions.

## Selection note

Use when the concrete scenario matches independent tasks need concurrent execution.

## Safety

- Respect the current project mode and approval gate.
- Do not expand scope or claim completion without evidence.
- Side effect to control: creates parallel worker sessions
