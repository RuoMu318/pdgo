---
name: flowstate-memory-start
description: "Apply the FlowState memory and knowledge workflow when the concrete scenario is: Record a conversation instruction and scope. Produce session start record with evidence and status. Use for scenarios: Record a conversation instruction and scope. Do not use for: Do not use outside memory and knowledge scenarios; Do not bypass approval, scope, evidence, or safety gates. Expected outputs: session start record; evidence, risks, blockers, and next action."
---

# Flowstate Memory Start

## Scope

- Scenario: Record a conversation instruction and scope
- Action: apply the Memory and Knowledge workflow within the declared scope
- Intended outcome: session start record
- Project scope: flowstate
- Departments: planning, execution, review
- Stages: discovery, design, implementation, validation
- Category: memory
- Subcategory: memory-start
- Tags: memory, memory-start

## Use when

- Record a conversation instruction and scope

## Do not use when

- Do not use outside memory and knowledge scenarios
- Do not bypass approval, scope, evidence, or safety gates

## Required inputs

- classified project context
- plan or task-local artifacts
- current constraints

## Required outputs

- session start record
- evidence, risks, blockers, and next action

## Workflow

1. Confirm the scenario and project scope.
2. Verify the required inputs and prerequisites.
3. Perform only the declared action.
4. Produce every declared output and supporting evidence.
5. Report deviations, risks, blockers, and unresolved assumptions.

## Selection note

Use when the concrete scenario matches Record a conversation instruction and scope.

## Safety

- Respect the current project mode and approval gate.
- Do not expand scope or claim completion without evidence.
- Side effect to control: may create governed planning, execution, review, or audit records
