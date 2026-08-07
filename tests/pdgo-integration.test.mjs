import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { normalizePdgoActiveSkillText } from "../scripts/lib/pdgo-active-skill-text.mjs";

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

test("the locked workflow baseline is intact and every normalized body is merged into an active PDGO Skill", async () => {
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
    const normalizedBody = normalizePdgoActiveSkillText(bodyWithoutFrontmatter(raw));
    assert.ok(active.includes(normalizedBody), `missing integrated workflow body for ${source.skill_id}`);
    assert.doesNotMatch(active, /superpowers/i, `external project label leaked into ${generated.active_path}`);
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

test("planning and execution Skills enforce the abnormal-stop escalation loop", async () => {
  const execution = await readFile(path.join(root, "skills", "pdgo-execute-work", "SKILL.md"), "utf8");
  const planning = await readFile(path.join(root, "skills", "pdgo-plan-work", "SKILL.md"), "utf8");
  for (const content of [execution, planning]) {
    assert.match(content, /BLOCKER_REPORT/);
    assert.match(content, /PLANNING_BLOCKER_OPINION/);
    assert.match(content, /USER_ACTION_REQUIRED/);
    assert.match(content, /normal completion/i);
  }
});

test("public PDGO documentation and active Skill text contain no external source branding", async () => {
  const publicPaths = ["README.md", "README.zh-CN.md", "scripts/README.md"];
  const docsRoot = path.join(root, "docs");
  for (const entry of await readdir(docsRoot, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith(".md")) publicPaths.push(path.join("docs", entry.name));
  }
  const skillsRoot = path.join(root, "skills");
  for (const entry of await readdir(skillsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith("pdgo-")) continue;
    publicPaths.push(path.join("skills", entry.name, "SKILL.md"));
    publicPaths.push(path.join("skills", entry.name, "references", "integration.md"));
    publicPaths.push(path.join("skills", entry.name, "skill-manifest.yaml"));
    publicPaths.push(path.join("skills", entry.name, "agents", "openai.yaml"));
  }
  for (const publicPath of publicPaths) {
    const content = await readFile(path.join(root, publicPath), "utf8");
    assert.doesNotMatch(content, /superpowers|agency-agents|msitarzewski|obra\/superpowers/i, publicPath);
  }
});

test("all 271 specialist Agent prompts have source-backed metadata", async () => {
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
