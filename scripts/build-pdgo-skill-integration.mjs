#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { normalizePdgoActiveSkillText } from "./lib/pdgo-active-skill-text.mjs";

function argsToObject(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) result[key] = true;
    else { result[key] = value; index += 1; }
  }
  return result;
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function gitBlobSha(value) {
  const bytes = Buffer.from(value, "utf8");
  return createHash("sha1").update(`blob ${bytes.length}\0`, "utf8").update(bytes).digest("hex");
}

function yamlScalar(value) {
  return JSON.stringify(String(value ?? ""));
}

function yamlList(values, indent = "  ") {
  const list = Array.isArray(values) ? values : [values];
  return list.length ? list.map((item) => `${indent}- ${yamlScalar(item)}`).join("\n") : `${indent}[]`;
}

function slug(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "section";
}

function parseFrontmatter(text) {
  const lines = text.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") return { fields: {}, body: text, frontmatter: "" };
  const end = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
  if (end < 0) return { fields: {}, body: text, frontmatter: "" };
  const fields = {};
  for (const line of lines.slice(1, end)) {
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (match) fields[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, "");
  }
  return { fields, body: lines.slice(end + 1).join("\n").replace(/^\n+/, ""), frontmatter: lines.slice(0, end + 1).join("\n") };
}

function logicalBlocks(body) {
  const blocks = [];
  let current = [];
  let fence = false;
  for (const line of body.split(/\r?\n/)) {
    if (line.trim().startsWith("```")) fence = !fence;
    if (!line.trim() && !fence) {
      if (current.length) blocks.push(current.join("\n"));
      current = [];
      continue;
    }
    current.push(line);
  }
  if (current.length) blocks.push(current.join("\n"));
  return blocks.filter((block) => block.trim());
}

const COMMON_OVERLAY = `## PDGO operating contract

This Skill is the active PDGO route for the declared scenario. Apply the workflow below only after startup routing has classified the project, operation, department, stage, inputs, outputs, constraints, risk, mode, and approval state. A Skill name or keyword is never sufficient evidence for selection.

The Planning Department owns the contract with the user: objective, observable outcome, modification scope, excluded scope, assumptions, dependencies, acceptance criteria, expected evidence, risks, blockers, rollback, stop conditions, and the explicit rule not to deepen implementation detail without a request. Long work is split into named serial and parallel stages. Each stage declares its required Skills, candidate specialist Agents, dependencies, isolation policy, and acceptance gate.

The Planning Department also controls the loop: dispatch one stage or an isolated parallel set, collect worker reports, obtain an independent review, accept only evidence that matches the exact plan version, and issue an in-scope correction when a review returns \`revision-required\`. A failed or blocked item is not silently skipped. Dependents unlock only after acceptance and all blockers are \`resolved\` with evidence.

The Execution Department receives one immutable \`PLAN_DISPATCH\` at a time. It may edit only allowed paths, must observe forbidden actions and stop conditions, must run the declared verification, and must return changed paths, tests, evidence, assumptions, deviations, risks, and blockers. Workers cannot self-approve or expand the plan.

An abnormal execution stop is never normal completion. The Execution Department must immediately send a formal \`BLOCKER_REPORT\` to the fixed Planning Department conversation with the blocker reason, impact, recommended solution, and \`requires_user\` disposition. Planning must record and answer it with \`PLANNING_BLOCKER_OPINION\`: when planning can resolve every blocker inside the approved contract it records the resolutions and re-dispatches the stopped task; when it cannot, it sends \`USER_ACTION_REQUIRED\` in the planning conversation and keeps execution paused. Normal completion does not trigger this escalation path.

Every session records the instruction, checkpoints, dispatches, reports, decisions, summaries, unresolved items, and cross-session references. Search indexes first and read summaries before source turns. Link artifacts to project, plan, version, task, dispatch, session, tests, and commit where applicable.

Specialist Agents are advisory task workers selected from the locked catalog and its evidence metadata. Search by the concrete scenario and division, inspect the source prompt SHA, and include the exact \`external_agent_id\` in the approved dispatch. A low-confidence or \`manual-only\` entry cannot be auto-routed. A specialist Agent cannot approve a plan, close a blocker, change scope, or replace an independent review.

Continuous dispatch is permitted only when the exact user approval matches \`plan_id\` and \`plan_version\`, every acknowledged risk and blocker disposition is present, dependencies are accepted, the active stage is ready, the selected Agent metadata is eligible, the transport returned real session IDs, and the scope has not changed. File queues are explicit, auditable handoff adapters; they do not prove a live Agent session. Missing transport, invalid SHA, missing evidence, a new material risk, a new blocker, or a scope change pauses the series and returns it to planning. Planning escalates to the user only when it cannot resolve the blocker inside the approved contract or a material change requires new approval.

Do not claim completion from intent, queued files, mock responses, or a self-reported status. Completion requires independent review, verification evidence, no unresolved blockers, and the exact approved acceptance criteria. Rollback follows the approved plan and is recorded as an auditable event.`;

const DEFINITIONS = [
  {
    id: "pdgo-route-work",
    displayName: "PDGO Route Work",
    shortDescription: "Route governed work to the right PDGO Skill and specialist Agent",
    description: "Select the active PDGO Skill and eligible specialist Agent from the classified scenario before any governed response or dispatch.",
    scenario: "startup routing and governed capability selection",
    department: ["coordination", "planning", "execution"],
    stage: ["discovery", "design", "implementation", "validation"],
    sources: ["using-superpowers"],
    overlay: "Route first, then invoke the selected Skill. Record rejected candidates and stop with `skill-unresolved` when hard filters cannot be satisfied. A request for clarification is itself routed and governed.",
  },
  {
    id: "pdgo-dialogue-memory",
    displayName: "PDGO Dialogue Memory",
    shortDescription: "Preserve indexed conversation memory and handoff context",
    description: "Record and retrieve session, plan, decision, evidence, and cross-session memory without assuming transcript sharing.",
    scenario: "conversation memory, checkpoint, retrieval, and handoff",
    department: ["coordination", "planning", "execution", "review"],
    stage: ["discovery", "design", "implementation", "validation"],
    sources: [],
    overlay: "Memory is a governed artifact, not an implicit transcript. Record session start, checkpoints, cross-session references, and close summaries. Index discovery comes before source reads; stale or draft records cannot authorize execution.",
  },
  {
    id: "pdgo-plan-work",
    displayName: "PDGO Plan Work",
    shortDescription: "Co-design a bounded staged plan with acceptance gates",
    description: "Explore intent, write a versioned plan, split long work into serial or parallel stages, and prepare an approval-bound task ledger.",
    scenario: "planning and discovery for a governed multi-stage change",
    department: ["planning"],
    stage: ["discovery", "design"],
    sources: ["brainstorming", "writing-plans"],
    overlay: "Use dialogue with the user to converge on the goal and observable result before drafting tasks. Do not start product changes while brainstorming or writing the plan. Every stage and task names its Skills, candidate Agents, evidence, dependencies, blockers, risks, rollback, and stop conditions. Approval is requested only after the plan is complete and internally reviewed. On `BLOCKER_REPORT`, planning must issue a recorded `PLANNING_BLOCKER_OPINION`; resolve and re-dispatch only inside the approved contract, otherwise send `USER_ACTION_REQUIRED` and wait.",
  },
  {
    id: "pdgo-execute-work",
    displayName: "PDGO Execute Work",
    shortDescription: "Dispatch isolated approved work and collect evidence",
    description: "Execute an approved plan with serial or parallel task dispatch, isolated worktrees, bounded corrections, and audited worker reports.",
    scenario: "approved implementation dispatch and continuous stage control",
    department: ["execution", "coordination"],
    stage: ["implementation", "validation"],
    sources: ["executing-plans", "subagent-driven-development", "dispatching-parallel-agents", "using-git-worktrees"],
    overlay: "Dispatch only the exact approved task. Use a separate worktree for every concurrent writer and keep parallel tasks independent. After each report, the Planning Department requests independent review; accepted evidence unlocks the next task, while an in-scope revision creates a bounded correction dispatch. If execution stops abnormally, immediately send `BLOCKER_REPORT` with reason, impact, recommended solution, and whether the user is required; normal completion is excluded. Resume only after the Planning Department returns `PLANNING_BLOCKER_OPINION`. A live transport is required for continuous Agent execution; FileQueue is a manual handoff and must be reported as such.",
  },
  {
    id: "pdgo-review-request",
    displayName: "PDGO Request Review",
    shortDescription: "Package exact work evidence for independent review",
    description: "Request an independent review against the immutable plan, acceptance criteria, diff, tests, risks, and questions.",
    scenario: "requesting an independent implementation or code review",
    department: ["review", "planning"],
    stage: ["validation"],
    sources: ["requesting-code-review"],
    overlay: "The review request must identify the exact plan ID and version, task, allowed paths, acceptance criteria, changed files, test commands and output, evidence links, risks, and unresolved questions. The implementer cannot be the approving reviewer.",
  },
  {
    id: "pdgo-review-receive",
    displayName: "PDGO Receive Review",
    shortDescription: "Evaluate review evidence and govern the next action",
    description: "Receive independent review feedback, verify it against the approved contract, and accept, revise, block, or fail the task.",
    scenario: "receiving and deciding an independent review",
    department: ["review", "planning"],
    stage: ["validation"],
    sources: ["receiving-code-review"],
    overlay: "Assess technical correctness rather than agreeing performatively. Missing evidence, a new risk, a blocker, or a material scope change pauses the series. Only `accepted` unlocks dependents; `revision-required` is limited to the approved correction policy.",
  },
  {
    id: "pdgo-debug-work",
    displayName: "PDGO Debug Work",
    shortDescription: "Investigate failures with controlled evidence loops",
    description: "Reproduce unexpected behavior, isolate root causes, test hypotheses, and apply only approved bounded remediation.",
    scenario: "systematic debugging of a reproducible failure",
    department: ["execution", "review"],
    stage: ["implementation", "validation"],
    sources: ["systematic-debugging"],
    overlay: "Preserve the failing reproduction and distinguish observations from hypotheses. Stop when no evidence-backed root cause is available or when remediation would change scope, permissions, architecture, acceptance, or rollback.",
  },
  {
    id: "pdgo-tdd-work",
    displayName: "PDGO TDD Work",
    shortDescription: "Drive bounded changes through a red-green-refactor loop",
    description: "Implement approved behavior changes with a failing test, minimal implementation, passing verification, and controlled refactoring.",
    scenario: "test-first implementation of an approved behavior change",
    department: ["execution", "review"],
    stage: ["implementation", "validation"],
    sources: ["test-driven-development"],
    overlay: "The test must encode an already approved acceptance criterion. Do not weaken or delete a failing test to obtain green. Return the red, green, and refactor evidence with the worker report.",
  },
  {
    id: "pdgo-completion-work",
    displayName: "PDGO Complete Work",
    shortDescription: "Verify completion and prepare an audited branch handoff",
    description: "Run evidence-before-completion checks, record residual risk, and prepare a branch handoff without silently merging or pushing.",
    scenario: "completion verification and branch handoff",
    department: ["review", "execution"],
    stage: ["validation"],
    sources: ["verification-before-completion", "finishing-a-development-branch"],
    overlay: "Run the declared tests and inspect their actual output before saying complete. Record the final diff, acceptance checklist, residual risks, rollback, and integration decision. Merging, pushing, or cleanup remains a separately authorized action.",
  },
  {
    id: "pdgo-skill-authoring",
    displayName: "PDGO Skill Authoring",
    shortDescription: "Author searchable Skills with explicit routing contracts",
    description: "Create or update a PDGO Skill with concrete triggers, boundaries, inputs, outputs, prerequisites, evidence, and risk metadata.",
    scenario: "authoring and validating a reusable governed Skill",
    department: ["planning", "coordination"],
    stage: ["design", "validation"],
    sources: ["writing-skills"],
    overlay: "A Skill is created from a scenario, not a name. Test the Skill against positive and negative routing examples, keep descriptions trigger-focused, and update the activity index atomically. Authoring does not authorize product execution.",
  },
];

const COMPONENT_BY_SOURCE = Object.freeze({
  "using-superpowers": "pdgo-route-work",
  brainstorming: "pdgo-plan-work",
  "writing-plans": "pdgo-plan-work",
  "executing-plans": "pdgo-execute-work",
  "subagent-driven-development": "pdgo-execute-work",
  "dispatching-parallel-agents": "pdgo-execute-work",
  "using-git-worktrees": "pdgo-execute-work",
  "requesting-code-review": "pdgo-review-request",
  "receiving-code-review": "pdgo-review-receive",
  "systematic-debugging": "pdgo-debug-work",
  "test-driven-development": "pdgo-tdd-work",
  "verification-before-completion": "pdgo-completion-work",
  "finishing-a-development-branch": "pdgo-completion-work",
  "writing-skills": "pdgo-skill-authoring",
});

function integratedComponents(definition) {
  return [...new Set(definition.sources.map((source) => COMPONENT_BY_SOURCE[source]).filter(Boolean))];
}

const COMMON_INSTRUCTIONS = `${COMMON_OVERLAY}\n\n${"## Evidence and stop conditions"}\n\nReturn actual commands and outputs, changed paths, and unresolved uncertainty. Stop immediately when the approved scope, plan version, transport capability, Agent source SHA, or acceptance contract no longer matches.`;

function manifestFor(definition) {
  return {
    schema_version: "1.0",
    skill_id: definition.id,
    display_name: definition.displayName,
    description: definition.description,
    project_scope: ["pdgo", "tianyan"],
    department: definition.department,
    stage: definition.stage,
    scenarios: [definition.scenario],
    positive_triggers: [`The scenario is ${definition.scenario}`],
    negative_triggers: ["The scenario is outside this Skill's declared workflow", "Required inputs or approval are missing"],
    boundaries: ["Do not bypass PDGO approval, evidence, blocker, transport, or rollback gates"],
    required_inputs: ["classified project context", "approved or planning-scoped artifacts", "current constraints"],
    expected_outputs: ["governed result", "evidence", "risks", "blockers", "next action"],
    prerequisites: ["startup routing completed", "mode permits the requested side effect"],
    side_effects: ["writes governed artifacts or changes only approved paths"],
    risk_level: "high",
    priority: 10,
    category: definition.id === "pdgo-dialogue-memory" ? "memory" : definition.id === "pdgo-plan-work" ? "planning" : definition.id === "pdgo-execute-work" ? "dispatch" : "coordination",
    subcategory: definition.scenario,
    tags: ["pdgo", "tianyan", "governed-work"],
    integrated_components: integratedComponents(definition),
  };
}

function skillFrontmatter(definition) {
  return `---\nname: ${definition.id}\ndescription: ${JSON.stringify(definition.description)}\n---`;
}

function skillMarkdown(definition, bodies) {
  const inherited = bodies.map(({ parsed }) => normalizePdgoActiveSkillText(parsed.body.trim())).join("\n\n");
  return `${skillFrontmatter(definition)}\n\n# ${definition.displayName}\n\n${definition.description}\n\n## Routing and department contract\n\n${definition.overlay}\n\n${COMMON_INSTRUCTIONS}\n\n## Integrated workflow\n\n${inherited}\n`;
}

function openAiManifest(definition) {
  return `interface:\n  display_name: ${yamlScalar(definition.displayName)}\n  short_description: ${yamlScalar(definition.shortDescription)}\n  default_prompt: ${yamlScalar(`Use $${definition.id} for ${definition.scenario} and return governed evidence.`)}\npolicy:\n  allow_implicit_invocation: true\n`;
}

function skillManifestYaml(manifest) {
  const lines = ["schema_version: \"1.0\"", `skill_id: ${yamlScalar(manifest.skill_id)}`, `display_name: ${yamlScalar(manifest.display_name)}`, `description: ${yamlScalar(manifest.description)}`];
  for (const key of ["project_scope", "department", "stage", "scenarios", "positive_triggers", "negative_triggers", "boundaries", "required_inputs", "expected_outputs", "prerequisites", "side_effects", "integrated_components", "tags"]) {
    lines.push(`${key}:`, yamlList(manifest[key]));
  }
  lines.push(`risk_level: ${yamlScalar(manifest.risk_level)}`, `priority: ${manifest.priority}`, `category: ${yamlScalar(manifest.category)}`, `subcategory: ${yamlScalar(manifest.subcategory)}`);
  return `${lines.join("\n")}\n`;
}

async function main() {
  const options = argsToObject(process.argv.slice(2));
  const root = path.resolve(options.root ?? process.cwd());
  const upstreamRoot = path.join(root, "integrations", "external-skills", "superpowers", "upstream", "skills");
  const integrationRoot = path.join(root, "integrations", "external-skills", "superpowers");
  const overlaysRoot = path.join(integrationRoot, "overlays");
  const skillsRoot = path.join(root, "skills");
  await mkdir(overlaysRoot, { recursive: true });
  const sourceRecords = [];
  const mapRecords = [];

  for (const definition of DEFINITIONS) {
    const bodies = [];
    for (const sourceSkill of definition.sources) {
      const sourcePath = path.join(upstreamRoot, sourceSkill, "SKILL.md");
      const raw = await readFile(sourcePath, "utf8");
      const parsed = parseFrontmatter(raw);
      bodies.push({ sourceSkill, sourcePath, raw, parsed });
      sourceRecords.push({ skill_id: sourceSkill, path: path.relative(root, sourcePath).replaceAll("\\", "/"), commit: "44c9b2d6e889982ac18c27d05a19fefe335194e1", sha256: sha256(raw), git_blob_sha: gitBlobSha(raw), bytes: Buffer.byteLength(raw, "utf8") });
      logicalBlocks(parsed.frontmatter).forEach((block, index) => mapRecords.push({ integration: definition.id, source_skill: sourceSkill, block_id: `${sourceSkill}:frontmatter:${index + 1}`, status: "merged", destination: `skills/${definition.id}/SKILL.md#routing-contract`, sha256: sha256(block), text: block }));
      logicalBlocks(parsed.body).forEach((block, index) => mapRecords.push({ integration: definition.id, source_skill: sourceSkill, block_id: `${sourceSkill}:body:${index + 1}`, status: "merged", destination: `skills/${definition.id}/SKILL.md#integrated-workflow`, sha256: sha256(block), text: block }));
    }
    const activeRoot = path.join(skillsRoot, definition.id);
    await mkdir(path.join(activeRoot, "agents"), { recursive: true });
    await mkdir(path.join(activeRoot, "references"), { recursive: true });
    await writeFile(path.join(activeRoot, "SKILL.md"), skillMarkdown(definition, bodies), "utf8");
    const manifest = manifestFor(definition);
    await writeFile(path.join(activeRoot, "skill-manifest.yaml"), skillManifestYaml(manifest), "utf8");
    await writeFile(path.join(activeRoot, "agents", "openai.yaml"), openAiManifest(definition), "utf8");
    await writeFile(path.join(activeRoot, "references", "integration.md"), `# ${definition.displayName}\n\nThis active Skill combines the declared governed workflow with the complete integrated workflow body. Source coverage is audited by the repository integration lock and coverage map.\n`, "utf8");
    await writeFile(path.join(overlaysRoot, `${definition.id}.md`), `# ${definition.displayName} overlay\n\n${definition.overlay}\n\n${COMMON_INSTRUCTIONS}\n`, "utf8");
  }

  const categoryLabels = {
    coordination: "PDGO Coordination and Routing",
    memory: "PDGO Dialogue Memory",
    planning: "PDGO Planning and Discovery",
    dispatch: "PDGO Execution and Dispatch",
    review: "PDGO Review and Completion",
  };
  const categoryFor = (definition) => definition.id === "pdgo-dialogue-memory"
    ? "memory"
    : definition.id === "pdgo-plan-work"
      ? "planning"
      : definition.id === "pdgo-execute-work"
        ? "dispatch"
        : ["pdgo-review-request", "pdgo-review-receive", "pdgo-completion-work", "pdgo-debug-work", "pdgo-tdd-work"].includes(definition.id)
          ? "review"
          : "coordination";
  const indexEntries = DEFINITIONS.map((definition) => ({
    skill_id: definition.id,
    display_name: definition.displayName,
    path: `skills/${definition.id}`,
    project_scope: ["pdgo", "tianyan"],
    departments: definition.department,
    stages: definition.stage,
    scenarios: [definition.scenario],
    positive_triggers: [`The scenario is ${definition.scenario}`],
    negative_triggers: ["The scenario is outside this Skill's declared workflow", "Required inputs or approval are missing"],
    boundaries: ["Do not bypass PDGO approval, evidence, blocker, transport, or rollback gates"],
    inputs: ["classified project context", "approved or planning-scoped artifacts", "current constraints"],
    outputs: ["governed result", "evidence, risks, blockers, and next action"],
    risk_level: "high",
    priority: 10,
    category: categoryFor(definition),
    subcategory: slug(definition.scenario),
    tags: ["pdgo", "tianyan", "governed-work"],
  })).sort((left, right) => left.skill_id.localeCompare(right.skill_id));
  const categories = [...new Set(indexEntries.map((entry) => entry.category))].map((id) => ({ id, label: categoryLabels[id], skills: indexEntries.filter((entry) => entry.category === id) }));
  const catalogSpecs = DEFINITIONS.map((definition) => ({
    skillId: definition.id,
    scope: "pdgo",
    category: categoryFor(definition),
    subcategory: slug(definition.scenario),
    scenario: definition.scenario,
    action: definition.description,
    outcome: "governed result with evidence, risks, blockers, and next action",
    displayName: definition.displayName,
    shortDescription: definition.shortDescription,
    description: definition.description,
    positiveTriggers: [`The scenario is ${definition.scenario}`],
    boundaries: ["Do not bypass PDGO approval, evidence, blocker, transport, or rollback gates"],
    inputs: ["classified project context", "approved or planning-scoped artifacts", "current constraints"],
    outputs: ["governed result", "evidence", "risks", "blockers", "next action"],
    prerequisites: ["startup routing completed", "mode permits the requested side effect"],
    sideEffects: ["writes governed artifacts or changes only approved paths"],
    riskLevel: "high",
    priority: 10,
  })).sort((left, right) => left.skillId.localeCompare(right.skillId));
  const categoryIndex = { schema_version: "1.0", description: "The active PDGO Skill catalog. Legacy shell Skills were removed after migration; route only through these ten entries.", categories, skill_count: indexEntries.length };
  const skillIndex = { schema_version: "1.0", skills: indexEntries };
  const categoryMarkdown = ["# PDGO Skill Catalog", "", `Total active Skills: **${indexEntries.length}**.`, "", ...categories.flatMap((category) => [`## ${category.label} (\`${category.id}\`)`, "", "| Skill | Scenario | Output |", "|---|---|---|", ...category.skills.map((entry) => `| \`${entry.skill_id}\` | ${entry.scenarios[0]} | ${entry.outputs[0]} |`), ""]), "Routing uses the full scenario contract. A name or keyword alone never invokes a Skill.", ""].join("\n");
  const skillIndexMarkdown = ["# Active PDGO Skill Index", "", ...indexEntries.map((entry) => `- \`${entry.skill_id}\`: ${entry.scenarios[0]}`), ""].join("\n");
  await writeFile(path.join(skillsRoot, "category-index.json"), `${JSON.stringify(categoryIndex, null, 2)}\n`, "utf8");
  await writeFile(path.join(skillsRoot, "category-index.md"), categoryMarkdown, "utf8");
  await writeFile(path.join(skillsRoot, "skill-index.json"), `${JSON.stringify(skillIndex, null, 2)}\n`, "utf8");
  await writeFile(path.join(skillsRoot, "skill-index.md"), skillIndexMarkdown, "utf8");
  await writeFile(path.join(root, "docs", "skill-catalog.md"), categoryMarkdown, "utf8");
  await writeFile(path.join(root, "profiles", "flowstate-skill-catalog.json"), `${JSON.stringify(catalogSpecs, null, 2)}\n`, "utf8");
  await writeFile(path.join(root, "profiles", "flowstate-skill-inventory.json"), `${JSON.stringify({ schema_version: "1.0", description: categoryIndex.description, categories: categories.map((category) => ({ id: category.id, label: category.label, skills: category.skills.map((entry) => [entry.skill_id, entry.scenarios[0], entry.outputs[0]]) })) }, null, 2)}\n`, "utf8");

  const map = { schema_version: "1.0", generated_at: new Date().toISOString(), upstream_commit: "44c9b2d6e889982ac18c27d05a19fefe335194e1", policy: "Every upstream logical block is preserved in an active Skill or classified explicitly; no silent deletion.", blocks: mapRecords };
  await writeFile(path.join(integrationRoot, "integration-map.json"), `${JSON.stringify(map, null, 2)}\n`, "utf8");
  const lock = { schema_version: "1.0", provider: "obra/superpowers", commit: "44c9b2d6e889982ac18c27d05a19fefe335194e1", upstream_root: "integrations/external-skills/superpowers/upstream", overlay_root: "integrations/external-skills/superpowers/overlays", active_root: "skills", sources: sourceRecords, generated_skills: DEFINITIONS.map((definition) => ({ skill_id: definition.id, sources: definition.sources, active_path: `skills/${definition.id}/SKILL.md`, overlay_path: `integrations/external-skills/superpowers/overlays/${definition.id}.md` })) };
  await writeFile(path.join(integrationRoot, "source-lock.json"), `${JSON.stringify(lock, null, 2)}\n`, "utf8");
  await writeFile(path.join(integrationRoot, "manifest.json"), `${JSON.stringify({ schema_version: "1.0", active_skill_count: DEFINITIONS.length, upstream_skill_count: sourceRecords.length, generated_by: "scripts/build-pdgo-skill-integration.mjs", upstream_commit: lock.commit }, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ ok: true, active_skills: DEFINITIONS.length, upstream_skills: sourceRecords.length, mapped_blocks: mapRecords.length }, null, 2));
}

main().catch((error) => { console.error(`PDGO Skill integration build failed: ${error.message}`); process.exit(1); });
