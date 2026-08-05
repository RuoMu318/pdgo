import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import path from "node:path";

const SKILL_NAME_MAX = 64;

function asArray(value, field) {
  if (value === undefined || value === null) return [];
  const values = Array.isArray(value) ? value : [value];
  const result = values.map((item) => String(item).trim()).filter(Boolean);
  if (!result.length) throw new Error(`${field} must contain at least one non-empty value`);
  return result;
}

function slugify(value) {
  const normalized = String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
  return normalized;
}

function shortenSlug(value) {
  if (value.length <= SKILL_NAME_MAX) return value;
  const parts = value.split("-");
  let result = "";
  for (const part of parts) {
    const candidate = result ? `${result}-${part}` : part;
    if (candidate.length > SKILL_NAME_MAX) break;
    result = candidate;
  }
  return result || value.slice(0, SKILL_NAME_MAX).replace(/-+$/g, "");
}

function humanize(value) {
  return String(value ?? "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase())
    .trim();
}

const CATEGORY_RULES = [
  ["planning", /brainstorm|plan|architect|requirement|discover|design/i],
  ["execution", /dispatch|parallel|subagent|execute|worktree|branch|implement|develop/i],
  ["review", /review|validate|test|tdd|acceptance|verify/i],
  ["debugging", /debug|diagnos|reproduc|incident|recover/i],
  ["memory", /memory|knowledge|session|summary|retrieve|index/i],
  ["skill-authoring", /skill|route|catalog|metadata/i],
  ["documentation", /document|write|readme|spec|prompt/i],
  ["release", /release|commit|publish|handoff|complete/i],
];

function inferCategory(spec) {
  const haystack = [spec.category, spec.subcategory, spec.scenario, spec.action, spec.outcome, spec.department, spec.stage]
    .flatMap((value) => Array.isArray(value) ? value : [value])
    .join(" ");
  return CATEGORY_RULES.find(([, pattern]) => pattern.test(haystack))?.[0] ?? "coordination";
}

function yamlString(value) {
  return JSON.stringify(value);
}

function yamlDocument(record) {
  return Object.entries(record)
    .map(([key, value]) => `${key}: ${yamlString(value)}`)
    .join("\n") + "\n";
}

function parseSpec(spec) {
  if (!spec || typeof spec !== "object") throw new Error("A JSON Skill specification is required");
  const scope = String(spec.scope ?? "").trim();
  const scenario = String(spec.scenario ?? "").trim();
  const action = String(spec.action ?? "").trim();
  const outcome = String(spec.outcome ?? "").trim();
  if (!scope || !scenario || !action || !outcome) {
    throw new Error("scope, scenario, action, and outcome are required");
  }

  const explicitId = slugify(spec.skillId ?? spec.id ?? "");
  const derivedId = shortenSlug(slugify([scope, scenario, action, outcome].join("-")));
  const skillId = explicitId || derivedId;
  if (!skillId) {
    throw new Error("Skill name could not be generated; provide an ASCII skillId");
  }
  if (skillId.length > SKILL_NAME_MAX) throw new Error("skillId must be 64 characters or fewer");

  const positiveTriggers = asArray(spec.positiveTriggers ?? spec.triggers, "positiveTriggers");
  const boundaries = asArray(spec.boundaries ?? spec.exclusions, "boundaries");
  const negativeTriggers = asArray(spec.negativeTriggers ?? boundaries, "negativeTriggers");
  const inputs = asArray(spec.inputs ?? spec.requiredInputs, "inputs");
  const outputs = asArray(spec.outputs ?? spec.expectedOutputs, "outputs");
  const prerequisites = spec.prerequisites ? asArray(spec.prerequisites, "prerequisites") : [];
  const sideEffects = spec.sideEffects ? asArray(spec.sideEffects, "sideEffects") : [];
  const projectScope = spec.projectScope ? asArray(spec.projectScope, "projectScope") : [scope];
  const department = spec.department ? asArray(spec.department, "department") : ["planning", "execution", "review"];
  const stage = spec.stage ? asArray(spec.stage, "stage") : ["discovery", "design", "implementation", "validation"];
  const description = String(spec.description ?? `Handle ${scenario} by performing ${action}.`).trim();
  const displayName = String(spec.displayName ?? humanize([scope, scenario, action].join(" "))).trim();
  const shortDescription = String(spec.shortDescription ?? `${humanize(scenario)} ${humanize(action)} workflow`).trim();
  const riskLevel = String(spec.riskLevel ?? spec.risk ?? "medium").trim();
  const priority = Number.isFinite(Number(spec.priority)) ? Number(spec.priority) : 50;
  const selectionReason = String(spec.selectionReason ?? `Use when the concrete scenario matches ${scenario}.`).trim();
  const category = slugify(spec.category ?? inferCategory(spec)) || "coordination";
  const subcategory = slugify(spec.subcategory ?? scenario) || category;
  const tags = spec.tags ? asArray(spec.tags, "tags") : [category, subcategory];

  if (shortDescription.length < 25) throw new Error("shortDescription must be at least 25 characters");
  if (shortDescription.length > 64) throw new Error("shortDescription must be 64 characters or fewer");
  if (!positiveTriggers.length || !negativeTriggers.length || !inputs.length || !outputs.length) {
    throw new Error("positiveTriggers, boundaries/negativeTriggers, inputs, and outputs are required");
  }

  return {
    skillId,
    displayName,
    shortDescription,
    description,
    scope,
    scenario,
    action,
    outcome,
    projectScope,
    department,
    stage,
    positiveTriggers,
    negativeTriggers,
    boundaries,
    inputs,
    outputs,
    prerequisites,
    sideEffects,
    riskLevel,
    priority,
    selectionReason,
    category,
    subcategory,
    tags,
  };
}

function skillDescription(spec) {
  return [
    spec.description,
    `Use for scenarios: ${spec.positiveTriggers.join("; ")}.`,
    `Do not use for: ${spec.boundaries.join("; ")}.`,
    `Expected outputs: ${spec.outputs.join("; ")}.`,
  ].join(" ");
}

function skillMarkdown(spec) {
  return `---
name: ${spec.skillId}
description: ${yamlString(skillDescription(spec))}
---

# ${spec.displayName}

## Scope

- Scenario: ${spec.scenario}
- Action: ${spec.action}
- Intended outcome: ${spec.outcome}
- Project scope: ${spec.projectScope.join(", ")}
- Departments: ${spec.department.join(", ")}
- Stages: ${spec.stage.join(", ")}
- Category: ${spec.category}
- Subcategory: ${spec.subcategory}
- Tags: ${spec.tags.join(", ")}

## Use when

${spec.positiveTriggers.map((item) => `- ${item}`).join("\n")}

## Do not use when

${spec.boundaries.map((item) => `- ${item}`).join("\n")}

## Required inputs

${spec.inputs.map((item) => `- ${item}`).join("\n")}

## Required outputs

${spec.outputs.map((item) => `- ${item}`).join("\n")}

## Workflow

1. Confirm the scenario and project scope.
2. Verify the required inputs and prerequisites.
3. Perform only the declared action.
4. Produce every declared output and supporting evidence.
5. Report deviations, risks, blockers, and unresolved assumptions.

## Selection note

${spec.selectionReason}

## Safety

- Respect the current project mode and approval gate.
- Do not expand scope or claim completion without evidence.
${spec.sideEffects.length ? spec.sideEffects.map((item) => `- Side effect to control: ${item}`).join("\n") : "- No side effects were declared."}
`;
}

function referenceMarkdown(spec) {
  return `# ${spec.displayName} metadata

## Scenario

${spec.scenario}

## Boundaries

${spec.boundaries.map((item) => `- ${item}`).join("\n")}

## Inputs

${spec.inputs.map((item) => `- ${item}`).join("\n")}

## Outputs

${spec.outputs.map((item) => `- ${item}`).join("\n")}

## Prerequisites

${spec.prerequisites.length ? spec.prerequisites.map((item) => `- ${item}`).join("\n") : "- None declared."}
`;
}

function manifest(spec) {
  return {
    schema_version: "1.0",
    skill_id: spec.skillId,
    display_name: spec.displayName,
    description: spec.description,
    project_scope: spec.projectScope,
    department: spec.department,
    stage: spec.stage,
    scenarios: [spec.scenario],
    positive_triggers: spec.positiveTriggers,
    negative_triggers: spec.negativeTriggers,
    boundaries: spec.boundaries,
    required_inputs: spec.inputs,
    expected_outputs: spec.outputs,
    prerequisites: spec.prerequisites,
    side_effects: spec.sideEffects,
    risk_level: spec.riskLevel,
    priority: spec.priority,
    category: spec.category,
    subcategory: spec.subcategory,
    tags: spec.tags,
  };
}

async function readIndex(indexPath) {
  try {
    const parsed = JSON.parse(await readFile(indexPath, "utf8"));
    if (Array.isArray(parsed)) return { schema_version: "1.0", skills: parsed };
    return { schema_version: parsed.schema_version ?? "1.0", skills: Array.isArray(parsed.skills) ? parsed.skills : [] };
  } catch (error) {
    if (error.code === "ENOENT") return { schema_version: "1.0", skills: [] };
    throw error;
  }
}

function indexEntry(spec) {
  return {
    skill_id: spec.skillId,
    display_name: spec.displayName,
    path: `skills/${spec.skillId}`,
    project_scope: spec.projectScope,
    departments: spec.department,
    stages: spec.stage,
    scenarios: [spec.scenario],
    positive_triggers: spec.positiveTriggers,
    negative_triggers: spec.negativeTriggers,
    boundaries: spec.boundaries,
    inputs: spec.inputs,
    outputs: spec.outputs,
    risk_level: spec.riskLevel,
    priority: spec.priority,
    category: spec.category,
    subcategory: spec.subcategory,
    tags: spec.tags,
  };
}

async function writeIndex(root, entry, force) {
  const skillsRoot = path.join(root, "skills");
  await mkdir(skillsRoot, { recursive: true });
  const indexPath = path.join(skillsRoot, "skill-index.json");
  const index = await readIndex(indexPath);
  const existing = index.skills.findIndex((item) => item.skill_id === entry.skill_id);
  if (existing >= 0 && !force) throw new Error(`Skill index already contains ${entry.skill_id}; use --force to replace it`);
  if (existing >= 0) index.skills.splice(existing, 1, entry);
  else index.skills.push(entry);
  index.skills.sort((a, b) => a.skill_id.localeCompare(b.skill_id));
  await writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`, "utf8");
  const lines = ["# Skill index", "", "Generated by FlowState Skill Authoring.", "", "| Category | Skill | Scenario | Outputs | Scope |", "|---|---|---|---|---|"];
  for (const item of index.skills) {
    lines.push(`| ${item.category ?? "coordination"} | \`${item.skill_id}\` | ${item.scenarios.join("; ")} | ${item.outputs.join("; ")} | ${item.project_scope.join("; ")} |`);
  }
  await writeFile(path.join(skillsRoot, "skill-index.md"), `${lines.join("\n")}\n`, "utf8");
  return indexPath;
}

export async function createSkill({ root, spec, force = false }) {
  const normalized = parseSpec(spec);
  const skillRoot = path.join(root, "skills", normalized.skillId);
  try {
    await access(skillRoot);
    if (!force) throw new Error(`Skill directory already exists: ${skillRoot}`);
  } catch (error) {
    if (error.code !== "ENOENT" && !error.message.startsWith("Skill directory already exists")) throw error;
    if (error.message.startsWith("Skill directory already exists")) throw error;
  }

  await mkdir(path.join(skillRoot, "agents"), { recursive: true });
  await mkdir(path.join(skillRoot, "references"), { recursive: true });
  await writeFile(path.join(skillRoot, "SKILL.md"), skillMarkdown(normalized), "utf8");
  await writeFile(path.join(skillRoot, "skill-manifest.yaml"), yamlDocument(manifest(normalized)), "utf8");
  await writeFile(path.join(skillRoot, "agents", "openai.yaml"), yamlDocument({
    interface: {
      display_name: normalized.displayName,
      short_description: normalized.shortDescription,
      default_prompt: `Use $${normalized.skillId} for ${normalized.scenario} and produce ${normalized.outcome}.`,
    },
    policy: { allow_implicit_invocation: true },
  }), "utf8");
  await writeFile(path.join(skillRoot, "references", "metadata.md"), referenceMarkdown(normalized), "utf8");
  await writeIndex(root, indexEntry(normalized), force);
  return { skillId: normalized.skillId, path: skillRoot };
}

export { parseSpec, slugify };
