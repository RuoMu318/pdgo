# PDGO

**Project Development Governance Orchestrator** is a governed development method for Codex and other tool-using agents. It combines scenario-based routing, human-approved plans, isolated execution, evidence-bound review, dialogue memory, and auditable external Agent dispatch.

**Language:** [English](README.md) | [简体中文](README.zh-CN.md)

## Quickstart

PDGO starts at the beginning of a project task. It classifies the project, operation, department, stage, concrete scenario, inputs, outputs, constraints, risk, mode, and approval state before selecting an active Skill.

Install or link this repository as a plugin for the harness you use. The active directory contains exactly ten PDGO Skills; the locked Superpowers baseline is kept separately under `integrations/external-skills/superpowers/upstream/`.

```powershell
npm.cmd install
npm.cmd run test:node
npm.cmd run validate
```

## How It Works

PDGO does not jump from a vague request to code. The Planning Department first works with the user to define the objective, observable result, allowed and excluded scope, assumptions, dependencies, acceptance criteria, evidence, risks, blockers, rollback, and stop conditions. Detail is not deepened unless requested.

Long work is split into named serial and parallel stages. Each stage declares the active Skills, Agency Agent selectors, dependencies, isolation policy, and acceptance gate. After a version-bound approval, the Execution Department receives one exact dispatch at a time. Reports return to Planning for independent review. Accepted evidence unlocks the next task; `revision-required` creates only an in-scope correction; blockers stop the series.

The runtime can resume persisted queues or watch for new reports and reviews. Continuous automatic dispatch requires a real connected transport and a real worker session. The File Queue adapter is an explicit, auditable handoff mechanism and never counts as proof that an Agent session is running.

## Basic Workflow

1. **Route** - Select `pdgo-route-work` from the full scenario contract. Reject incompatible candidates and stop with `skill-unresolved` when no reliable match exists.
2. **Remember** - Use `pdgo-dialogue-memory` to record the instruction, checkpoints, decisions, references, and close summary. Search indexes before reading historical source turns.
3. **Plan** - Use `pdgo-plan-work` to explore intent, write a versioned plan, and split work into serial or isolated parallel stages. Planning is not execution.
4. **Approve** - Require a `USER_PLAN_APPROVAL` whose `plan_id`, `plan_version`, acknowledged risks, blocker dispositions, scope, and conditions match exactly.
5. **Execute** - Use `pdgo-execute-work` for the immutable dispatch, worktree isolation, independent task workers, bounded correction loops, and evidence collection.
6. **Review** - Use `pdgo-review-request` and `pdgo-review-receive`. A worker cannot approve itself, and dependents remain locked until acceptance.
7. **Debug or test** - Use `pdgo-debug-work` for controlled root-cause investigation and `pdgo-tdd-work` for the red-green-refactor loop inside approved scope.
8. **Complete** - Use `pdgo-completion-work` to run the declared checks, record residual risk, and prepare an audited branch handoff without silently merging or pushing.
9. **Author** - Use `pdgo-skill-authoring` when a repeatable scenario has no reliable Skill. A Skill is authored from routing metadata, not from a name.

## Active Skills

| Skill | Integrated capability |
|---|---|
| `pdgo-route-work` | Scenario routing and startup bootstrap |
| `pdgo-dialogue-memory` | Indexed conversation memory and handoff |
| `pdgo-plan-work` | Planning, brainstorming, and writing plans |
| `pdgo-execute-work` | Execution, parallel dispatch, subagents, and worktrees |
| `pdgo-review-request` | Independent review requests |
| `pdgo-review-receive` | Evidence-bound review decisions |
| `pdgo-debug-work` | Systematic debugging |
| `pdgo-tdd-work` | Test-driven development |
| `pdgo-completion-work` | Verification and branch completion |
| `pdgo-skill-authoring` | Skill authoring and validation |

The complete upstream workflow bodies are merged into these active files. The exact upstream files remain byte-for-byte locked in `integrations/external-skills/superpowers/upstream/`; `source-lock.json` and `integration-map.json` record commit, hashes, and destination coverage.

## Agency Agents

The repository contains the 271 prompts from `msitarzewski/agency-agents` at source commit `c89557f78509868c6d4cc08e5cbc79bc8625fe1c`, preserving the upstream 18-division classification. Each Agent has an evidence-backed YAML companion under `integrations/external-agents/agency-agents/metadata/`.

Search narrows candidates by division and source description. A name alone is never enough. `auto_route: true` is reserved for high-confidence entries with structured evidence; all other entries are `manual-only` and require an explicit, approved `external_agent_id`. Agents provide advice and implementation work only. They cannot approve plans, close blockers, change scope, or replace review.

The department routing policy is in `profiles/pdgo-agent-routing.json` and the catalog is in `integrations/external-agents/agency-agents/index.json`.

## Installation

### Codex plugin

Install or link this repository as a local plugin in the Codex app. The plugin manifest is `.codex-plugin/plugin.json` and the active Skills are under `skills/`.

### Other harnesses

The repository includes manifests for Claude, Cursor, Kimi, OpenCode, and Gemini. Install each harness separately when it does not share a Skill directory with Codex.

### Runtime commands

```powershell
node scripts/flowstate-dispatcher.mjs --action create-plan --input plan.json --root .flowstate --project demo
node scripts/flowstate-dispatcher.mjs --action approve --input approval.json --root .flowstate --project demo
node scripts/flowstate-dispatcher.mjs --action dispatch --input dispatch.json --root .flowstate --project demo
node scripts/flowstate-dispatcher.mjs --action resume --root .flowstate --project demo
node scripts/flowstate-dispatcher.mjs --action watch --root .flowstate --project demo --interval-ms 1000
```

`dispatch` is an explicit queue handoff. `resume` and `watch` use the continuous gate; without a connected App Server transport they record a blocker and wait instead of claiming that an Agent was started.

## What's Inside

The repository is organized around `AGENTS.md`, the ten `skills/pdgo-*` entries, the locked Superpowers integration under `integrations/external-skills/superpowers/`, the 271-Agent catalog under `integrations/external-agents/agency-agents/`, department policy in `profiles/pdgo-agent-routing.json`, contracts under `schemas/`, runtime code under `scripts/`, and evidence tests under `tests/`.

## Philosophy

- **Evidence before assertions** - run the declared command and inspect its output before claiming success.
- **Human approval at the boundary** - execution is bound to an immutable plan ID and version.
- **Systematic over ad hoc** - use the routed workflow for planning, testing, debugging, review, and completion.
- **Minimum necessary change** - corrections repair approved work; they do not deepen or expand the task.
- **Honest transport** - a queue file, stub, or current chat is not a live Agent session.
- **Reversible delivery** - record stop conditions, rollback, residual risk, and external effects.

## Updating Sources

Superpowers is refreshed only by changing the locked commit, rebuilding the upstream archive, regenerating the ten active Skills, and reviewing the new integration map. Agency Agents are refreshed by importing a complete provider tree, checking every prompt SHA, regenerating all 271 metadata companions, and reviewing routing changes. A source update is a plan change and needs a new user approval.

## Validation

```powershell
npm.cmd run test:node
npm.cmd run validate
```

Validation checks the ten active Skill contracts, absence of legacy shell directories, locked Superpowers hashes, full Agent and metadata counts, prompt integrity, schemas, and runtime behavior.

## License

PDGO is released under the MIT license. Imported Superpowers and Agency Agents materials retain their upstream licenses and source records in their integration directories.
