---
name: flowstate-memory-retrieval
description: "Find conversation and plan records through indexes first, read summaries before source turns, and record every reference. Use for scenarios: The current task depends on another conversation; A plan or knowledge record must be found. Do not use for: Do not assume a transcript was shared; Do not use draft memory as an execution fact. Expected outputs: retrieved summaries; source references; context decision."
---

# FlowState Memory Retrieval

## Scope

- Scenario: a task needs information from another conversation
- Action: search indexes, read summaries, and record references
- Intended outcome: traceable cross-session context
- Project scope: flowstate
- Departments: planning, execution, review
- Stages: discovery, design, implementation, validation
- Category: memory
- Subcategory: memory-retrieval
- Tags: memory, memory-retrieval

## Use when

- The current task depends on another conversation
- A plan or knowledge record must be found

## Do not use when

- Do not assume a transcript was shared
- Do not use draft memory as an execution fact

## Required inputs

- project ID
- search terms
- knowledge domain

## Required outputs

- retrieved summaries
- source references
- context decision

## Workflow

1. Confirm the scenario and project scope.
2. Verify the required inputs and prerequisites.
3. Perform only the declared action.
4. Produce every declared output and supporting evidence.
5. Report deviations, risks, blockers, and unresolved assumptions.

## Selection note

Use when the concrete scenario matches a task needs information from another conversation.

## Safety

- Respect the current project mode and approval gate.
- Do not expand scope or claim completion without evidence.
- Side effect to control: records cross-session references
