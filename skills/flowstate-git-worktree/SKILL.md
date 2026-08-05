---
name: flowstate-git-worktree
description: "Create bounded worktrees for concurrent writers and record paths, branches, cleanup, and merge evidence. Use for scenarios: Independent tasks write to the same repository; A parallel dispatch needs workspace isolation. Do not use for: Do not rewrite another worker's worktree; Do not delete worktrees without approval. Expected outputs: worktree mapping; cleanup record; merge evidence."
---

# FlowState Git Worktree

## Scope

- Scenario: concurrent task workers need isolated Git workspaces
- Action: create and audit one worktree per writer
- Intended outcome: isolated workspace record
- Project scope: flowstate
- Departments: planning, execution, review
- Stages: discovery, design, implementation, validation
- Category: execution
- Subcategory: git-worktree
- Tags: execution, git-worktree

## Use when

- Independent tasks write to the same repository
- A parallel dispatch needs workspace isolation

## Do not use when

- Do not rewrite another worker's worktree
- Do not delete worktrees without approval

## Required inputs

- repository
- branch policy
- task IDs

## Required outputs

- worktree mapping
- cleanup record
- merge evidence

## Workflow

1. Confirm the scenario and project scope.
2. Verify the required inputs and prerequisites.
3. Perform only the declared action.
4. Produce every declared output and supporting evidence.
5. Report deviations, risks, blockers, and unresolved assumptions.

## Selection note

Use when the concrete scenario matches concurrent task workers need isolated Git workspaces.

## Safety

- Respect the current project mode and approval gate.
- Do not expand scope or claim completion without evidence.
- Side effect to control: creates Git worktrees
