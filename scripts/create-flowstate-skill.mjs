#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import { createSkill } from "./lib/skill-authoring.mjs";

function argsToObject(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) result[key] = true;
    else { result[key] = value; i += 1; }
  }
  return result;
}

const options = argsToObject(process.argv.slice(2));
if (!options.spec) {
  console.error("Usage: node scripts/create-flowstate-skill.mjs --spec <skill-spec.json> [--root <repo>] [--force]");
  process.exit(2);
}

try {
  const root = path.resolve(options.root ?? process.cwd());
  const spec = JSON.parse(await readFile(path.resolve(options.spec), "utf8"));
  const result = await createSkill({ root, spec, force: Boolean(options.force) });
  console.log(JSON.stringify({ ok: true, ...result }, null, 2));
} catch (error) {
  console.error(`PDGO Skill creation failed: ${error.message}`);
  process.exit(1);
}
