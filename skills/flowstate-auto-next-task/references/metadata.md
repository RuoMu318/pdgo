# Flowstate Auto Next Task metadata

## Scenario

Unlock and dispatch the next accepted dependent task

## Boundaries

- Do not use outside controllers, dispatch, and agents scenarios
- Do not bypass approval, scope, evidence, or safety gates

## Inputs

- classified project context
- plan or task-local artifacts
- current constraints

## Outputs

- next-task dispatch
- evidence, risks, blockers, and next action

## Prerequisites

- FlowState startup classification
- declared scope
