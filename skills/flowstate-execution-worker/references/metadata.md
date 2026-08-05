# Flowstate Execution Worker metadata

## Scenario

Perform one exact approved task

## Boundaries

- Do not use outside controllers, dispatch, and agents scenarios
- Do not bypass approval, scope, evidence, or safety gates

## Inputs

- classified project context
- plan or task-local artifacts
- current constraints

## Outputs

- execution report
- evidence, risks, blockers, and next action

## Prerequisites

- FlowState startup classification
- declared scope
