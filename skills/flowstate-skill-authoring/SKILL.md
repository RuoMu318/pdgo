---
name: flowstate-skill-authoring
description: Create or update a FlowState Skill from a concrete project scenario. Use when a capability needs explicit scenario triggers, boundaries, inputs, outputs, prerequisites, risk, and a searchable name. Do not use for selecting an existing Skill or for implementing product changes.
---

# FlowState Skill Authoring

Use this Skill when a project capability does not have a reliable, scenario-matched Skill yet, or when an
existing Skill needs its selection contract updated.

## Use when

- A user asks to add a new Skill for a repeatable project scenario.
- A capability needs explicit use boundaries instead of name-based guessing.
- A Skill needs machine-readable inputs, outputs, prerequisites, risk, or side-effect metadata.
- The Skill index needs to be regenerated after a Skill is added or changed.

## Do not use when

- An existing Skill already matches the classified scenario and output contract.
- The request is to execute product work rather than author a Skill.
- The scenario, scope, or expected output is still ambiguous.

## Required inputs

- Project or scope name.
- Concrete scenario and action.
- Intended outcome.
- Positive triggers and explicit boundaries.
- Required inputs and expected outputs.
- Prerequisites, side effects, and risk level.

## Required outputs

- A descriptive `skill_id` that summarizes scope, scenario, action, and outcome.
- `SKILL.md` with human-readable routing rules.
- `skill-manifest.yaml` with machine-readable routing metadata.
- `agents/openai.yaml` with a concise invocation description.
- `skills/skill-index.json` and `skills/skill-index.md` entries.
- A validation or test result for the generated files.

## Workflow

1. Classify the scenario independently of any proposed Skill name.
2. Reject missing or contradictory triggers, boundaries, inputs, and outputs.
3. Infer or validate a category and subcategory from the scenario; do not use a category as a substitute for a trigger.
4. Generate a short ASCII name in the form `scope-scenario-action-outcome`.
5. Write the Skill files and update both indexes atomically from the repository perspective.
6. Validate frontmatter, required metadata, category, and index uniqueness.
7. Report the generated path, routing contract, category, and any unresolved decisions.

## Safety

- Authoring a Skill does not authorize product changes or execution dispatches.
- Never remove an existing Skill or index entry without an explicit migration decision.
- Preserve compatible fields when updating an existing manifest.
- Do not claim that a generated Skill is selected for a task until startup routing evaluates its metadata.

Read [taxonomy.md](references/taxonomy.md) when choosing a category or reviewing the method Skill catalog.
