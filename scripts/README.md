# Scripts

Scripts in this directory must be deterministic, safe to rerun, and narrowly scoped. They may validate contracts,
generate scenario-bound Skills, rebuild derived indexes, dispatch approved tasks, or adapt records between supported
formats. Scripts must not store credentials or silently modify product repositories outside the explicit task scope.

`create-flowstate-skill.mjs` is a compatibility-named authoring entry point; it requires a JSON specification and writes
an explicitly scoped Skill plus searchable metadata. It refuses
to guess missing boundaries, inputs, or outputs.

`build-pdgo-skill-integration.mjs` is the source-locked builder for the ten active PDGO Skills, the Superpowers
coverage map, and the searchable indexes. `evaluate-agency-agents.mjs` generates the 271 source-backed Agent
metadata companions and routing summary. These builders must be rerun after an approved upstream update.

The `profiles/flowstate-skill-catalog.json` and `profiles/flowstate-skill-inventory.json` filenames remain as
compatibility paths, but they contain only the ten active `pdgo-*` entries. They are not a license to recreate the
deleted 94 shell Skills.

`flowstate-dispatcher.mjs` operates on an explicit state root. The default file queue creates local logical session
IDs and audit messages; it does not claim a remote conversation exists. Use a platform adapter only after the
platform returns real session IDs. `resume` and `watch` pause on a transport blocker when those IDs are unavailable.
