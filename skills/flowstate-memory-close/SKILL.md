---
name: flowstate-memory-close
description: "Apply the FlowState memory and knowledge workflow when the concrete scenario is: Summarize a completed or blocked conversation. Produce conversation summary with evidence and status. Use for scenarios: Summarize a completed or blocked conversation. Do not use for: Do not use outside memory and knowledge scenarios; Do not bypass approval, scope, evidence, or safety gates. Expected outputs: conversation summary; evidence, risks, blockers, and next action."
---

# Flowstate Memory Close

## Scope

- Scenario: Summarize a completed or blocked conversation
- Action: apply the Memory and Knowledge workflow within the declared scope
- Intended outcome: conversation summary
- Project scope: flowstate
- Departments: planning, execution, review
- Stages: discovery, design, implementation, validation
- Category: memory
- Subcategory: memory-close
- Tags: memory, memory-close

## Use when

- Summarize a completed or blocked conversation

## Do not use when

- Do not use outside memory and knowledge scenarios
- Do not bypass approval, scope, evidence, or safety gates

## Required inputs

- classified project context
- plan or task-local artifacts
- current constraints

## Required outputs

- conversation summary
- evidence, risks, blockers, and next action

## Workflow

1. Confirm the scenario and project scope.
2. Verify the required inputs and prerequisites.
3. Perform only the declared action.
4. Produce every declared output and supporting evidence.
5. Report deviations, risks, blockers, and unresolved assumptions.

## Selection note

Use when the concrete scenario matches Summarize a completed or blocked conversation.

## Safety

- Respect the current project mode and approval gate.
- Do not expand scope or claim completion without evidence.
- Side effect to control: may create governed planning, execution, review, or audit records
