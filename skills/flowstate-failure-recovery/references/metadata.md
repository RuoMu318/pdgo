# Flowstate Failure Recovery metadata

## Scenario

Recover from a failed task within policy

## Boundaries

- Do not use outside debugging and recovery scenarios
- Do not bypass approval, scope, evidence, or safety gates

## Inputs

- classified project context
- plan or task-local artifacts
- current constraints

## Outputs

- recovery decision
- evidence, risks, blockers, and next action

## Prerequisites

- FlowState startup classification
- declared scope
