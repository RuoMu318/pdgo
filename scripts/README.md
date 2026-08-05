# Scripts

Scripts in this directory must be deterministic, safe to rerun, and narrowly scoped. They may validate contracts,
generate scenario-bound Skills, rebuild derived indexes, dispatch approved tasks, or adapt records between supported
formats. Scripts must not store credentials or silently modify product repositories outside the explicit task scope.

`create-flowstate-skill.mjs` requires a JSON specification and writes the Skill plus searchable metadata. It refuses
to guess missing boundaries, inputs, or outputs.

`seed-flowstate-skills.mjs` generates the maintained starter Skills from `profiles/flowstate-skill-catalog.json`.
`seed-flowstate-inventory.mjs` can generate every inventory entry with an explicit scenario contract. The larger
`profiles/flowstate-skill-inventory.json` is the complete method catalog and is the source for category indexes.

`flowstate-dispatcher.mjs` operates on an explicit state root. The default file queue creates local logical session
IDs and audit messages; it does not claim a remote conversation exists. Use a platform adapter only after the
platform returns real session IDs.
