---
name: flowstate-writing-skills
description: "Author a Skill from its scenario, boundaries, inputs, outputs, prerequisites, side effects, category, and risk. Use for scenarios: No existing Skill reliably matches the scenario; A Skill needs a routing contract. Do not use for: Do not create a Skill from a name alone; Do not use authoring to execute product work. Expected outputs: Skill files; manifest; category entry; index update."
---

# FlowState Writing Skills

## Scope

- Scenario: a reusable capability needs a new Skill
- Action: define scenario routing metadata and instructions
- Intended outcome: validated indexed Skill
- Project scope: flowstate
- Departments: planning, execution, review
- Stages: discovery, design, implementation, validation
- Category: skill-authoring
- Subcategory: skill-metadata
- Tags: skill-authoring, skill-metadata

## Use when

- No existing Skill reliably matches the scenario
- A Skill needs a routing contract

## Do not use when

- Do not create a Skill from a name alone
- Do not use authoring to execute product work

## Required inputs

- scenario
- action
- outcome
- triggers
- boundaries

## Required outputs

- Skill files
- manifest
- category entry
- index update

## Workflow

1. Confirm the scenario and project scope.
2. Verify the required inputs and prerequisites.
3. Perform only the declared action.
4. Produce every declared output and supporting evidence.
5. Report deviations, risks, blockers, and unresolved assumptions.

## Selection note

Use when the concrete scenario matches a reusable capability needs a new Skill.

## Safety

- Respect the current project mode and approval gate.
- Do not expand scope or claim completion without evidence.
- Side effect to control: writes Skill catalog files
