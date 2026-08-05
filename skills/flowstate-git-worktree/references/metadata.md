# FlowState Git Worktree metadata

## Scenario

concurrent task workers need isolated Git workspaces

## Boundaries

- Do not rewrite another worker's worktree
- Do not delete worktrees without approval

## Inputs

- repository
- branch policy
- task IDs

## Outputs

- worktree mapping
- cleanup record
- merge evidence

## Prerequisites

- Git repository
- parallel isolation decision
