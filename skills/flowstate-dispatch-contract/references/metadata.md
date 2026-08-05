# Flowstate Dispatch Contract metadata

## Scenario

Build a complete PLAN_DISPATCH message

## Boundaries

- Do not use outside controllers, dispatch, and agents scenarios
- Do not bypass approval, scope, evidence, or safety gates

## Inputs

- classified project context
- plan or task-local artifacts
- current constraints

## Outputs

- dispatch contract
- evidence, risks, blockers, and next action

## Prerequisites

- FlowState startup classification
- declared scope
