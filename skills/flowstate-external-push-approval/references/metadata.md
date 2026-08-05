# Flowstate External Push Approval metadata

## Scenario

Gate a remote push on explicit authorization

## Boundaries

- Do not use outside release, audit, and external effects scenarios
- Do not bypass approval, scope, evidence, or safety gates

## Inputs

- classified project context
- plan or task-local artifacts
- current constraints

## Outputs

- push approval
- evidence, risks, blockers, and next action

## Prerequisites

- FlowState startup classification
- declared scope
