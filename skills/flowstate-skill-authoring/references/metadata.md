# Skill metadata contract

The authoring input is a JSON object with these required fields:

```json
{
  "scope": "project or global scope",
  "scenario": "concrete scenario",
  "action": "bounded action",
  "outcome": "expected output",
  "positiveTriggers": ["when this applies"],
  "boundaries": ["when this does not apply"],
  "inputs": ["required context"],
  "outputs": ["required result"]
}
```

Optional fields add project scope, departments, stages, prerequisites, side effects, risk, priority, a display
name, and a short description. The generated index is a discovery aid; the Skill file and project policy remain
authoritative.
