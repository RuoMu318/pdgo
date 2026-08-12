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
    assert.match(skill, new RegExp(`^---\\r?\\nname: ${entry.skill_id}\\r?\\n`, "m"));
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
  const englishQuickStart = english.match(/## BossCoding quick start\r?\n([\s\S]*?)(?=\r?\n## )/)?.[1] ?? "";
  const chineseQuickStart = chinese.match(/## BossCoding 快速开始\r?\n([\s\S]*?)(?=\r?\n## )/)?.[1] ?? "";
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

test("global BossCoding overlay is a bounded three-mode bootstrap", async () => {
  const overlay = await readFile(path.join(root, "integrations", "codex-native", "global-agents-overlay.md"), "utf8");
  assert.doesNotMatch(overlay, /<!-- (BEGIN|END) BOSSCODING-PDGO OVERLAY -->/);
  assert.ok(Buffer.byteLength(overlay, "utf8") <= 3500);
  assert.match(overlay, /轻量模式/);
  assert.match(overlay, /标准模式/);
  assert.match(overlay, /高保障模式/);
  assert.match(overlay, /分流[^。\n]*先于[^。\n]*(?:副作用|写入|调用)/);
  for (const zeroCost of [
    "extra_model_calls",
    "subagents",
    "state_writes",
    "pdgo_new_approval_rounds",
    "formal_plan_generations",
    "governance_prompt_loads",
    "role_process_loads",
  ]) {
    assert.match(overlay, new RegExp(`${zeroCost}\\s*=\\s*0`));
  }
  assert.match(overlay, /轻量模式[^\n]*不加载[^\n]*秘书/);
  assert.match(overlay, /标准模式[^\n]*(?:当前|单一)[^\n]*Agent[^\n]*(?:自检|检查)/i);
  assert.match(overlay, /标准模式[^\n]*不加载[^\n]*治理提示/);
  assert.match(overlay, /标准模式[^\n]*不新增[^\n]*PDGO 批准/);
  assert.match(overlay, /标准模式[^\n]*上级指令[^\n]*项目安全规则[^\n]*用户当次授权[^\n]*仍有效/);
  assert.match(overlay, /高保障模式[^\n]*\$bosscoding-secretary/);
  assert.match(overlay, /外部动作[^\n]*(?:明确|精确)[^\n]*(?:确认|批准)/);
  assert.doesNotMatch(overlay, /本次用人卡|实际贡献卡|runtime_tree|role_assignments|pdgo-codex-native-bridge/);
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

test("BossCoding shows a Chinese-first assignment card before formal work starts", async () => {
  const secretary = await readFile(
    path.join(root, "integrations", "codex-native", "skills", "bosscoding-secretary", "SKILL.md"),
    "utf8",
  );
  const integration = await readFile(
    path.join(root, "integrations", "codex-native", "skills", "bosscoding-secretary", "references", "integration.md"),
    "utf8",
  );
  const profile = JSON.parse(await readFile(path.join(root, "profiles", "bosscoding-codex-consumer.json"), "utf8"));

  for (const document of [secretary, integration]) {
    assert.match(document, /本次用人卡/);
    assert.match(document, /中文名（English exact host type）/);
    assert.match(document, /用途/);
    assert.match(document, /为何选中/);
    assert.match(document, /范围/);
    assert.match(document, /权限/);
  }
  assert.equal(profile.capability_awareness.startup_card.label, "本次用人卡");
  assert.equal(profile.capability_awareness.startup_card.display_timing, "before-formal-work-starts");
  assert.equal(profile.capability_awareness.startup_card.display_action, "show");
  assert.equal(profile.capability_awareness.startup_card.first_role_name_format, "中文名（English exact host type）");
  assert.equal(profile.capability_awareness.startup_card.later_role_name_format, "中文名");
  assert.deepEqual(profile.capability_awareness.startup_card.required_fields, ["用途", "为何选中", "范围", "权限"]);
});

test("BossCoding closes formal work with an honest contribution card for roles and lenses", async () => {
  const secretary = await readFile(
    path.join(root, "integrations", "codex-native", "skills", "bosscoding-secretary", "SKILL.md"),
    "utf8",
  );
  const integration = await readFile(
    path.join(root, "integrations", "codex-native", "skills", "bosscoding-secretary", "references", "integration.md"),
    "utf8",
  );
  const profile = JSON.parse(await readFile(path.join(root, "profiles", "bosscoding-codex-consumer.json"), "utf8"));

  for (const document of [secretary, integration]) {
    assert.match(document, /实际贡献卡/);
    assert.match(document, /角色[和与、]\s*Lens|角色和 Lens/);
    assert.match(document, /实际贡献/);
    assert.match(document, /没有实质价值/);
  }
  assert.equal(profile.capability_awareness.closeout_card.label, "实际贡献卡");
  assert.equal(profile.capability_awareness.closeout_card.display_timing, "formal-task-closeout");
  assert.equal(profile.capability_awareness.closeout_card.display_action, "show");
  assert.deepEqual(profile.capability_awareness.closeout_card.entry_types, ["角色", "Lens"]);
  assert.equal(profile.capability_awareness.closeout_card.no_material_value_statement, "没有实质价值");
});

test("capability explanations query three live sources in order without treating reference text as live state", async () => {
  const secretary = await readFile(
    path.join(root, "integrations", "codex-native", "skills", "bosscoding-secretary", "SKILL.md"),
    "utf8",
  );
  const integration = await readFile(
    path.join(root, "integrations", "codex-native", "skills", "bosscoding-secretary", "references", "integration.md"),
    "utf8",
  );
  const english = await readFile(path.join(root, "README.md"), "utf8");
  const chinese = await readFile(path.join(root, "README.zh-CN.md"), "utf8");
  const profile = JSON.parse(await readFile(path.join(root, "profiles", "bosscoding-codex-consumer.json"), "utf8"));

  for (const document of [secretary, chinese]) {
    assert.match(document, /能力图/);
    assert.match(document, /为什么选它/);
    assert.match(document, /当时[^。\n]*(?:实时)?可验证[^。\n]*(?:catalog|目录)/i);
    assert.match(document, /不硬编码[^。\n]*数量[^。\n]*完整名单/);
    assert.match(document, /不[^。\n]*内部 ID/);
    assert.match(document, /宿主[^。\n]*当前实际可用[^。\n]*角色/);
    assert.match(document, /当前已安装[^。\n]*可用[^。\n]*(?:Persona|人物)[^。\n]*Skill/i);
    assert.match(document, /manifest[^。\n]*哈希[^。\n]*外部 Agent/i);
    assert.match(document, /先查询相关来源[^。\n]*再回答/);
    assert.match(document, /README[^。\n]*缓存[^。\n]*记忆[^。\n]*静态摘录[^。\n]*不能[^。\n]*实时来源/i);
  }
  for (const document of [integration, english]) {
    assert.match(document, /能力图/);
    assert.match(document, /为什么选它/);
    assert.match(document, /catalog[^.\n]*verifiable at query time/i);
    assert.match(document, /does not hard-code[^.\n]*counts[^.\n]*complete (?:inventory|list)/i);
    assert.match(document, /does not[^.\n]*internal IDs/i);
    assert.match(document, /host[^.\n]*currently available[^.\n]*roles/i);
    assert.match(document, /currently installed[^.\n]*available[^.\n]*Persona[^.\n]*Skill/i);
    assert.match(document, /manifest[^.\n]*hash-verified[^.\n]*external Agent/i);
    assert.match(document, /quer(?:y|ies)[^.\n]*before answering/i);
    assert.match(document, /README[^.\n]*cache[^.\n]*memory[^.\n]*static excerpt[^.\n]*(?:not|never)[^.\n]*real-time source/i);
  }
  for (const readme of [english, chinese]) {
    assert.doesNotMatch(readme, /\b271\b|18 divisions|18 个分类/);
  }
  assert.deepEqual(profile.capability_awareness.capability_queries.names, ["能力图", "为什么选它"]);
  assert.equal(profile.capability_awareness.capability_queries.catalog_source, "current-verifiable-catalog");
  assert.deepEqual(profile.capability_awareness.capability_queries.source_order, [
    "host-current-actually-available-roles",
    "currently-installed-and-available-persona-or-skill",
    "manifest-hash-verified-external-agents",
  ]);
  assert.deepEqual(profile.capability_awareness.capability_queries.forbidden_realtime_sources, [
    "README",
    "cache",
    "memory",
    "static-excerpt",
  ]);
  assert.deepEqual(profile.capability_awareness.capability_queries.action_order, [
    "query-relevant-live-sources-in-source-order",
    "answer-from-current-query-results",
  ]);
  assert.equal(profile.capability_awareness.capability_queries.hardcoded_role_or_persona_counts, false);
  assert.equal(profile.capability_awareness.capability_queries.hardcoded_complete_role_or_persona_lists, false);
  assert.equal(profile.capability_awareness.capability_queries.expose_internal_ids, false);
});

test("capability learning persists only proven reusable value into existing knowledge notes", async () => {
  const secretary = await readFile(
    path.join(root, "integrations", "codex-native", "skills", "bosscoding-secretary", "SKILL.md"),
    "utf8",
  );
  const integration = await readFile(
    path.join(root, "integrations", "codex-native", "skills", "bosscoding-secretary", "references", "integration.md"),
    "utf8",
  );
  const english = await readFile(path.join(root, "README.md"), "utf8");
  const chinese = await readFile(path.join(root, "README.zh-CN.md"), "utf8");
  const profile = JSON.parse(await readFile(path.join(root, "profiles", "bosscoding-codex-consumer.json"), "utf8"));

  for (const document of [secretary, chinese]) {
    assert.match(document, /本轮[^。\n]*证据[^。\n]*有效/);
    assert.match(document, /跨任务复用/);
    assert.match(document, /优先更新[^。\n]*既有[^。\n]*知识笔记/);
    assert.match(document, /不(?:新建|创建)[^。\n]*空目录[^。\n]*静态能力目录/);
  }
  for (const document of [integration, english]) {
    assert.match(document, /evidence from the current run[^.\n]*effective/i);
    assert.match(document, /reusable across tasks/i);
    assert.match(document, /prefer updating an existing knowledge note/i);
    assert.match(document, /do not create empty directories or static capability directories/i);
  }
  assert.deepEqual(profile.capability_awareness.persistence.required_conditions, [
    "current-run-evidence-proves-effective",
    "reusable-across-tasks",
  ]);
  assert.equal(profile.capability_awareness.persistence.preferred_target, "existing-knowledge-note");
  assert.equal(profile.capability_awareness.persistence.empty_directory_forbidden, true);
  assert.equal(profile.capability_awareness.persistence.static_capability_directory_forbidden, true);
});

test("Persona lenses cannot become sources of facts", async () => {
  const secretary = await readFile(
    path.join(root, "integrations", "codex-native", "skills", "bosscoding-secretary", "SKILL.md"),
    "utf8",
  );
  const integration = await readFile(
    path.join(root, "integrations", "codex-native", "skills", "bosscoding-secretary", "references", "integration.md"),
    "utf8",
  );
  const profile = JSON.parse(await readFile(path.join(root, "profiles", "bosscoding-codex-consumer.json"), "utf8"));

  for (const document of [secretary]) {
    assert.match(document, /人物 Skill[^。\n]*不能作为[^。\n]*事实[^。\n]*来源/);
  }
  assert.match(integration, /cannot supply[^.\n]*facts/i);
  assert.equal(profile.method_lenses.fact_source, false);
});

test("three-mode routing defers full BossCoding governance until high assurance", async () => {
  const secretary = await readFile(
    path.join(root, "integrations", "codex-native", "skills", "bosscoding-secretary", "SKILL.md"),
    "utf8",
  );
  const integration = await readFile(
    path.join(root, "integrations", "codex-native", "skills", "bosscoding-secretary", "references", "integration.md"),
    "utf8",
  );
  const profile = JSON.parse(await readFile(path.join(root, "profiles", "bosscoding-codex-consumer.json"), "utf8"));

  assert.match(secretary, /高保障模式[^。\n]*(?:显式|明确)[^。\n]*(?:秘书|BossCoding)/);
  assert.match(secretary, /轻量模式[^。\n]*标准模式[^。\n]*不触发/);
  assert.match(integration, /loaded only for high-assurance mode or an explicit [^.\n]*(?:secretary|BossCoding)[^.\n]*entry/i);
  assert.deepEqual(profile.routing.modes, ["lightweight", "standard", "high_assurance"]);
  assert.equal(profile.routing.route_before_mode_side_effects, true);
  assert.deepEqual(profile.routing.lightweight.required_zero_costs, [
    "extra_model_calls",
    "subagents",
    "state_writes",
    "pdgo_new_approval_rounds",
    "formal_plan_generations",
    "governance_prompt_loads",
    "role_process_loads",
  ]);
  assert.equal(profile.routing.standard.execution, "current-agent-with-proportionate-self-check");
  assert.deepEqual(profile.routing.standard.required_zero_costs, [
    "extra_model_calls",
    "subagents",
    "state_writes",
    "pdgo_new_approval_rounds",
    "formal_plan_generations",
    "governance_prompt_loads",
    "role_process_loads",
  ]);
  assert.equal(profile.routing.high_assurance.full_secretary_governance, true);
  assert.equal(profile.cold_start.scope, "high-assurance-or-explicit-secretary");
  assert.equal(profile.cold_start.lightweight_and_standard_load_secretary, false);
  assert.deepEqual(profile.benchmark.arms, [
    "native_codex",
    "fixed_superpowers",
    "full_pdgo",
    "routed_pdgo",
  ]);
});

test("Codex-native contracts describe risk-first bounded permission routing and trusted authorization reuse", async () => {
  const schemaNames = ["plan.yaml", "user-plan-approval.yaml", "dispatch.yaml", "execution-report.yaml", "review-decision.yaml"];
  const schemas = await Promise.all(schemaNames.map((name) => readFile(path.join(root, "schemas", name), "utf8")));
  for (const [index, schema] of schemas.entries()) {
    assert.match(schema, /authorization_envelope:/, schemaNames[index]);
    assert.match(schema, /boundary_digest:/, schemaNames[index]);
    assert.match(schema, /expires_at:/, schemaNames[index]);
  }
  assert.match(schemas[0], /authorization_policy:/);
  assert.match(schemas[0], /attestation_source:\s*host-transport/);
  assert.match(schemas[0], /fail_closed:\s*true/);

  const overlay = await readFile(path.join(root, "integrations", "codex-native", "global-agents-overlay.md"), "utf8");
  const secretary = await readFile(path.join(root, "integrations", "codex-native", "skills", "bosscoding-secretary", "SKILL.md"), "utf8");
  const bridge = await readFile(path.join(root, "integrations", "codex-native", "skills", "pdgo-codex-native-bridge", "SKILL.md"), "utf8");
  const dispatchRuntime = await readFile(path.join(root, "docs", "dispatch-runtime.md"), "utf8");
  const profile = JSON.parse(await readFile(path.join(root, "profiles", "bosscoding-codex-consumer.json"), "utf8"));

  for (const document of [overlay, secretary]) {
    assert.match(document, /单一应用|单应用/);
    assert.match(document, /当前会话/);
    assert.match(document, /可撤销/);
    assert.match(document, /账号|账户/);
    assert.match(document, /网络/);
    assert.match(document, /密钥|秘密/);
    assert.match(document, /通配/);
    assert.match(document, /第三方/);
  }
  for (const document of [secretary, bridge, dispatchRuntime]) {
    assert.match(document, /authorization envelope|授权包络|授权信封/i);
    assert.match(document, /(?:宿主|host)[^。\n]*(?:transport|adapter|传输|适配器)/i);
    assert.match(document, /自报|self-report/i);
    assert.match(document, /(?:同一|same)[^。\n]*(?:摘要|digest)/i);
  }
  assert.deepEqual(profile.routing.bounded_permission_exception, {
    applications: "exactly-one",
    location: "local",
    duration: "current-session",
    reversible: true,
    explicit_current_request: true,
    forbidden_risks: ["administrator", "account", "network", "secrets", "wildcard", "third_party", "long_lived", "irreversible"],
    mode: "standard",
  });
  assert.equal(profile.authorization.policy_optional, true);
  assert.equal(profile.authorization.attestation_source, "injected-host-transport-or-adapter");
  assert.equal(profile.authorization.self_report_trusted, false);
  assert.equal(profile.authorization.legacy_without_policy_supported, true);
});

test("status documents report capability-awareness validation without claiming acceptance", async () => {
  const status = await readFile(path.join(root, "STATUS.md"), "utf8");
  const progress = await readFile(path.join(root, "PROGRESS.md"), "utf8");
  const currentAction = status.match(/## Current action\r?\n([\s\S]*)$/)?.[1] ?? "";
  const statusSliceCount = status.match(/(\w+) targeted red\/green(?: capability)? contract slices pass/i)?.[1];
  const progressSliceCount = progress.match(/through (\w+) targeted red\/green slices/i)?.[1];

  for (const document of [status, progress]) {
    assert.match(document, /BOSSCODING-CAPABILITY-AWARENESS-20260809-v2/);
    assert.match(document, /本次用人卡/);
    assert.match(document, /实际贡献卡/);
    assert.match(document, /full[\s\S]{0,120}validation[\s\S]{0,120}pass/i);
  }
  assert.equal(statusSliceCount?.toLowerCase(), "six");
  assert.equal(progressSliceCount?.toLowerCase(), statusSliceCount?.toLowerCase());
  assert.doesNotMatch(currentAction, /no implementation action remains/i);
  assert.match(currentAction, /targeted[^.\n]*pass/i);
  assert.match(currentAction, /no acceptance is claimed/i);
});
