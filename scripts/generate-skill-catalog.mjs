#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

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

function normalizeCatalog(catalog) {
  const seen = new Set();
  const categories = catalog.categories.map((category) => ({
    id: category.id,
    label: category.label,
    skills: category.skills.map((entry) => {
      const [skillId, scenario, output] = entry;
      if (!/^[a-z0-9-]+$/.test(skillId)) throw new Error(`Invalid Skill ID: ${skillId}`);
      if (seen.has(skillId)) throw new Error(`Duplicate Skill ID: ${skillId}`);
      seen.add(skillId);
      return { skill_id: skillId, scenario, output, category: category.id, category_label: category.label };
    }),
  }));
  return { schema_version: catalog.schema_version ?? "1.0", description: catalog.description, categories, skill_count: seen.size };
}

function markdown(catalog) {
  const lines = [
    "# FlowState Skill Catalog",
    "",
    "This is the complete methodology inventory. A category is a discovery aid; routing still requires the concrete scenario, boundaries, inputs, outputs, prerequisites, stage, department, and risk.",
    "",
    `Total inventory: **${catalog.skill_count} Skills**.`,
    "",
  ];
  for (const category of catalog.categories) {
    lines.push("## " + category.label + " (`" + category.id + "`)", "", "| Skill | Use scenario | Primary output |", "|---|---|---|");
    for (const skill of category.skills) lines.push(`| \`${skill.skill_id}\` | ${skill.scenario} | ${skill.output} |`);
    lines.push("");
  }
  lines.push("## Routing rule", "", "A Skill is selected from its metadata and the current task classification. A name or category alone never invokes a Skill. If no candidate satisfies the hard filters, stop with `skill-unresolved` and author or select a compatible Skill.");
  return `${lines.join("\n")}\n`;
}

const options = argsToObject(process.argv.slice(2));
const root = path.resolve(options.root ?? process.cwd());
const source = path.resolve(options.inventory ?? path.join(root, "profiles", "flowstate-skill-inventory.json"));
const catalog = normalizeCatalog(JSON.parse(await readFile(source, "utf8")));
const skillsRoot = path.join(root, "skills");
await mkdir(skillsRoot, { recursive: true });
await writeFile(path.join(skillsRoot, "category-index.json"), `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
await writeFile(path.join(skillsRoot, "category-index.md"), markdown(catalog), "utf8");
await writeFile(path.join(root, "docs", "skill-catalog.md"), markdown(catalog), "utf8");
console.log(JSON.stringify({ ok: true, skill_count: catalog.skill_count, path: "skills/category-index.json" }, null, 2));
