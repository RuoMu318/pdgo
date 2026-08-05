---
name: flowstate-release-handoff
description: "Apply the FlowState release, audit, and external effects workflow when the concrete scenario is: Prepare release notes, evidence, and rollback handoff. Produce release handoff with evidence and status. Use for scenarios: Prepare release notes, evidence, and rollback handoff. Do not use for: Do not use outside release, audit, and external effects scenarios; Do not bypass approval, scope, evidence, or safety gates. Expected outputs: release handoff; evidence, risks, blockers, and next action."
---

# Flowstate Release Handoff

## Scope

- Scenario: Prepare release notes, evidence, and rollback handoff
- Action: apply the Release, Audit, and External Effects workflow within the declared scope
- Intended outcome: release handoff
- Project scope: flowstate
- Departments: planning, execution, review
- Stages: discovery, design, implementation, validation
- Category: release-audit
- Subcategory: release-handoff
- Tags: release-audit, release-handoff

## Use when

- Prepare release notes, evidence, and rollback handoff

## Do not use when

- Do not use outside release, audit, and external effects scenarios
- Do not bypass approval, scope, evidence, or safety gates

## Required inputs

- classified project context
- plan or task-local artifacts
- current constraints

## Required outputs

- release handoff
- evidence, risks, blockers, and next action

## Workflow

1. Confirm the scenario and project scope.
2. Verify the required inputs and prerequisites.
3. Perform only the declared action.
4. Produce every declared output and supporting evidence.
5. Report deviations, risks, blockers, and unresolved assumptions.

## Selection note

Use when the concrete scenario matches Prepare release notes, evidence, and rollback handoff.

## Safety

- Respect the current project mode and approval gate.
- Do not expand scope or claim completion without evidence.
- Side effect to control: may create governed planning, execution, review, or audit records
