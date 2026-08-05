---
name: flowstate-memory-checkpoint
description: "Apply the FlowState memory and knowledge workflow when the concrete scenario is: Record progress, decisions, and evidence. Produce checkpoint record with evidence and status. Use for scenarios: Record progress, decisions, and evidence. Do not use for: Do not use outside memory and knowledge scenarios; Do not bypass approval, scope, evidence, or safety gates. Expected outputs: checkpoint record; evidence, risks, blockers, and next action."
---

# Flowstate Memory Checkpoint

## Scope

- Scenario: Record progress, decisions, and evidence
- Action: apply the Memory and Knowledge workflow within the declared scope
- Intended outcome: checkpoint record
- Project scope: flowstate
- Departments: planning, execution, review
- Stages: discovery, design, implementation, validation
- Category: memory
- Subcategory: memory-checkpoint
- Tags: memory, memory-checkpoint

## Use when

- Record progress, decisions, and evidence

## Do not use when

- Do not use outside memory and knowledge scenarios
- Do not bypass approval, scope, evidence, or safety gates

## Required inputs

- classified project context
- plan or task-local artifacts
- current constraints

## Required outputs

- checkpoint record
- evidence, risks, blockers, and next action

## Workflow

1. Confirm the scenario and project scope.
2. Verify the required inputs and prerequisites.
3. Perform only the declared action.
4. Produce every declared output and supporting evidence.
5. Report deviations, risks, blockers, and unresolved assumptions.

## Selection note

Use when the concrete scenario matches Record progress, decisions, and evidence.

## Safety

- Respect the current project mode and approval gate.
- Do not expand scope or claim completion without evidence.
- Side effect to control: may create governed planning, execution, review, or audit records
