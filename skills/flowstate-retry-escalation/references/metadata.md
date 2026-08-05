# Flowstate Retry Escalation metadata

## Scenario

Retry bounded failures and escalate after the limit

## Boundaries

- Do not use outside controllers, dispatch, and agents scenarios
- Do not bypass approval, scope, evidence, or safety gates

## Inputs

- classified project context
- plan or task-local artifacts
- current constraints

## Outputs

- retry decision
- evidence, risks, blockers, and next action

## Prerequisites

- FlowState startup classification
- declared scope
