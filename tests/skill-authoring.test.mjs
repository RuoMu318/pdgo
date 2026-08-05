import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createSkill, parseSpec } from "../scripts/lib/skill-authoring.mjs";

const spec = {
  scope: "tianyan",
  scenario: "three.js resource cleanup",
  action: "audit and fix",
  outcome: "lifecycle report",
  positiveTriggers: ["GPU resources remain after a model is removed"],
  boundaries: ["Do not use for Blender asset authoring"],
  inputs: ["repository", "reproduction or lifecycle trace"],
  outputs: ["resource ownership findings", "validated cleanup change"],
  shortDescription: "Audit Three.js resource ownership and cleanup",
};

test("derives a descriptive scenario-based Skill id", () => {
  const parsed = parseSpec(spec);
  assert.equal(parsed.skillId, "tianyan-three-js-resource-cleanup-audit-and-fix-lifecycle-report");
  assert.match(parsed.shortDescription, /Three\.js/);
});

test("generates Skill files and searchable indexes", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "flowstate-skill-"));
  try {
    const result = await createSkill({ root, spec });
    const skill = await readFile(path.join(result.path, "SKILL.md"), "utf8");
    const manifest = await readFile(path.join(result.path, "skill-manifest.yaml"), "utf8");
    const index = JSON.parse(await readFile(path.join(root, "skills", "skill-index.json"), "utf8"));
    assert.match(skill, /## Use when/);
    assert.match(skill, /## Do not use when/);
    assert.match(manifest, /positive_triggers/);
    assert.equal(index.skills.length, 1);
    assert.equal(index.skills[0].skill_id, result.skillId);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
