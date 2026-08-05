---
name: flowstate-system-debugging
description: "Investigate a concrete failure with controlled experiments, preserve evidence, and stop at uncertainty instead of guessing. Use for scenarios: A reproducible system error is reported; The user asks for diagnosis before a fix. Do not use for: Do not apply an unapproved production fix; Do not claim root cause without evidence. Expected outputs: reproduction record; hypotheses; evidence; bounded remediation options."
---

# FlowState System Debugging

## Scope

- Scenario: a reproducible system failure needs diagnosis
- Action: reproduce, isolate, and report root-cause hypotheses
- Intended outcome: evidence-backed diagnostic report
- Project scope: flowstate
- Departments: planning, execution, review
- Stages: discovery, design, implementation, validation
- Category: debugging
- Subcategory: system-debugging
- Tags: debugging, system-debugging

## Use when

- A reproducible system error is reported
- The user asks for diagnosis before a fix

## Do not use when

- Do not apply an unapproved production fix
- Do not claim root cause without evidence

## Required inputs

- symptom
- reproduction
- runtime context
- logs

## Required outputs

- reproduction record
- hypotheses
- evidence
- bounded remediation options

## Workflow

1. Confirm the scenario and project scope.
2. Verify the required inputs and prerequisites.
3. Perform only the declared action.
4. Produce every declared output and supporting evidence.
5. Report deviations, risks, blockers, and unresolved assumptions.

## Selection note

Use when the concrete scenario matches a reproducible system failure needs diagnosis.

## Safety

- Respect the current project mode and approval gate.
- Do not expand scope or claim completion without evidence.
- Side effect to control: may run diagnostic commands
