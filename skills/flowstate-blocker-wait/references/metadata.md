# Flowstate Blocker Wait metadata

## Scenario

Pause execution and expose a blocking decision

## Boundaries

- Do not use outside debugging and recovery scenarios
- Do not bypass approval, scope, evidence, or safety gates

## Inputs

- classified project context
- plan or task-local artifacts
- current constraints

## Outputs

- waiting record
- evidence, risks, blockers, and next action

## Prerequisites

- FlowState startup classification
- declared scope
