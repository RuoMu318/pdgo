import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));

function gitBlobSha(text) {
  const bytes = Buffer.from(text, "utf8");
  return createHash("sha1").update(`blob ${bytes.length}\0`, "utf8").update(bytes).digest("hex");
}

function bodyWithoutFrontmatter(text) {
  const lines = text.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") return text.trim();
  const end = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
  return (end < 0 ? text : lines.slice(end + 1).join("\n")).trim();
}

test("the Superpowers baseline is locked and every upstream body is merged into an active PDGO Skill", async () => {
  const integrationRoot = path.join(root, "integrations", "external-skills", "superpowers");
  const lock = JSON.parse(await readFile(path.join(integrationRoot, "source-lock.json"), "utf8"));
  const map = JSON.parse(await readFile(path.join(integrationRoot, "integration-map.json"), "utf8"));
  assert.equal(lock.commit, "44c9b2d6e889982ac18c27d05a19fefe335194e1");
  assert.equal(lock.sources.length, 14);
  assert.ok(map.blocks.length > 0);
  assert.ok(map.blocks.every((block) => ["preserved", "merged", "explicitly-inapplicable"].includes(block.status)));
  for (const source of lock.sources) {
    const raw = await readFile(path.join(root, source.path), "utf8");
    const hash = createHash("sha256").update(raw, "utf8").digest("hex");
    assert.equal(hash, source.sha256, source.skill_id);
    assert.equal(gitBlobSha(raw), source.git_blob_sha, source.skill_id);
    const generated = lock.generated_skills.find((item) => item.sources.includes(source.skill_id));
    assert.ok(generated, `missing active mapping for ${source.skill_id}`);
    const active = await readFile(path.join(root, generated.active_path), "utf8");
    assert.ok(active.includes(bodyWithoutFrontmatter(raw)), `missing integrated workflow body for ${source.skill_id}`);
    assert.ok(map.blocks.some((block) => block.source_skill === source.skill_id), `missing block map for ${source.skill_id}`);
  }
});

test("there are exactly ten active PDGO Skills and no legacy FlowState shell directories", async () => {
  const skillsRoot = path.join(root, "skills");
  const directories = await readdir(skillsRoot, { withFileTypes: true });
  const active = directories.filter((entry) => entry.isDirectory() && entry.name.startsWith("pdgo-"));
  const legacy = directories.filter((entry) => entry.isDirectory() && entry.name.startsWith("flowstate-"));
  assert.equal(active.length, 10);
  assert.equal(legacy.length, 0);
  for (const entry of active) {
    const skill = path.join(skillsRoot, entry.name, "SKILL.md");
    assert.equal((await stat(skill)).isFile(), true);
  }
});

test("all 271 Agency Agent prompts have source-backed metadata", async () => {
  const agentRoot = path.join(root, "integrations", "external-agents", "agency-agents");
  const catalog = JSON.parse(await readFile(path.join(agentRoot, "index.json"), "utf8"));
  const metadata = JSON.parse(await readFile(path.join(agentRoot, "metadata-index.json"), "utf8"));
  assert.equal(catalog.provider.agent_count, 271);
  assert.equal(metadata.agent_count, 271);
  assert.equal(metadata.agents.length, 271);
  for (const agent of metadata.agents) {
    assert.match(agent.source_sha, /^[a-f0-9]{40}$/);
    assert.ok(["eligible-with-explicit-task-selector", "manual-only"].includes(agent.routing_mode));
    const metadataPath = path.join(root, agent.metadata_path);
    assert.equal((await stat(metadataPath)).isFile(), true);
    const source = catalog.agents.find((entry) => entry.agent_id === agent.agent_id);
    assert.ok(source, agent.agent_id);
    const prompt = await readFile(path.join(root, source.prompt_path), "utf8");
    assert.equal(gitBlobSha(prompt), agent.source_sha, agent.agent_id);
  }
});
