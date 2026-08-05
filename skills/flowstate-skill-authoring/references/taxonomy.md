# FlowState Skill taxonomy

Use categories to organize discovery and reporting. Routing still depends on the concrete scenario, positive and
negative triggers, inputs, outputs, prerequisites, stage, department, and risk.

| Category | Use for | Typical subcategories |
|---|---|---|
| `planning` | discovery, ideation, architecture, and plan design | brainstorming, execution-planning, writing-plans |
| `execution` | bounded implementation and task handoff | subagent-development, parallel-dispatch, git-worktree, branch-completion |
| `review` | independent review, tests, and completion gates | request-review, receive-review, tdd, precompletion-validation |
| `debugging` | reproduction, diagnosis, and recovery | system-debugging, runtime-diagnosis |
| `memory` | conversation records, retrieval, summaries, and indexes | memory-retrieval, conversation-summary |
| `skill-authoring` | Skill creation, metadata, and routing catalog maintenance | skill-metadata, skill-routing |
| `documentation` | project documents, prompts, and writing quality | technical-writing, prompt-writing |
| `release` | change records, handoff, publication, and rollback | release-handoff, change-audit |
| `coordination` | universal governance and cross-department control | project-governance, approval-gate |

New Skills should use the narrowest category that matches the scenario. A broad category is acceptable only when
the Skill explicitly covers multiple subcategories and its boundaries state what it excludes.
