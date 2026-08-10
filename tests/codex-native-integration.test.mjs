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

test("secretary owns the user entry and explicitly invokes the non-implicit bridge after one exact approval", async () => {
  const secretaryRoot = path.join(root, "integrations", "codex-native", "skills", "bosscoding-secretary");
  const bridgeRoot = path.join(root, "integrations", "codex-native", "skills", "pdgo-codex-native-bridge");
  const secretary = await readFile(path.join(secretaryRoot, "SKILL.md"), "utf8");
  const secretaryIntegration = await readFile(path.join(secretaryRoot, "references", "integration.md"), "utf8");
  const bridge = await readFile(path.join(bridgeRoot, "SKILL.md"), "utf8");
  const bridgeOpenai = await readFile(path.join(bridgeRoot, "agents", "openai.yaml"), "utf8");

  assert.match(secretary, /秘书(?:，按 BossCoding 做)?：<任务>/);
  assert.doesNotMatch(secretary, /皇帝模式|Emperor mode/i);
  assert.match(secretary, /秘书，按 BossCoding 做：<任务>/);
  assert.match(secretary, /\$bosscoding-secretary/);
  assert.match(secretary, /\$nuwa-skill[^\n]*(不可用|不可见)[^\n]*不阻塞[^\n]*BossCoding/);
  assert.match(secretaryIntegration, /acy[^\n]*only selects roles[^\n]*not approval/i);
  assert.match(secretaryIntegration, /one exact user approval[^\n]*planning[^\n]*execution[^\n]*review/i);
  assert.match(secretaryIntegration, /explicitly invoke[^\n]*\$pdgo-codex-native-bridge/i);
  assert.match(bridge, /获批后[^\n]*planning[^\n]*(验证|细化)/i);
  assert.match(bridgeOpenai, /allow_implicit_invocation: false/);
});

test("plan and dispatch contracts separate host role assignments from advisory method lenses", async () => {
  const planSchema = await readFile(path.join(root, "schemas", "plan.yaml"), "utf8");
  const dispatchSchema = await readFile(path.join(root, "schemas", "dispatch.yaml"), "utf8");
  const profile = JSON.parse(await readFile(path.join(root, "profiles", "bosscoding-codex-consumer.json"), "utf8"));

  assert.match(planSchema, /^role_contract:$/m);
  assert.match(planSchema, /^\s+version: bosscoding-v2$/m);
  assert.match(planSchema, /^role_assignments:$/m);
  assert.match(planSchema, /^method_lenses:$/m);
  assert.match(dispatchSchema, /^host_agent_type: null$/m);
  assert.match(dispatchSchema, /^selection_source: null$/m);
  assert.match(dispatchSchema, /^role_assignment_hash: null$/m);
  assert.match(dispatchSchema, /^method_lenses: \[\]$/m);
  assert.match(dispatchSchema, /^execution_baseline:$/m);
  assert.equal(profile.role_selection.acy_selects_only, true);
  assert.equal(profile.role_selection.host_agent_type_observation_source, "main-agent-recorded-spawn-agent.agent_type");
  assert.equal(profile.role_selection.selection_source_semantics, "approved-role-selection-provenance");
  assert.equal(profile.role_selection.host_binding_is_cryptographic_proof, false);
  assert.equal(profile.role_selection.permission_mode_is_os_sandbox, false);
  assert.equal(profile.role_selection.host_to_external_id_conversion, "forbidden");
  assert.equal(profile.method_lenses.authority, "advisory-only");
  assert.equal(profile.method_lenses.review_target_forbidden, true);
});

test("public BossCoding quick start uses the secretary and isolates direct CLI as legacy-only", async () => {
  const english = await readFile(path.join(root, "README.md"), "utf8");
  const chinese = await readFile(path.join(root, "README.zh-CN.md"), "utf8");
  const englishQuickStart = english.match(/## BossCoding quick start\n([\s\S]*?)(?=\n## )/)?.[1] ?? "";
  const chineseQuickStart = chinese.match(/## BossCoding 快速开始\n([\s\S]*?)(?=\n## )/)?.[1] ?? "";
  assert.match(englishQuickStart, /秘书(?:，按 BossCoding 做)?：<任务>/);
  assert.match(chineseQuickStart, /秘书(?:，按 BossCoding 做)?：<任务>/);
  assert.doesNotMatch(englishQuickStart, /皇帝模式|Emperor mode/i);
  assert.doesNotMatch(chineseQuickStart, /皇帝模式|Emperor mode/i);
  assert.doesNotMatch(englishQuickStart, /flowstate-dispatcher|--action/);
  assert.doesNotMatch(chineseQuickStart, /flowstate-dispatcher|--action/);
  assert.match(english, /## Legacy PDGO direct CLI[\s\S]*legacy-v1[\s\S]*flowstate-dispatcher/i);
  assert.match(chinese, /## 旧版 PDGO 直接 CLI[\s\S]*legacy-v1[\s\S]*flowstate-dispatcher/i);
});

test("BossCoding profile pins the global schema-1.1 runtime tree and isolated project state layout", async () => {
  const manifest = JSON.parse(await readFile(path.join(root, "integrations", "codex-native", "manifest.json"), "utf8"));
  const profile = JSON.parse(await readFile(path.join(root, "profiles", "bosscoding-codex-consumer.json"), "utf8"));
  assert.equal(profile.schema_version, "1.1");
  assert.equal(profile.runtime_descriptor.path, "<CodexHome>/runtime/bosscoding/runtime.json");
  assert.deepEqual(profile.runtime_descriptor.required_shape, {
    schema_version: "1.1",
    integration_id: "pdgo-codex-native",
    runtime_root: "absolute-path",
    manifest: { path: "relative-path", sha256: "sha256-hex" },
    dispatcher: { path: "relative-path", sha256: "sha256-hex" },
    runtime_tree: {
      algorithm: "sha256-tree-v1",
      paths: "manifest.runtime_tree.paths",
      sha256: "sha256-hex",
    },
  });
  assert.deepEqual(profile.runtime_descriptor.required_runtime_tree_paths, manifest.runtime_tree.paths);
  assert.ok(manifest.runtime_tree.paths.includes("integrations/external-agents/agency-agents/metadata-index.json"));
  assert.ok(manifest.runtime_tree.paths.includes("integrations/codex-native/skills/pdgo-codex-native-bridge/scripts/resolve-cold-start.mjs"));
  assert.equal(profile.runtime_descriptor.hash_mismatch_action, "block");
  assert.equal(profile.project_state.root_template, "<CodexHome>/state/bosscoding/projects/<name>-<hash16>");
  assert.equal(profile.verified_dispatch.entry, "installed-resolver-invoke");
  assert.equal(profile.verified_dispatch.recomputes_project_state_root, true);
  assert.equal(profile.verified_dispatch.runtime_catalog_overrides_forbidden, true);
  assert.equal(profile.verified_dispatch["same-user-malicious-process_isolation"], false);

  const readme = await readFile(path.join(root, "README.md"), "utf8");
  const runtimeDocs = await readFile(path.join(root, "docs", "dispatch-runtime.md"), "utf8");
  const bridgeIntegration = await readFile(
    path.join(root, "integrations", "codex-native", "skills", "pdgo-codex-native-bridge", "references", "integration.md"),
    "utf8",
  );
  for (const document of [readme, runtimeDocs, bridgeIntegration]) {
    assert.doesNotMatch(document, /nested-v1|"schema_version": "1\.0"/i);
    assert.match(document, /schema(?:-| )?1\.1/i);
    assert.match(document, /runtime_tree/);
    assert.match(document, /dispatcher[^\n]*(?:import|library|libraries)|(?:import|library|libraries)[^\n]*dispatcher/i);
  }
  assert.match(runtimeDocs, /configured specialist index, metadata index, and prompt tree/i);
  assert.match(runtimeDocs, /PATHS_FROM_HASHED_MANIFEST/);
  assert.doesNotMatch(runtimeDocs, /integrations\/external-agents\/agency-agents/i);
});

test("manifest is the single runtime-tree path contract used by installer and resolver", async () => {
  const manifest = JSON.parse(await readFile(path.join(root, "integrations", "codex-native", "manifest.json"), "utf8"));
  const profile = JSON.parse(await readFile(path.join(root, "profiles", "bosscoding-codex-consumer.json"), "utf8"));
  const installer = await readFile(path.join(root, "scripts", "install-codex-native.mjs"), "utf8");
  const resolver = await readFile(path.join(root, "integrations", "codex-native", "skills", "pdgo-codex-native-bridge", "scripts", "resolve-cold-start.mjs"), "utf8");

  assert.deepEqual(profile.runtime_descriptor.required_runtime_tree_paths, manifest.runtime_tree.paths);
  assert.doesNotMatch(installer, /const REQUIRED_RUNTIME_PATHS\s*=/);
  assert.doesNotMatch(resolver, /const REQUIRED_RUNTIME_PATHS\s*=/);
  assert.match(installer, /manifest\.runtime_tree\.paths/);
  assert.match(resolver, /manifest\.runtime_tree\.paths/);
});

test("global BossCoding overlay is marker-free source content for idempotent installer replacement", async () => {
  const overlay = await readFile(path.join(root, "integrations", "codex-native", "global-agents-overlay.md"), "utf8");
  assert.doesNotMatch(overlay, /<!-- (BEGIN|END) BOSSCODING-PDGO OVERLAY -->/);
  assert.match(overlay, /\$pdgo-codex-native-bridge/);
  assert.match(overlay, /acy[^\n]*不是批准/);
  assert.match(overlay, /人物 Skill[^\n]*不能[^\n]*验收/);
  assert.match(overlay, /一次批准[^\n]*策划[^\n]*执行[^\n]*独立审核/);
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
