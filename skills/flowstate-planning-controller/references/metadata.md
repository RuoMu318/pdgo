# Flowstate Planning Controller metadata

## Scenario

Coordinate planning workers and user approval

## Boundaries

- Do not use outside controllers, dispatch, and agents scenarios
- Do not bypass approval, scope, evidence, or safety gates

## Inputs

- classified project context
- plan or task-local artifacts
- current constraints

## Outputs

- planning control record
- evidence, risks, blockers, and next action

## Prerequisites

- FlowState startup classification
- declared scope
