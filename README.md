# FlowState

FlowState is a universal project development method for Codex and other tool-using agents.
Its implementation repository is named **PDGO**: Project Development Governance Orchestrator.

FlowState turns a user request into a traceable project workflow:

```text
project intake
  -> scenario and Skill routing
  -> planning
  -> risk and blocker review
  -> explicit user approval
  -> controlled dispatch
  -> isolated execution
  -> evidence-based review
  -> planning acceptance
  -> next-task unlock
  -> memory and audit record
```

The method is project-agnostic. Project-specific behavior belongs in a project profile, local
`AGENTS.md`, and scoped Skills. The core rules never assume a particular framework, repository,
language, or product.

## Non-negotiable rules

- A new project task starts with project, stage, department, operation, scenario, and risk classification.
- Skill selection is scenario-based. A Skill name alone is never sufficient evidence for selection.
- Planning and execution use separate controller and worker conversations.
- Every conversation has its own instruction, result, summary, decisions, and references.
- Historical memory is found through indexes before source conversations are opened.
- A plan cannot execute until the user has reviewed the scope, risks, blockers, assumptions, dependencies,
  acceptance criteria, and rollback conditions.
- An approved plan version is immutable. Any material change creates a new version and requires re-approval.
- Execution returns evidence, deviations, new risks, and new blockers. It never self-approves completion.
- A new high-impact risk pauses execution and returns control to planning and the user.
- Changes are linked to project, plan, task, dispatch, session, tests, and commit when applicable.

## Repository layout

```text
AGENTS.md                         Codex contribution rules
docs/flowstate-spec.md            Complete normative method specification
docs/skill-routing.md             Startup routing and Skill selection
schemas/                          Interchange contracts
templates/                        Plan, summary, and report templates
profiles/                         Project profile examples
skills/flowstate-project-method/  Installable Codex Skill
skills/flowstate-skill-authoring/ Scenario-driven Skill generator Skill
scripts/                          Skill authoring and dispatch tools
skills/skill-index.json            Searchable Skill routing index
```

## Installing the Skill

The Skill directory can be installed into the user's Codex Skill directory:

```powershell
Copy-Item -Recurse -Force .\skills\flowstate-project-method `
  "$env:USERPROFILE\.codex\skills\flowstate-project-method"
```

The global Codex `AGENTS.md` should require the Skill to be considered at the beginning of every
project task. A repository may add a more specific `AGENTS.md` without replacing these rules.

## Project profiles

Use `profiles/project-profile.example.yaml` as the starting point for a project. Profiles define
repositories, memory locations, project-specific Skills, worktree rules, approval policy, test commands,
and risk thresholds. They do not override explicit user instructions or system safety rules.

## Runtime tools

The repository includes a deterministic dispatcher and Skill authoring tool:

```powershell
npm.cmd run create-skill -- --spec profiles/skill-spec.example.json --root .
npm.cmd run test:node
node scripts/flowstate-dispatcher.mjs --action create-plan --input plan.json --root .flowstate --project demo
```

The dispatcher persists state in an explicit directory and uses the file queue by default. Replace the adapter with
`CodexAppServerAdapter` only when a reachable App Server transport is configured. A plan extension reuses the same
series controller sessions; only a parallel branch creates new controller conversations and synchronizes its
accepted result to the parent.

## Status

This repository contains the universal specification, scenario-based Skill authoring, and an auditable runtime
dispatcher with file-queue and Codex App Server adapter boundaries.
