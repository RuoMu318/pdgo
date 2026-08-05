# Flowstate File Queue Adapter metadata

## Scenario

Use an auditable local queue without a conversation API

## Boundaries

- Do not use outside platform adapters and session transport scenarios
- Do not bypass approval, scope, evidence, or safety gates

## Inputs

- classified project context
- plan or task-local artifacts
- current constraints

## Outputs

- queue message
- evidence, risks, blockers, and next action

## Prerequisites

- FlowState startup classification
- declared scope
