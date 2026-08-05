---
name: flowstate-branch-completion
description: "Run completion checks, capture evidence, record deviations, and prepare a safe handoff without silently merging. Use for scenarios: A task or branch reports implementation complete; A handoff or merge decision is requested. Do not use for: Do not merge or push without authorization; Do not omit failing checks. Expected outputs: completion checklist; handoff report; residual risks."
---

# FlowState Branch Completion

## Scope

- Scenario: an approved development branch is ready for handoff
- Action: verify, summarize, and prepare branch completion
- Intended outcome: handoff and change audit report
- Project scope: flowstate
- Departments: planning, execution, review
- Stages: discovery, design, implementation, validation
- Category: release
- Subcategory: branch-completion
- Tags: release, branch-completion

## Use when

- A task or branch reports implementation complete
- A handoff or merge decision is requested

## Do not use when

- Do not merge or push without authorization
- Do not omit failing checks

## Required inputs

- branch diff
- test results
- plan acceptance

## Required outputs

- completion checklist
- handoff report
- residual risks

## Workflow

1. Confirm the scenario and project scope.
2. Verify the required inputs and prerequisites.
3. Perform only the declared action.
4. Produce every declared output and supporting evidence.
5. Report deviations, risks, blockers, and unresolved assumptions.

## Selection note

Use when the concrete scenario matches an approved development branch is ready for handoff.

## Safety

- Respect the current project mode and approval gate.
- Do not expand scope or claim completion without evidence.
- Side effect to control: may run validation commands
