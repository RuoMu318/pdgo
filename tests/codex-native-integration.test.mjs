import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();

test("Codex-native integration keeps its two Skills outside the locked ten-Skill core catalog", async () => {
  const manifest = JSON.parse(await readFile(path.join(root, "integrations", "codex-native", "manifest.json"), "utf8"));
  const index = JSON.parse(await readFile(path.join(root, "integrations", "codex-native", "skill-index.json"), "utf8"));
  assert.deepEqual(manifest.skills, ["bosscoding-secretary", "pdgo-codex-native-bridge"]);
  assert.equal(manifest.core_pdgo_skill_catalog_unchanged, true);
  assert.deepEqual(index.skills.map((entry) => entry.skill_id), manifest.skills);

  for (const entry of index.skills) {
    const skillRoot = path.join(root, entry.path);
    const skill = await readFile(path.join(skillRoot, "SKILL.md"), "utf8");
    const openai = await readFile(path.join(skillRoot, "agents", "openai.yaml"), "utf8");
    const integration = await readFile(path.join(skillRoot, "references", "integration.md"), "utf8");
    assert.match(skill, new RegExp(`^---\\nname: ${entry.skill_id}\\n`, "m"));
    assert.match(openai, new RegExp(`\\$${entry.skill_id.replaceAll("-", "\\-")}`));
    assert.ok(integration.length > 100);
  }
});

test("BossCoding Codex profile requires real built-in subagent identities and bounded no-progress stopping", async () => {
  const profile = JSON.parse(await readFile(path.join(root, "profiles", "bosscoding-codex-consumer.json"), "utf8"));
  assert.deepEqual(profile.host_transport.required_operations, ["spawn_agent", "followup_task", "wait_agent"]);
  assert.equal(profile.host_transport.real_host_id_required, true);
  assert.equal(profile.host_transport.cli_model_handoff_forbidden, true);
  assert.equal(profile.policy.no_progress_limit, 2);
  assert.equal(profile.policy.failed_review_cannot_be_overridden_by_secretary, true);
});

test("Codex-native bridge binds the real planning subagent as well as worker and reviewer", async () => {
  const skill = await readFile(
    path.join(root, "integrations", "codex-native", "skills", "pdgo-codex-native-bridge", "SKILL.md"),
    "utf8",
  );
  const integration = await readFile(
    path.join(root, "integrations", "codex-native", "skills", "pdgo-codex-native-bridge", "references", "integration.md"),
    "utf8",
  );
  assert.match(skill, /bind-host-session[^.\n]*planning/i);
  assert.match(integration, /\"role\": \"planning\"/);
});

test("execution report schema preserves the controller session field and adds a versioned worker identity", async () => {
  const schema = await readFile(path.join(root, "schemas", "execution-report.yaml"), "utf8");
  assert.match(schema, /^schema_version: "1\.1"$/m);
  assert.equal((schema.match(/^session_id:/gm) ?? []).length, 1);
  assert.match(schema, /^session_id: execution-session-id$/m);
  assert.match(schema, /^worker_session_id: execution-worker-session-id$/m);
});

test("locked external prompts opt out of Windows text conversion", async () => {
  const attributes = await readFile(path.join(root, ".gitattributes"), "utf8");
  assert.match(
    attributes,
    /^integrations\/external-agents\/agency-agents\/prompts\/\*\* -text /m,
  );
});
