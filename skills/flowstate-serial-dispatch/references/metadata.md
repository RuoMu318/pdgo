# Flowstate Serial Dispatch metadata

## Scenario

Run dependent tasks one at a time

## Boundaries

- Do not use outside controllers, dispatch, and agents scenarios
- Do not bypass approval, scope, evidence, or safety gates

## Inputs

- classified project context
- plan or task-local artifacts
- current constraints

## Outputs

- serial dispatch record
- evidence, risks, blockers, and next action

## Prerequisites

- FlowState startup classification
- declared scope
