# BossCoding Codex integration status

Updated: 2026-08-15

## Goal

Build and verify a Codex-native BossCoding secretary layer on top of PDGO. The current Agent always
acts as the user-facing secretary front desk and completes ordinary work directly. Full secretary
governance loads only for high assurance or an explicit secretary/BossCoding entry. One read-only reviewer is added
only for external, destructive, difficult-to-reverse, or explicitly independent review; the full
planning, execution, and review trio remains an explicit opt-in. A user approves one exact batch,
then in-scope work advances until completion or a defined stop condition.

## Confirmed decisions

- Default user experience is an always-on secretary front desk at substantive intake, material
  boundary or risk changes, and closeout. It needs no special prefix and never changes evidence or
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
- The always-on front desk is presentation and accountability, not a secretary Skill or governance
  prompt load. Lightweight and standard zero-cost routing invariants remain unchanged.
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

Source base before the secretary-front-desk batch was `41c5680e510ce334e690a3120bd2a6082911960e`.
That commit SHA is historical evidence for the batch base, not a self-referential current-HEAD assertion.
The current local branch is `feat/lightweight-routing-v3`; this approved local batch makes the
secretary front desk always visible while retaining risk-based full-governance loading. The earlier
clean routing baseline was 140/140, and the source base after the merge-review repair was 141/141.
The current uncommitted batch passes the complete local validation set. It has not been committed,
pushed, merged, or reinstalled, so the installed Codex runtime and draft PR do not contain it.

## Residual limitations

- No local implementation blocker remains in the current uncommitted secretary-front-desk batch.
  It has not been committed, pushed, merged, reinstalled, or independently reviewed.
- Trusted ordinary-routing host attestation is unavailable because the current Codex tool surface
  does not expose an injected routing/telemetry receipt. The live write proves file behavior, not
  automatic mode selection, so `host_enforced` remains `false`.
- Billable Token evidence is unavailable because the host exposes neither provider billing usage
  for this run nor a goal-linked usage record. No estimate is substituted, so `savings_proven`
  remains `false`.
- These limitations require a future trusted Codex host adapter or provider billing interface; they
  cannot be solved honestly inside the PDGO repository alone.

## Closeout baseline

- Scope: local secretary/front-desk source contracts, consumer profile, public documentation,
  status records, and deterministic tests only.
- Forbidden: global reinstall, Git commit/push, publication, production changes, R01 changes, Vault
  writes, and fabricated host or Token evidence.
- Acceptance: current tests pass, the always-on front desk remains separate from risk-loaded
  governance, status and public docs match the uncommitted source reality,
  installed-runtime evidence is not carried across source drift, and unresolved external evidence
  dependencies are explicit.
- Rollback: revert only this uncommitted secretary-front-desk batch.
