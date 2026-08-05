import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("methodology inventory is categorized and unique", async () => {
  const catalog = JSON.parse(await readFile(new URL("../skills/category-index.json", import.meta.url), "utf8"));
  const skills = catalog.categories.flatMap((category) => category.skills);
  assert.equal(catalog.skill_count, skills.length);
  assert.equal(new Set(skills.map((skill) => skill.skill_id)).size, skills.length);
  assert.ok(skills.length >= 90);
  assert.ok(skills.every((skill) => skill.category && skill.scenario && skill.output));
});
