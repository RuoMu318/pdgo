---
name: flowstate-secret-scan
description: "Apply the FlowState release, audit, and external effects workflow when the concrete scenario is: Scan staged changes for credentials or sensitive data. Produce secret scan with evidence and status. Use for scenarios: Scan staged changes for credentials or sensitive data. Do not use for: Do not use outside release, audit, and external effects scenarios; Do not bypass approval, scope, evidence, or safety gates. Expected outputs: secret scan; evidence, risks, blockers, and next action."
---

# Flowstate Secret Scan

## Scope

- Scenario: Scan staged changes for credentials or sensitive data
- Action: apply the Release, Audit, and External Effects workflow within the declared scope
- Intended outcome: secret scan
- Project scope: flowstate
- Departments: planning, execution, review
- Stages: discovery, design, implementation, validation
- Category: release-audit
- Subcategory: secret-scan
- Tags: release-audit, secret-scan

## Use when

- Scan staged changes for credentials or sensitive data

## Do not use when

- Do not use outside release, audit, and external effects scenarios
- Do not bypass approval, scope, evidence, or safety gates

## Required inputs

- classified project context
- plan or task-local artifacts
- current constraints

## Required outputs

- secret scan
- evidence, risks, blockers, and next action

## Workflow

1. Confirm the scenario and project scope.
2. Verify the required inputs and prerequisites.
3. Perform only the declared action.
4. Produce every declared output and supporting evidence.
5. Report deviations, risks, blockers, and unresolved assumptions.

## Selection note

Use when the concrete scenario matches Scan staged changes for credentials or sensitive data.

## Safety

- Respect the current project mode and approval gate.
- Do not expand scope or claim completion without evidence.
- Side effect to control: may create governed planning, execution, review, or audit records
