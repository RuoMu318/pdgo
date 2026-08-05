#!/usr/bin/env node

import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { createSkill } from "./lib/skill-authoring.mjs";

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

function humanize(value) {
  return String(value).replace(/[-_]+/g, " ").replace(/\b\w/g, (match) => match.toUpperCase());
}

async function exists(filePath) {
  try { await access(filePath); return true; } catch { return false; }
}

const options = argsToObject(process.argv.slice(2));
const root = path.resolve(options.root ?? process.cwd());
const inventoryPath = path.resolve(options.inventory ?? path.join(root, "profiles", "flowstate-skill-inventory.json"));
const inventory = JSON.parse(await readFile(inventoryPath, "utf8"));
const starterPath = path.resolve(options.catalog ?? path.join(root, "profiles", "flowstate-skill-catalog.json"));
const starterCatalog = JSON.parse(await readFile(starterPath, "utf8"));
const protectedSkillIds = new Set(["flowstate-project-method", "flowstate-skill-authoring", ...starterCatalog.map((spec) => spec.skillId)]);
const highRisk = new Set(["dispatch", "debugging", "release-audit", "adapters"]);
const results = [];
for (const category of inventory.categories) {
  for (const [skillId, scenario, output] of category.skills) {
    const skillPath = path.join(root, "skills", skillId);
    if (await exists(path.join(skillPath, "SKILL.md")) && (!options.force || protectedSkillIds.has(skillId))) {
      results.push({ skillId, status: "existing" });
      continue;
    }
    const categoryLabel = category.label;
    const spec = {
      skillId,
      scope: "flowstate",
      category: category.id,
      subcategory: skillId.replace(/^flowstate-/, ""),
      scenario,
      action: `apply the ${categoryLabel} workflow within the declared scope`,
      outcome: output,
      displayName: humanize(skillId),
      shortDescription: `${humanize(category.id)} workflow for ${output}`.slice(0, 64),
      description: `Apply the FlowState ${categoryLabel.toLowerCase()} workflow when the concrete scenario is: ${scenario}. Produce ${output} with evidence and status.`,
      positiveTriggers: [scenario],
      boundaries: [`Do not use outside ${categoryLabel.toLowerCase()} scenarios`, "Do not bypass approval, scope, evidence, or safety gates"],
      inputs: ["classified project context", "plan or task-local artifacts", "current constraints"],
      outputs: [output, "evidence, risks, blockers, and next action"],
      prerequisites: ["FlowState startup classification", "declared scope"],
      sideEffects: ["may create governed planning, execution, review, or audit records"],
      riskLevel: highRisk.has(category.id) ? "high" : "medium",
      priority: 50,
    };
    results.push({ skillId, status: "generated", ...(await createSkill({ root, spec, force: Boolean(options.force) })) });
  }
}
console.log(JSON.stringify({ ok: true, generated: results.filter((item) => item.status === "generated").length, existing: results.filter((item) => item.status === "existing").length, total: results.length }, null, 2));
