---
name: flowstate-subagent-development
description: "Use an independent task worker with explicit paths, Skills, stop conditions, and a fixed return destination. Use for scenarios: A plan task is approved and ready; The execution controller needs a bounded worker. Do not use for: Worker cannot self-approve; Worker cannot expand scope. Expected outputs: changed artifacts; tests; evidence; risks; blockers."
---

# FlowState Subagent Development

## Scope

- Scenario: one bounded task should be performed by a task worker
- Action: send a scoped dispatch and collect evidence
- Intended outcome: structured execution report
- Project scope: flowstate
- Departments: planning, execution, review
- Stages: discovery, design, implementation, validation
- Category: execution
- Subcategory: subagent-development
- Tags: execution, subagent-development

## Use when

- A plan task is approved and ready
- The execution controller needs a bounded worker

## Do not use when

- Worker cannot self-approve
- Worker cannot expand scope

## Required inputs

- PLAN_DISPATCH
- allowed paths
- acceptance criteria

## Required outputs

- changed artifacts
- tests
- evidence
- risks
- blockers

## Workflow

1. Confirm the scenario and project scope.
2. Verify the required inputs and prerequisites.
3. Perform only the declared action.
4. Produce every declared output and supporting evidence.
5. Report deviations, risks, blockers, and unresolved assumptions.

## Selection note

Use when the concrete scenario matches one bounded task should be performed by a task worker.

## Safety

- Respect the current project mode and approval gate.
- Do not expand scope or claim completion without evidence.
- Side effect to control: may change an isolated workspace
