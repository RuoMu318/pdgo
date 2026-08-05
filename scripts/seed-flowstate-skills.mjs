#!/usr/bin/env node

import { readFile } from "node:fs/promises";
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

const options = argsToObject(process.argv.slice(2));
const root = path.resolve(options.root ?? process.cwd());
const catalogPath = path.resolve(options.catalog ?? path.join(root, "profiles", "flowstate-skill-catalog.json"));
const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
const results = [];
for (const spec of catalog) results.push(await createSkill({ root, spec, force: Boolean(options.force) }));
console.log(JSON.stringify({ ok: true, generated: results.length, skills: results }, null, 2));
