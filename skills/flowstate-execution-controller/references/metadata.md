# Flowstate Execution Controller metadata

## Scenario

Dispatch approved tasks and collect worker reports

## Boundaries

- Do not use outside controllers, dispatch, and agents scenarios
- Do not bypass approval, scope, evidence, or safety gates

## Inputs

- classified project context
- plan or task-local artifacts
- current constraints

## Outputs

- execution control record
- evidence, risks, blockers, and next action

## Prerequisites

- FlowState startup classification
- declared scope
