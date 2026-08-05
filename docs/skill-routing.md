# FlowState startup routing

## Required first-pass classification

Every new project task starts with this internal record:

```yaml
project: identify from cwd, repository, or user statement
operation: code | docs | config | research | design | data | release | other
department: planning | execution | review | coordination
stage: intake | discovery | design | implementation | validation | release | maintenance
scenario: concrete user goal, not a Skill name
inputs: files, repository, API, model, document, or evidence types
outputs: plan, code, document, test report, decision, or release artifact
constraints: paths, branches, permissions, deadlines, exclusions
risk: low | medium | high | critical
mode: discuss-only | plan-only | execute
```

## Routing order

1. Load global guidance and the nearest project `AGENTS.md` files.
2. Identify the project profile and memory store.
3. Search plan, knowledge, and session indexes before opening historical content.
4. List candidate Skills from metadata, not filenames.
5. Apply hard filters: scope, exclusions, stage, prerequisites, and permissions.
6. Rank remaining Skills by scenario, input/output fit, project specificity, and risk coverage.
7. Select one primary Skill and only the supporting Skills required by the scenario.
8. Explain the selection in the session record.

## Examples

- A Three.js runtime failure selects the project Three.js debugging Skill only when the repository and
  symptom match its scope; a generic document Skill is not selected just because the word "model" appears.
- A request to design a new product selects planning and architecture Skills; implementation Skills remain
  inactive until the plan is approved.
- A document editing task selects the document workflow Skill, not a project coding Skill.
- A task with no reliable candidate becomes `skill-unresolved` and pauses for clarification or a new Skill.

## Conflicts

Explicit user instructions override routing defaults. A local project Skill may add constraints, but it cannot
remove the classification, approval gate, evidence requirement, or safety boundary. If two Skills conflict, keep
the primary Skill's output contract and use the second only as a supporting reference after the conflict is resolved.
