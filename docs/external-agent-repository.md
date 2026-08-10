# Specialist Agent catalog integration

PDGO treats an external Agent repository as a governed Agent provider. The provider contributes specialized
role prompts and division metadata; PDGO remains responsible for scenario classification, Skill routing,
approval, task scope, session continuity, evidence, review, risk, blockers, and audit.

The provider configuration is held in the project profile. Its imported catalog and cached prompts live under the
locked integration directory and are refreshed through the deterministic import command:

```powershell
node scripts/import-external-agents.mjs --root . --provider <provider-id> --repo <owner/repository> --ref <ref> --download
```

The importer records the source tree commit, file SHA, raw URL, division, and prompt path for every indexed Agent. The
evaluation step writes one metadata companion for every Agent under `metadata/<division>/`, including the exact
source description, evidence headings, candidate department/stage, required Skills, confidence, and routing mode. It
walks the provider tree recursively: any candidate Markdown file with `name` or `description` frontmatter is indexed,
including nested paths such as `game-development/unity/...`. Markdown documentation, integration guides, and other
files without Agent frontmatter are skipped, so the catalog is not limited to the examples shown in a UI or README.
Cached prompts are retained byte-for-byte for source-SHA verification; upstream whitespace or marker text is not
normalized. The repository attributes exclude this read-only vendor cache from whitespace diagnostics without
changing its content.

## Selection and invocation

1. Classify the task and select the primary PDGO Skill.
2. Search the external Agent index by scenario, division, description, and routing terms.
3. Select an Agent only when its role is compatible with the approved task. A name match alone is insufficient.
4. Add the exact `external_agent_id` and source commit to the approved dispatch.
5. The external adapter injects the cached upstream prompt into a task-scoped worker session.
6. The worker returns `EXECUTION_REPORT` after a normal return, or a formal `BLOCKER_REPORT` after an abnormal stop; the independent reviewer checks normal evidence, while planning owns blocker disposition.

An external Agent cannot approve a plan, change the approved scope, bypass a blocker, or push external state. A
`manual-only` entry requires an exact approved `external_agent_id`. Automatic selection requires `auto_route: true`,
valid prompt SHA, and a live connected transport. If the catalog, metadata, prompt cache, or transport cannot be
reached, the dispatcher records a blocker and waits; it never reports that an Agent was started.
