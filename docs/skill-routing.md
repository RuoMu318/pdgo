# PDGO startup routing

## Three-mode bootstrap

Route every request before model extensions, subagents, PDGO state writes, formal plans, governance prompts, or role
processes. Lightweight work runs directly in the current Agent with the seven zero-cost constraints. Standard work
runs in the current Agent with a proportionate self-check, no governance-prompt loads, and no new PDGO approval
rounds. High-assurance work, and explicit secretary or BossCoding
invocations, load the full routing and governance contract below.

## Required classification

High-assurance work starts with this full record before a domain Skill or artifact is touched. Lightweight and
standard work classify only enough to select the mode and do not create a PDGO record:

```yaml
project: identify from cwd, repository, or user statement
operation: code | docs | config | research | design | data | release | other
department: planning | execution | review | coordination
stage: intake | discovery | design | implementation | validation | release | maintenance
scenario: concrete user goal, never a Skill name
inputs: files, repository, API, model, document, or evidence types
outputs: plan, code, document, test report, decision, or release artifact
constraints: paths, branches, permissions, deadlines, exclusions
risk: low | medium | high | critical
mode: discuss-only | plan-only | execute
approval_state: absent | awaiting-user-approval | approved | paused | completed
```

The category index is a discovery aid only. The ten active entries are:

```text
pdgo-route-work | pdgo-dialogue-memory | pdgo-plan-work | pdgo-execute-work
pdgo-review-request | pdgo-review-receive | pdgo-debug-work | pdgo-tdd-work
pdgo-completion-work | pdgo-skill-authoring
```

Use the full metadata in `skills/skill-index.json` and `skills/category-index.json`; a name, category, or keyword
alone never invokes a Skill. The repository integration lock records how each workflow block enters the active
Skills without exposing source branding in the route.

## Routing order

1. Apply active higher-level guidance and the nearest project `AGENTS.md`.
2. Select lightweight, standard, or high-assurance before mode-specific side effects.
3. For lightweight or standard work, execute in the current Agent and stop this routing sequence.
4. For high-assurance or an explicit secretary/BossCoding entry, load the project profile and secretary contract.
5. Search plan, knowledge, and session indexes before opening historical content.
6. Classify the concrete scenario, apply hard filters, and select one primary active Skill.
7. Record selected and rejected Skills; route external Agent candidates through their profile and evidence metadata.
8. Stop with `skill-unresolved` when no candidate satisfies the hard filters.

## Agent routing

Upstream divisions narrow the search but do not prove a capability. An Agent is eligible for automatic selection only
when its metadata says `auto_route: true`, the approved task supplies a matching scenario query, the prompt SHA is
valid, and the transport returns a real connected session. `manual-only` Agents can be selected by exact
`external_agent_id` in a user-approved dispatch but cannot be guessed from a name.

## Department boundary

The Planning Department owns the user contract, stage decomposition, Agent selectors, risk and blocker disposition,
and acceptance loop. The Execution Department performs one exact dispatch and returns evidence. Reviewers are
independent and cannot self-approve. No department can silently expand scope or close a blocker without a recorded
resolution and evidence.

## Conflicts

Explicit user instructions override routing defaults when compatible. A project rule or active Skill may add
constraints but cannot remove the approval gate, evidence requirement, session isolation, transport honesty, or
safety boundary. If no compatible route remains, pause and request clarification rather than guessing.
