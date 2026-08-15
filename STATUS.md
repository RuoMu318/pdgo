# BossCoding Codex integration status

Updated: 2026-08-15

## Goal

Build and verify a Codex-native BossCoding secretary layer on top of PDGO. The main Agent is the
only user-facing secretary and completes ordinary work directly. One read-only reviewer is added
only for external, destructive, difficult-to-reverse, or explicitly independent review; the full
planning, execution, and review trio remains an explicit opt-in. A user approves one exact batch,
then in-scope work advances until completion or a defined stop condition.

## Confirmed decisions

- Default user experience is direct secretary invocation; presentation never changes evidence or
  authorization rules.
- The secretary may coordinate and advise, but may not change direction, lower acceptance criteria,
  suppress disagreement, or accept failed work.
- Project files are authoritative for current project state. Obsidian is the single global task
  system and a curated cross-project knowledge base.
- Existing projects are understood in place. New projects use a minimal durable state record.
- Lightweight and standard work stay with the current Agent. High-assurance work also defaults to
  the current Agent; one read-only reviewer is added only for external, destructive,
  difficult-to-reverse, or explicitly independently reviewed work. Full three-role PDGO remains an
  explicit opt-in.
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
5. Three-mode routing remains honest about host evidence: local source tests and file behavior do
   not become trusted host attestation or billable Token evidence.

## Current action

The current local branch is `feat/lightweight-routing-v3` at HEAD `5a706b46e159f2829732e880a05565d4118bc59f`.
The latest committed Node baseline was 140/140; the current uncommitted merge-review repair passes
141/141 with zero failures, skips, or todos. Repository validation, smoke, and both Codex-native Skill
quick validations also pass. The installed Codex runtime descriptor was last verified before this
uncommitted repair. A real bounded
local write also completed with the current Agent, zero subagents, no observed PDGO state change,
no added approval round, and exact cleanup.

## Residual limitations

- No local implementation blocker remains in the current uncommitted repair. It has not been
  committed, pushed, merged, reinstalled, or independently reviewed.
- Trusted ordinary-routing host attestation is unavailable because the current Codex tool surface
  does not expose an injected routing/telemetry receipt. The live write proves file behavior, not
  automatic mode selection, so `host_enforced` remains `false`.
- Billable Token evidence is unavailable because the host exposes neither provider billing usage
  for this run nor a goal-linked usage record. No estimate is substituted, so `savings_proven`
  remains `false`.
- These limitations require a future trusted Codex host adapter or provider billing interface; they
  cannot be solved honestly inside the PDGO repository alone.

## Closeout baseline

- Scope: local source, documentation, status records, and deterministic tests only.
- Forbidden: global reinstall, Git commit/push, publication, production changes, R01 changes, Vault
  writes, and fabricated host or Token evidence.
- Acceptance: current tests pass, status and public docs match the uncommitted source reality,
  installed-runtime evidence is not carried across source drift, and unresolved external evidence
  dependencies are explicit.
- Rollback: revert only this uncommitted closeout documentation/test batch.
