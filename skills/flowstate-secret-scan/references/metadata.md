# Flowstate Secret Scan metadata

## Scenario

Scan staged changes for credentials or sensitive data

## Boundaries

- Do not use outside release, audit, and external effects scenarios
- Do not bypass approval, scope, evidence, or safety gates

## Inputs

- classified project context
- plan or task-local artifacts
- current constraints

## Outputs

- secret scan
- evidence, risks, blockers, and next action

## Prerequisites

- FlowState startup classification
- declared scope
