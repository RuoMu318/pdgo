# BossCoding Codex integration status

Updated: 2026-08-09

## Goal

Build and verify a Codex-native BossCoding secretary layer on top of PDGO. The main Agent is the
only user-facing secretary; planning, execution, and independent review use separate task-scoped
subagents. A user approves one exact plan version, then in-scope work advances automatically until
completion or a defined stop condition.

## Confirmed decisions

- Default user experience is direct secretary invocation; presentation never changes evidence or
  authorization rules.
- The secretary may coordinate and advise, but may not change direction, lower acceptance criteria,
  suppress disagreement, or accept failed work.
- Project files are authoritative for current project state. Obsidian is the single global task
  system and a curated cross-project knowledge base.
- Existing projects are understood in place. New projects use a minimal durable state record.
- Simple explanations and low-risk read-only work may stay single-Agent. Formal modifications use
  planning, execution, and independent review.
- After the initial failure baseline, two completed correction rounds with the same unresolved issue
  and no new evidence stop automatic revision and return a plain-language report.

## Allowed scope

- Add the BossCoding secretary and Codex-native bridge Skills, profiles, documentation, tests, and
  additive PDGO runtime fields needed for a distinct reviewer session.
- Fix the Windows CRLF prompt-integrity defect exposed by the unmodified baseline.
- Install only the verified Skills and global policy overlay after all gates pass.
- Synchronize the existing Obsidian task system at start, blockers, and completion.

## Forbidden scope

- Do not modify the course product repository.
- Do not push to GitHub, publish, send external messages, deploy, or run a persistent daemon.
- Do not make the planner, executor, reviewer, or secretary capable of self-approval.
- Do not weaken, skip, delete, or mock away existing validation.

## Completion

1. Existing validation and Node tests pass with zero failures, skips, or todos.
2. New contract tests prove five-field startup, exact plan approval, a distinct reviewer identity,
   conflict escalation, and the two-no-progress stop rule.
3. A real Codex run uses separate planning, execution, and review subagents on an isolated fixture.
4. Only after 1-3 pass, global Skill installation and the global policy overlay are verified.

## Current action

Approved plan `BOSSCODING-CAPABILITY-AWARENESS-20260809-v2` T01 fixes revision worker rebinding
without deleting historical reports or weakening worker identity checks. The user-facing
`本次用人卡`, `实际贡献卡`, three-source live capability query, Persona fact-source, and
evidence-gated persistence contracts are present. Six targeted red/green capability contract slices pass,
and the dispatcher regression is 1/1. Full validation passes: the integration file is 17/17,
the dispatcher file is 52/52, and the full Node suite is 111/111 with zero failures, skips, or todos;
project validation, smoke, both Skill quick validations, and diff checks also pass. Independent
review has not run for v2 T01; no acceptance is claimed.
