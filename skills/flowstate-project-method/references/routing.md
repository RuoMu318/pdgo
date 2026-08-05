# Skill routing reference

## Classification tuple

```text
(project, operation, department, stage, scenario, inputs, outputs, constraints, risk, mode)
```

Use the tuple before selecting a Skill. A filename or Skill name is not a scenario.

Use the project's category and Skill indexes as discovery aids. FlowState families are coordination, planning,
dispatch, development, review, debugging, memory, skill-authoring, release-audit, and adapters. A family narrows
the candidates but never invokes a Skill by itself.

## Hard filters

Reject a candidate when any of these fail:

- project scope is incompatible;
- the scenario is listed as a negative trigger;
- required inputs are absent;
- prerequisites are not satisfied;
- the Skill requires a different stage or department;
- its side effects exceed the current mode or permissions.

## Ranking

Rank remaining candidates by:

1. exact scenario match;
2. expected output match;
3. project-specific scope;
4. required input match;
5. risk and validation coverage;
6. explicit user selection.

Select one primary Skill and only the supporting Skills needed for the same task. Record selected and rejected
Skills with reasons. If confidence is insufficient, stop with `skill-unresolved`.

## Startup behavior

The global project guidance must require this classification at the beginning of every project task. A local project
rule may add domain routing, but it cannot remove the classification, approval gate, evidence requirement, or safety
boundary.
