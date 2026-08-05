# FlowState Parallel Dispatch metadata

## Scenario

independent tasks need concurrent execution

## Boundaries

- Do not parallelize shared writes
- Do not create a parallel branch without a parent series

## Inputs

- approved parallel plan
- task dependencies
- workspace policy

## Outputs

- parallel dispatches
- worker reports
- fan-in synchronization

## Prerequisites

- user approval
- isolated workspaces
