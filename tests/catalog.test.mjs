import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("active PDGO Skill catalog is categorized, unique, and contains no legacy shell Skills", async () => {
  const catalog = JSON.parse(await readFile(new URL("../skills/category-index.json", import.meta.url), "utf8"));
  const skills = catalog.categories.flatMap((category) => category.skills);
  assert.equal(catalog.skill_count, skills.length);
  assert.equal(new Set(skills.map((skill) => skill.skill_id)).size, skills.length);
  assert.equal(skills.length, 10);
  assert.ok(skills.every((skill) => skill.category && Array.isArray(skill.scenarios) && skill.scenarios.length > 0 && Array.isArray(skill.outputs) && skill.outputs.length > 0));
  assert.ok(skills.every((skill) => skill.skill_id.startsWith("pdgo-")));
});
