import test from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  access,
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const canonicalTempBase = await realpath(os.tmpdir());
const resolverSource = path.join(
  repoRoot,
  "integrations",
  "codex-native",
  "skills",
  "pdgo-codex-native-bridge",
  "scripts",
  "resolve-cold-start.mjs",
);
const installerSource = path.join(repoRoot, "scripts", "install-codex-native.mjs");
const dispatcherSource = path.join(repoRoot, "scripts", "flowstate-dispatcher.mjs");
const repositoryManifest = JSON.parse(await readFile(path.join(repoRoot, "integrations", "codex-native", "manifest.json"), "utf8"));
const REQUIRED_RUNTIME_PATHS = repositoryManifest.runtime_tree.paths;

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function fileSha256(filePath) {
  return sha256(await readFile(filePath));
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function runNode(script, args, cwd = repoRoot, env = {}) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd,
    encoding: "utf8",
    windowsHide: true,
    env: { ...process.env, ...env },
  });
}

function startNode(script, args, cwd = repoRoot, env = {}) {
  const child = spawn(process.execPath, [script, ...args], {
    cwd,
    windowsHide: true,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  return {
    child,
    result: new Promise((resolve) => child.once("close", (status) => resolve({ status, stdout, stderr }))),
  };
}

async function waitForPath(target, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await exists(target)) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`timed out waiting for ${target}`);
}

async function waitForTransactionMarker(codexHome, marker, timeoutMs = 5000) {
  const parent = path.join(codexHome, ".bosscoding-install");
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await exists(parent)) {
      for (const entry of await readdir(parent)) {
        const candidate = path.join(parent, entry, marker);
        if (await exists(candidate)) return candidate;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`timed out waiting for transaction marker ${marker}`);
}

function expectSuccess(result) {
  assert.equal(result.status, 0, `stderr:\n${result.stderr}\nstdout:\n${result.stdout}`);
  return JSON.parse(result.stdout);
}

async function makeRuntimeFixture(parent, directoryName = "runtime-source") {
  const runtimeRoot = path.join(parent, directoryName);
  const manifestPath = path.join(runtimeRoot, "integrations", "codex-native", "manifest.json");
  const dispatcherPath = path.join(runtimeRoot, "scripts", "flowstate-dispatcher.mjs");
  const dispatcherLibraryPath = path.join(runtimeRoot, "scripts", "lib", "flowstate-dispatcher.mjs");
  const adapterLibraryPath = path.join(runtimeRoot, "scripts", "lib", "external-agent-adapter.mjs");
  const agentIndexPath = path.join(runtimeRoot, "integrations", "external-agents", "agency-agents", "index.json");
  const metadataIndexPath = path.join(runtimeRoot, "integrations", "external-agents", "agency-agents", "metadata-index.json");
  const promptsRoot = path.join(runtimeRoot, "integrations", "external-agents", "agency-agents", "prompts");
  const resolverRuntimePath = path.join(runtimeRoot, "integrations", "codex-native", "skills", "pdgo-codex-native-bridge", "scripts", "resolve-cold-start.mjs");
  await mkdir(path.dirname(manifestPath), { recursive: true });
  await mkdir(path.dirname(dispatcherLibraryPath), { recursive: true });
  await mkdir(promptsRoot, { recursive: true });
  await mkdir(path.dirname(resolverRuntimePath), { recursive: true });
  await writeFile(manifestPath, `${JSON.stringify({
    schema_version: "1.1",
    integration_id: "pdgo-codex-native",
    dispatcher: "scripts/flowstate-dispatcher.mjs",
    runtime_tree: { algorithm: "sha256-tree-v1", paths: REQUIRED_RUNTIME_PATHS },
    external_agent_catalog: {
      root: "integrations/external-agents/agency-agents",
      index: "integrations/external-agents/agency-agents/index.json",
      metadata_index: "integrations/external-agents/agency-agents/metadata-index.json",
      prompts: "integrations/external-agents/agency-agents/prompts",
    },
  }, null, 2)}\n`, "utf8");
  await writeFile(dispatcherPath, "export const fixtureDispatcher = true;\n", "utf8");
  await writeFile(dispatcherLibraryPath, "export const fixtureLibrary = true;\n", "utf8");
  await writeFile(adapterLibraryPath, "export const fixtureAdapter = true;\n", "utf8");
  await writeFile(agentIndexPath, `${JSON.stringify({ agents: [] }, null, 2)}\n`, "utf8");
  await writeFile(metadataIndexPath, `${JSON.stringify({ agents: [] }, null, 2)}\n`, "utf8");
  await writeFile(path.join(promptsRoot, "fixture.md"), "# Fixture\n", "utf8");
  await writeFile(resolverRuntimePath, "export const fixtureResolver = true;\n", "utf8");
  return {
    runtimeRoot,
    manifestPath,
    dispatcherPath,
    dispatcherLibraryPath,
    adapterLibraryPath,
    agentIndexPath,
    metadataIndexPath,
    promptsRoot,
    resolverRuntimePath,
  };
}

async function runtimeTreeDigest(runtimeRoot) {
  const records = [];
  async function visit(relativePath) {
    const absolute = path.join(runtimeRoot, relativePath);
    const info = await lstat(absolute);
    assert.equal(info.isSymbolicLink(), false, `test fixture cannot hash a link: ${relativePath}`);
    if (info.isFile()) {
      records.push(`file:${relativePath.replaceAll("\\", "/")}:${await fileSha256(absolute)}`);
      return;
    }
    assert.equal(info.isDirectory(), true, `test fixture must contain only files/directories: ${relativePath}`);
    records.push(`dir:${relativePath.replaceAll("\\", "/")}`);
    for (const entry of (await readdir(absolute)).sort()) await visit(path.join(relativePath, entry));
  }
  for (const relativePath of REQUIRED_RUNTIME_PATHS) await visit(relativePath);
  return sha256(records.join("\n"));
}

async function installResolverFixture(codexHome) {
  const target = path.join(
    codexHome,
    "skills",
    "pdgo-codex-native-bridge",
    "scripts",
    "resolve-cold-start.mjs",
  );
  await mkdir(path.dirname(target), { recursive: true });
  await cp(resolverSource, target);
  return target;
}

async function writeRuntimeDescriptor(codexHome, fixture, overrides = {}) {
  const configPath = path.join(codexHome, "runtime", "bosscoding", "runtime.json");
  const descriptor = {
    schema_version: "1.1",
    integration_id: "pdgo-codex-native",
    runtime_root: fixture.runtimeRoot,
    manifest: {
      path: "integrations/codex-native/manifest.json",
      sha256: await fileSha256(fixture.manifestPath),
    },
    dispatcher: {
      path: "scripts/flowstate-dispatcher.mjs",
      sha256: await fileSha256(fixture.dispatcherPath),
    },
    runtime_tree: {
      algorithm: "sha256-tree-v1",
      paths: REQUIRED_RUNTIME_PATHS,
      sha256: await runtimeTreeDigest(fixture.runtimeRoot),
    },
    ...overrides,
  };
  await mkdir(path.dirname(configPath), { recursive: true });
  await writeFile(configPath, `${JSON.stringify(descriptor, null, 2)}\n`, "utf8");
  return configPath;
}

async function expectedStateRoot(codexHome, projectRoot) {
  const canonical = await realpath(projectRoot);
  const hashInput = process.platform === "win32" ? path.normalize(canonical).toLowerCase() : path.normalize(canonical);
  const basename = path.basename(canonical).normalize("NFKC").replace(/[^\p{L}\p{N}._-]+/gu, "-").replace(/^-+|-+$/g, "") || "project";
  return path.join(codexHome, "state", "bosscoding", "projects", `${basename.slice(0, 48)}-${sha256(hashInput).slice(0, 16)}`);
}

async function makeInstallerSource(tempRoot, overlay = "## BossCoding 默认协作方式\n\n- 新规则。\n") {
  const sourceRoot = path.join(tempRoot, "source");
  const sourceInstaller = path.join(sourceRoot, "scripts", "install-codex-native.mjs");
  await mkdir(path.dirname(sourceInstaller), { recursive: true });
  await cp(installerSource, sourceInstaller);

  const fixture = await makeRuntimeFixture(tempRoot, "source");
  assert.equal(fixture.runtimeRoot, sourceRoot, "runtime fixture and installer source must share one root");
  const manifestPath = path.join(sourceRoot, "integrations", "codex-native", "manifest.json");
  await writeFile(manifestPath, `${JSON.stringify({
    schema_version: "1.1",
    integration_id: "pdgo-codex-native",
    skills: ["bosscoding-secretary", "pdgo-codex-native-bridge"],
    dispatcher: "scripts/flowstate-dispatcher.mjs",
    runtime_tree: { algorithm: "sha256-tree-v1", paths: REQUIRED_RUNTIME_PATHS },
    external_agent_catalog: {
      root: "integrations/external-agents/agency-agents",
      index: "integrations/external-agents/agency-agents/index.json",
      metadata_index: "integrations/external-agents/agency-agents/metadata-index.json",
      prompts: "integrations/external-agents/agency-agents/prompts",
    },
  }, null, 2)}\n`, "utf8");
  const overlayPath = path.join(sourceRoot, "integrations", "codex-native", "global-agents-overlay.md");
  await writeFile(overlayPath, overlay, "utf8");
  for (const skill of ["bosscoding-secretary", "pdgo-codex-native-bridge"]) {
    const skillRoot = path.join(sourceRoot, "integrations", "codex-native", "skills", skill);
    await mkdir(skillRoot, { recursive: true });
    await writeFile(path.join(skillRoot, "SKILL.md"), `---\nname: ${skill}\n---\n`, "utf8");
  }
  return { sourceRoot, sourceInstaller, manifestPath, ...fixture };
}

test("cold-start inspect resolves from the installed Skill and performs zero state writes", async (t) => {
  const tempRoot = await mkdtemp(path.join(canonicalTempBase, "pdgo-cold-inspect-"));
  t.after(() => rm(tempRoot, { recursive: true, force: true }));
  const codexHome = path.join(tempRoot, "codex-home");
  const projectRoot = path.join(tempRoot, "Unrelated 项目");
  await mkdir(projectRoot, { recursive: true });
  const fixture = await makeRuntimeFixture(tempRoot);
  const resolver = await installResolverFixture(codexHome);
  const configPath = await writeRuntimeDescriptor(codexHome, fixture);

  const output = expectSuccess(runNode(resolver, ["--action", "inspect", "--project", projectRoot], projectRoot));
  const expected = await expectedStateRoot(codexHome, projectRoot);

  assert.equal(output.ok, true);
  assert.equal(output.action, "inspect");
  assert.equal(output.config_path, configPath);
  assert.equal(output.runtime_root, await realpath(fixture.runtimeRoot));
  assert.equal(output.state_root, expected);
  assert.equal(output.state_exists, false);
  assert.equal(output.requires_creation, true);
  assert.equal(await exists(expected), false, "inspect must not create the generated-state directory");
});

test("cold-start ensure requires the exact inspected state root and is idempotent", async (t) => {
  const tempRoot = await mkdtemp(path.join(canonicalTempBase, "pdgo-cold-ensure-"));
  t.after(() => rm(tempRoot, { recursive: true, force: true }));
  const codexHome = path.join(tempRoot, "codex-home");
  const projectRoot = path.join(tempRoot, "Project A");
  await mkdir(projectRoot, { recursive: true });
  const fixture = await makeRuntimeFixture(tempRoot);
  const resolver = await installResolverFixture(codexHome);
  const configPath = await writeRuntimeDescriptor(codexHome, fixture);
  const expected = await expectedStateRoot(codexHome, projectRoot);

  const missing = runNode(resolver, ["--action", "ensure", "--project", projectRoot, "--config", configPath], projectRoot);
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /expected-state-root is required/i);
  assert.equal(await exists(expected), false);

  const mismatch = runNode(resolver, [
    "--action", "ensure",
    "--project", projectRoot,
    "--config", configPath,
    "--expected-state-root", path.join(tempRoot, "wrong"),
  ], projectRoot);
  assert.notEqual(mismatch.status, 0);
  assert.match(mismatch.stderr, /does not match the inspected state root/i);
  assert.equal(await exists(expected), false);

  const created = expectSuccess(runNode(resolver, [
    "--action", "ensure",
    "--project", projectRoot,
    "--config", configPath,
    "--expected-state-root", expected,
  ], projectRoot));
  assert.equal(created.created, true);
  assert.equal(await exists(expected), true);

  const repeated = expectSuccess(runNode(resolver, [
    "--action", "ensure",
    "--project", projectRoot,
    "--config", configPath,
    "--expected-state-root", expected,
  ], projectRoot));
  assert.equal(repeated.created, false);
  assert.equal(repeated.state_exists, true);
});

test("BossCoding verified invoke recomputes the state root and rejects runtime catalog overrides", async (t) => {
  const tempRoot = await mkdtemp(path.join(canonicalTempBase, "pdgo-cold-verified-invoke-"));
  t.after(() => rm(tempRoot, { recursive: true, force: true }));
  const codexHome = path.join(tempRoot, "codex-home");
  const projectRoot = path.join(tempRoot, "Verified Project");
  await mkdir(projectRoot, { recursive: true });
  const fixture = await makeRuntimeFixture(tempRoot);
  await writeFile(fixture.dispatcherPath, `console.log(JSON.stringify({
    args: process.argv.slice(2),
    verifiedInvoke: process.env.BOSSCODING_VERIFIED_INVOKE,
    parentMatches: Number(process.env.BOSSCODING_VERIFIED_PARENT_PID) === process.ppid,
    stateRoot: process.env.BOSSCODING_VERIFIED_STATE_ROOT,
    projectKey: process.env.BOSSCODING_VERIFIED_PROJECT_KEY,
    runtimeRoot: process.env.BOSSCODING_VERIFIED_RUNTIME_ROOT,
  }));\n`, "utf8");
  const resolver = await installResolverFixture(codexHome);
  const configPath = await writeRuntimeDescriptor(codexHome, fixture);
  const stateRoot = await expectedStateRoot(codexHome, projectRoot);

  expectSuccess(runNode(resolver, [
    "--action", "ensure",
    "--project", projectRoot,
    "--config", configPath,
    "--expected-state-root", stateRoot,
  ], projectRoot));

  const invoked = runNode(resolver, [
    "--action", "invoke",
    "--project", projectRoot,
    "--config", configPath,
    "--dispatcher-action", "resume",
    "--external-agents", "false",
  ], tempRoot);
  assert.equal(invoked.status, 0, invoked.stderr);
  const forwarded = JSON.parse(invoked.stdout);
  const rootIndex = forwarded.args.indexOf("--root");
  const projectIndex = forwarded.args.indexOf("--project");
  assert.equal(path.normalize(forwarded.args[rootIndex + 1]), path.normalize(stateRoot));
  assert.match(forwarded.args[projectIndex + 1], /^Verified-Project-[a-f0-9]{16}$/);
  assert.equal(forwarded.args.includes("--interface"), false);
  assert.equal(forwarded.verifiedInvoke, "1");
  assert.equal(forwarded.parentMatches, true);
  assert.equal(path.normalize(forwarded.stateRoot), path.normalize(stateRoot));
  assert.equal(forwarded.projectKey, forwarded.args[projectIndex + 1]);
  assert.equal(path.normalize(forwarded.runtimeRoot), path.normalize(fixture.runtimeRoot));

  for (const forbidden of ["--root", "--external-index", "--external-root", "--legacy-cwd-defaults"]) {
    const rejected = runNode(resolver, [
      "--action", "invoke",
      "--project", projectRoot,
      "--config", configPath,
      "--dispatcher-action", "resume",
      forbidden, path.join(tempRoot, "outside"),
    ], tempRoot);
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /verified invoke.*forbid|unsupported verified invoke option/i);
  }
});

test("cold-start resolver fails closed on descriptor path and SHA-256 drift", async (t) => {
  const tempRoot = await mkdtemp(path.join(canonicalTempBase, "pdgo-cold-integrity-"));
  t.after(() => rm(tempRoot, { recursive: true, force: true }));
  const codexHome = path.join(tempRoot, "codex-home");
  const projectRoot = path.join(tempRoot, "Project B");
  await mkdir(projectRoot, { recursive: true });
  const fixture = await makeRuntimeFixture(tempRoot);
  const resolver = await installResolverFixture(codexHome);
  const configPath = await writeRuntimeDescriptor(codexHome, fixture);

  await writeFile(fixture.dispatcherPath, "export const fixtureDispatcher = false;\n", "utf8");
  const drift = runNode(resolver, ["--action", "inspect", "--project", projectRoot, "--config", configPath], projectRoot);
  assert.notEqual(drift.status, 0);
  assert.match(drift.stderr, /dispatcher SHA-256 mismatch/i);

  await writeRuntimeDescriptor(codexHome, fixture, {
    manifest: { path: "../outside.json", sha256: "0".repeat(64) },
  });
  const escape = runNode(resolver, ["--action", "inspect", "--project", projectRoot, "--config", configPath], projectRoot);
  assert.notEqual(escape.status, 0);
  assert.match(escape.stderr, /manifest\.path must stay within runtime_root/i);
});

test("cold-start resolver rejects drift in imported dispatcher libraries and the Agency prompt tree", async (t) => {
  const tempRoot = await mkdtemp(path.join(canonicalTempBase, "pdgo-cold-tree-integrity-"));
  t.after(() => rm(tempRoot, { recursive: true, force: true }));
  const codexHome = path.join(tempRoot, "codex-home");
  const projectRoot = path.join(tempRoot, "Project tree");
  await mkdir(projectRoot, { recursive: true });
  const fixture = await makeRuntimeFixture(tempRoot);
  const resolver = await installResolverFixture(codexHome);
  const configPath = await writeRuntimeDescriptor(codexHome, fixture);

  await writeFile(fixture.dispatcherLibraryPath, "export const fixtureLibrary = false;\n", "utf8");
  const libraryDrift = runNode(resolver, ["--action", "inspect", "--project", projectRoot, "--config", configPath], projectRoot);
  assert.notEqual(libraryDrift.status, 0);
  assert.match(libraryDrift.stderr, /runtime_tree SHA-256 mismatch/i);

  await writeFile(fixture.dispatcherLibraryPath, "export const fixtureLibrary = true;\n", "utf8");
  await writeFile(path.join(fixture.promptsRoot, "fixture.md"), "# Changed fixture\n", "utf8");
  const promptDrift = runNode(resolver, ["--action", "inspect", "--project", projectRoot, "--config", configPath], projectRoot);
  assert.notEqual(promptDrift.status, 0);
  assert.match(promptDrift.stderr, /runtime_tree SHA-256 mismatch/i);

  await writeFile(path.join(fixture.promptsRoot, "fixture.md"), "# Fixture\n", "utf8");
  await writeRuntimeDescriptor(codexHome, fixture);
  await writeFile(fixture.metadataIndexPath, `${JSON.stringify({ agents: [{ agent_id: "changed", auto_route: true }] })}\n`, "utf8");
  const metadataDrift = runNode(resolver, ["--action", "inspect", "--project", projectRoot, "--config", configPath], projectRoot);
  assert.notEqual(metadataDrift.status, 0);
  assert.match(metadataDrift.stderr, /runtime_tree SHA-256 mismatch/i);
});

test("cold-start resolver rejects a project path that is itself a symlink, junction, or non-canonical alias", async (t) => {
  const tempRoot = await mkdtemp(path.join(canonicalTempBase, "pdgo-cold-project-link-"));
  t.after(() => rm(tempRoot, { recursive: true, force: true }));
  const codexHome = path.join(tempRoot, "codex-home");
  const projectRoot = path.join(tempRoot, "real-project");
  const projectAlias = path.join(tempRoot, "project-alias");
  await mkdir(projectRoot, { recursive: true });
  await symlink(projectRoot, projectAlias, process.platform === "win32" ? "junction" : "dir");
  const fixture = await makeRuntimeFixture(tempRoot);
  const resolver = await installResolverFixture(codexHome);
  const configPath = await writeRuntimeDescriptor(codexHome, fixture);

  const rejected = runNode(resolver, ["--action", "inspect", "--project", projectAlias, "--config", configPath], tempRoot);
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /project cannot (?:use|traverse).*(?:symbolic link|junction|reparse|non-canonical)/i);
});

test("dispatcher finds the bundled external Agent catalog from an unrelated cwd without moving legacy state", async (t) => {
  const unrelated = await mkdtemp(path.join(canonicalTempBase, "pdgo-dispatch-unrelated-"));
  t.after(() => rm(unrelated, { recursive: true, force: true }));

  const output = expectSuccess(runNode(dispatcherSource, [
    "--action", "search-agents",
    "--query", "Project Shepherd",
    "--limit", "1",
  ], unrelated));

  assert.match(JSON.stringify(output), /Project Shepherd/);
  assert.equal(await exists(path.join(unrelated, ".flowstate")), false);
});

test("installer refuses the known unmanaged absolute write-approval rule before changing any target", async (t) => {
  const tempRoot = await mkdtemp(path.join(canonicalTempBase, "pdgo-install-policy-conflict-"));
  t.after(() => rm(tempRoot, { recursive: true, force: true }));
  const codexHome = path.join(tempRoot, "codex-home");
  const fixture = await makeInstallerSource(tempRoot);
  const secretaryTarget = path.join(codexHome, "skills", "bosscoding-secretary");
  const bridgeTarget = path.join(codexHome, "skills", "pdgo-codex-native-bridge");
  const agentsPath = path.join(codexHome, "AGENTS.md");
  const conflictingAgents = [
    "# User policy",
    "",
    "每个新任务默认只读。",
    "任何文件",
    "写入 （包括临时文件和会产生文件的验证命令）、",
    "子 Agent ／ 新对话、Git 分支 ／ 暂存 ／ 提交 ／ 合并，",
    "以及系统或外部状态变更，",
    "都要先展示精确批次、影响和验证方式并取得批准。",
    "",
  ].join("\r\n");
  await mkdir(secretaryTarget, { recursive: true });
  await writeFile(path.join(secretaryTarget, "old.txt"), "old-secretary", "utf8");
  await writeFile(agentsPath, conflictingAgents, "utf8");

  const installing = startNode(fixture.sourceInstaller, ["--codex-home", codexHome], tempRoot, {
    BOSSCODING_INSTALL_TESTING: "1",
    BOSSCODING_INSTALL_HOLD_AFTER_LOCK_MS: "1200",
  });
  const lockObserved = waitForPath(path.join(codexHome, ".bosscoding-install.lock", "owner.json"), 800)
    .then(() => true, () => false);
  const failed = await installing.result;
  assert.notEqual(failed.status, 0);
  assert.match(failed.stderr, /known legacy absolute write-approval rule.*unmanaged global AGENTS/i);
  assert.equal(await lockObserved, false, "policy conflict must fail before the installation lock ever appears");
  assert.equal(await readFile(agentsPath, "utf8"), conflictingAgents);
  assert.equal(await readFile(path.join(secretaryTarget, "old.txt"), "utf8"), "old-secretary");
  assert.equal(await exists(bridgeTarget), false);
  assert.equal(await exists(path.join(codexHome, "runtime", "bosscoding", "runtime.json")), false);

  const managedHome = path.join(tempRoot, "managed-home");
  const managedAgentsPath = path.join(managedHome, "AGENTS.md");
  await mkdir(managedHome, { recursive: true });
  await writeFile(managedAgentsPath, [
    "# User policy",
    "",
    "keep-before",
    "",
    "<!-- BEGIN BOSSCODING-PDGO OVERLAY -->",
    conflictingAgents,
    "<!-- END BOSSCODING-PDGO OVERLAY -->",
    "",
    "keep-after",
    "",
  ].join("\n"), "utf8");
  expectSuccess(runNode(fixture.sourceInstaller, ["--codex-home", managedHome], tempRoot));
  const managedAfter = await readFile(managedAgentsPath, "utf8");
  assert.match(managedAfter, /keep-before/);
  assert.match(managedAfter, /keep-after/);
  assert.doesNotMatch(managedAfter, /任何文件写入/);
});

test("Codex-native installer preserves legacy BossCoding text, installs one managed block, and emits descriptor 1.1", async (t) => {
  const tempRoot = await mkdtemp(path.join(canonicalTempBase, "pdgo-install-native-"));
  t.after(() => rm(tempRoot, { recursive: true, force: true }));
  const codexHome = path.join(tempRoot, "codex-home");
  const fixture = await makeInstallerSource(tempRoot);

  await mkdir(codexHome, { recursive: true });
  const agentsPath = path.join(codexHome, "AGENTS.md");
  const legacyAgents = "# User policy\n\nkeep-before\n\n## BossCoding 默认协作方式\n\n- 旧规则。\n- 自定义保留。\n\n## Tail\n\nkeep-after\n";
  await writeFile(agentsPath, legacyAgents, "utf8");

  const first = expectSuccess(runNode(fixture.sourceInstaller, ["--codex-home", codexHome], tempRoot));
  assert.deepEqual(first.installed_skills, ["bosscoding-secretary", "pdgo-codex-native-bridge"]);
  const agentsAfterFirst = await readFile(agentsPath, "utf8");
  assert.match(agentsAfterFirst, /keep-before/);
  assert.match(agentsAfterFirst, /keep-after/);
  assert.match(agentsAfterFirst, /<!-- BEGIN BOSSCODING-PDGO OVERLAY -->/);
  assert.match(agentsAfterFirst, /- 新规则。/);
  assert.match(agentsAfterFirst, /- 旧规则。\n- 自定义保留。/);
  assert.equal((agentsAfterFirst.match(/BEGIN BOSSCODING-PDGO OVERLAY/g) ?? []).length, 1);
  const stripped = agentsAfterFirst.replace(/\n\n<!-- BEGIN BOSSCODING-PDGO OVERLAY -->[\s\S]*?<!-- END BOSSCODING-PDGO OVERLAY -->\n\n/, "\n\n");
  assert.equal(stripped, legacyAgents, "removing the managed block must recover the legacy file byte-for-byte");

  const descriptorPath = path.join(codexHome, "runtime", "bosscoding", "runtime.json");
  const descriptor = JSON.parse(await readFile(descriptorPath, "utf8"));
  assert.equal(descriptor.schema_version, "1.1");
  assert.equal(descriptor.integration_id, "pdgo-codex-native");
  assert.equal(descriptor.runtime_root, await realpath(fixture.sourceRoot));
  assert.equal(descriptor.manifest.path, "integrations/codex-native/manifest.json");
  assert.equal(descriptor.manifest.sha256, await fileSha256(fixture.manifestPath));
  assert.equal(descriptor.dispatcher.path, "scripts/flowstate-dispatcher.mjs");
  assert.equal(descriptor.dispatcher.sha256, await fileSha256(fixture.dispatcherPath));
  assert.deepEqual(descriptor.runtime_tree.paths, REQUIRED_RUNTIME_PATHS);
  assert.equal(descriptor.runtime_tree.sha256, await runtimeTreeDigest(fixture.sourceRoot));

  const stalePath = path.join(codexHome, "skills", "bosscoding-secretary", "stale.txt");
  await writeFile(stalePath, "stale", "utf8");
  const second = expectSuccess(runNode(fixture.sourceInstaller, ["--codex-home", codexHome], tempRoot));
  assert.equal(second.changed, true, "removing a stale installed file is a real reported change");
  assert.equal(await exists(stalePath), false, "the installed Skill tree must exactly mirror its source");
  assert.equal(await readFile(agentsPath, "utf8"), agentsAfterFirst);
  assert.equal((agentsAfterFirst.match(/BEGIN BOSSCODING-PDGO OVERLAY/g) ?? []).length, 1);

  const third = expectSuccess(runNode(fixture.sourceInstaller, ["--codex-home", codexHome], tempRoot));
  assert.equal(third.changed, false, "a clean repeat installation must perform no writes");
});

test("overlay insertion preserves legacy sections before either a level-one or level-two next heading", async (t) => {
  for (const nextHeading of ["# Next policy", "## Next policy"]) {
    const tempRoot = await mkdtemp(path.join(canonicalTempBase, "pdgo-overlay-preserve-"));
    t.after(() => rm(tempRoot, { recursive: true, force: true }));
    const fixture = await makeInstallerSource(tempRoot);
    const codexHome = path.join(tempRoot, "codex-home");
    await mkdir(codexHome, { recursive: true });
    const agentsPath = path.join(codexHome, "AGENTS.md");
    const before = `# Prefix\n\n## BossCoding 默认协作方式\n\n- legacy one\n- custom two\n\n### Nested note\n\nkeep nested\n\n${nextHeading}\n\nkeep tail\n`;
    await writeFile(agentsPath, before, "utf8");

    expectSuccess(runNode(fixture.sourceInstaller, ["--codex-home", codexHome], tempRoot));
    const after = await readFile(agentsPath, "utf8");
    const stripped = after.replace(/\n\n<!-- BEGIN BOSSCODING-PDGO OVERLAY -->[\s\S]*?<!-- END BOSSCODING-PDGO OVERLAY -->\n\n/, "\n\n");
    assert.equal(stripped, before);
    assert.ok(after.indexOf("<!-- BEGIN BOSSCODING-PDGO OVERLAY -->") < after.indexOf(nextHeading));
  }
});

test("installer preflight failure mutates no existing target", async (t) => {
  const tempRoot = await mkdtemp(path.join(canonicalTempBase, "pdgo-install-preflight-"));
  t.after(() => rm(tempRoot, { recursive: true, force: true }));
  const fixture = await makeInstallerSource(tempRoot);
  const codexHome = path.join(tempRoot, "codex-home");
  const skillTarget = path.join(codexHome, "skills", "bosscoding-secretary");
  const agentsPath = path.join(codexHome, "AGENTS.md");
  await mkdir(skillTarget, { recursive: true });
  await writeFile(path.join(skillTarget, "old.txt"), "old-skill", "utf8");
  await writeFile(agentsPath, "# untouched\n", "utf8");
  await rm(path.join(fixture.sourceRoot, "integrations", "codex-native", "skills", "pdgo-codex-native-bridge"), { recursive: true });

  const failed = runNode(fixture.sourceInstaller, ["--codex-home", codexHome], tempRoot);
  assert.notEqual(failed.status, 0);
  assert.equal(await readFile(path.join(skillTarget, "old.txt"), "utf8"), "old-skill");
  assert.equal(await readFile(agentsPath, "utf8"), "# untouched\n");
  assert.equal(await exists(path.join(codexHome, "runtime", "bosscoding", "runtime.json")), false);
});

test("installer rolls back a commit error and recovers an interrupted batch before later preflight", async (t) => {
  const tempRoot = await mkdtemp(path.join(canonicalTempBase, "pdgo-install-atomic-"));
  t.after(() => rm(tempRoot, { recursive: true, force: true }));
  const fixture = await makeInstallerSource(tempRoot);
  const codexHome = path.join(tempRoot, "codex-home");
  const secretaryTarget = path.join(codexHome, "skills", "bosscoding-secretary");
  const bridgeTarget = path.join(codexHome, "skills", "pdgo-codex-native-bridge");
  const agentsPath = path.join(codexHome, "AGENTS.md");
  await mkdir(secretaryTarget, { recursive: true });
  await mkdir(bridgeTarget, { recursive: true });
  await writeFile(path.join(secretaryTarget, "old.txt"), "old-secretary", "utf8");
  await writeFile(path.join(bridgeTarget, "old.txt"), "old-bridge", "utf8");
  await writeFile(agentsPath, "# original agents\n", "utf8");
  const injectionBase = { BOSSCODING_INSTALL_TESTING: "1", BOSSCODING_INSTALL_FAIL_AFTER: "1" };

  const errored = runNode(fixture.sourceInstaller, ["--codex-home", codexHome], tempRoot, {
    ...injectionBase,
    BOSSCODING_INSTALL_FAIL_MODE: "error",
  });
  assert.notEqual(errored.status, 0);
  assert.equal(await readFile(path.join(secretaryTarget, "old.txt"), "utf8"), "old-secretary");
  assert.equal(await readFile(path.join(bridgeTarget, "old.txt"), "utf8"), "old-bridge");
  assert.equal(await readFile(agentsPath, "utf8"), "# original agents\n");

  const interrupted = runNode(fixture.sourceInstaller, ["--codex-home", codexHome], tempRoot, {
    ...injectionBase,
    BOSSCODING_INSTALL_FAIL_MODE: "interrupt",
  });
  assert.equal(interrupted.status, 86);
  await rm(path.join(fixture.sourceRoot, "integrations", "codex-native", "skills", "pdgo-codex-native-bridge"), { recursive: true });
  const recoveryThenPreflightFailure = runNode(fixture.sourceInstaller, ["--codex-home", codexHome], tempRoot);
  assert.notEqual(recoveryThenPreflightFailure.status, 0);
  assert.match(recoveryThenPreflightFailure.stderr, /recovered interrupted installation/i);
  assert.equal(await readFile(path.join(secretaryTarget, "old.txt"), "utf8"), "old-secretary");
  assert.equal(await readFile(path.join(bridgeTarget, "old.txt"), "utf8"), "old-bridge");
  assert.equal(await readFile(agentsPath, "utf8"), "# original agents\n");
});

test("installer rejects a symlinked target ancestor before any write", async (t) => {
  const tempRoot = await mkdtemp(path.join(canonicalTempBase, "pdgo-install-link-"));
  t.after(() => rm(tempRoot, { recursive: true, force: true }));
  const fixture = await makeInstallerSource(tempRoot);
  const codexHome = path.join(tempRoot, "codex-home");
  const outside = path.join(tempRoot, "outside-skills");
  await mkdir(codexHome, { recursive: true });
  await mkdir(outside, { recursive: true });
  await writeFile(path.join(outside, "sentinel.txt"), "outside", "utf8");
  await symlink(outside, path.join(codexHome, "skills"), process.platform === "win32" ? "junction" : "dir");

  const failed = runNode(fixture.sourceInstaller, ["--codex-home", codexHome], tempRoot);
  assert.notEqual(failed.status, 0);
  assert.match(failed.stderr, /symbolic link|junction|reparse|canonical path/i);
  assert.equal(await readFile(path.join(outside, "sentinel.txt"), "utf8"), "outside");
  assert.deepEqual(await readdir(outside), ["sentinel.txt"]);
  assert.equal(await exists(path.join(codexHome, "AGENTS.md")), false);
});

test("installer ownership lock rejects a second live installer without rolling back the active batch", async (t) => {
  const tempRoot = await mkdtemp(path.join(canonicalTempBase, "pdgo-install-lock-"));
  t.after(() => rm(tempRoot, { recursive: true, force: true }));
  const fixture = await makeInstallerSource(tempRoot);
  const codexHome = path.join(tempRoot, "codex-home");
  await mkdir(codexHome, { recursive: true });

  const first = startNode(fixture.sourceInstaller, ["--codex-home", codexHome], tempRoot, {
    BOSSCODING_INSTALL_TESTING: "1",
    BOSSCODING_INSTALL_HOLD_AFTER_LOCK_MS: "700",
  });
  await waitForPath(path.join(codexHome, ".bosscoding-install.lock", "owner.json"));
  const second = runNode(fixture.sourceInstaller, ["--codex-home", codexHome], tempRoot);
  assert.notEqual(second.status, 0);
  assert.match(second.stderr, /installation.*active|lock.*live owner/i);

  const firstResult = await first.result;
  expectSuccess(firstResult);
  assert.equal(await exists(path.join(codexHome, "skills", "bosscoding-secretary", "SKILL.md")), true);
});

test("installer publishes a complete lock atomically and recovers after a pre-publish crash", async (t) => {
  const tempRoot = await mkdtemp(path.join(canonicalTempBase, "pdgo-install-lock-publish-"));
  t.after(() => rm(tempRoot, { recursive: true, force: true }));
  const fixture = await makeInstallerSource(tempRoot);
  const codexHome = path.join(tempRoot, "codex-home");
  await mkdir(codexHome, { recursive: true });

  const interrupted = runNode(fixture.sourceInstaller, ["--codex-home", codexHome], tempRoot, {
    BOSSCODING_INSTALL_TESTING: "1",
    BOSSCODING_INSTALL_FAIL_BEFORE_LOCK_PUBLISH: "1",
  });
  assert.equal(interrupted.status, 87);
  assert.equal(await exists(path.join(codexHome, ".bosscoding-install.lock")), false);

  const recovered = expectSuccess(runNode(fixture.sourceInstaller, ["--codex-home", codexHome], tempRoot));
  assert.equal(recovered.ok, true);
});

test("installer safely isolates pure staging orphans with a missing or truncated journal", async (t) => {
  const tempRoot = await mkdtemp(path.join(canonicalTempBase, "pdgo-install-orphan-"));
  t.after(() => rm(tempRoot, { recursive: true, force: true }));
  const fixture = await makeInstallerSource(tempRoot);
  const codexHome = path.join(tempRoot, "codex-home");
  const transactionParent = path.join(codexHome, ".bosscoding-install");
  for (const [name, journal] of [["missing", null], ["truncated", "{\"schema_version\":"]]) {
    const transaction = path.join(transactionParent, name);
    await mkdir(path.join(transaction, "staged"), { recursive: true });
    await mkdir(path.join(transaction, "backups"), { recursive: true });
    await writeFile(path.join(transaction, "staged", "0"), "staged-only", "utf8");
    if (journal !== null) await writeFile(path.join(transaction, "journal.json"), journal, "utf8");
  }

  const installed = expectSuccess(runNode(fixture.sourceInstaller, ["--codex-home", codexHome], tempRoot));
  assert.equal(installed.ok, true);
  assert.equal(await exists(path.join(transactionParent, "missing")), false);
  assert.equal(await exists(path.join(transactionParent, "truncated")), false);
});

test("installer fails and rolls back when the source drifts after the staging snapshot", async (t) => {
  const tempRoot = await mkdtemp(path.join(canonicalTempBase, "pdgo-install-source-drift-"));
  t.after(() => rm(tempRoot, { recursive: true, force: true }));
  const fixture = await makeInstallerSource(tempRoot);
  const codexHome = path.join(tempRoot, "codex-home");
  const oldTarget = path.join(codexHome, "skills", "bosscoding-secretary");
  await mkdir(oldTarget, { recursive: true });
  await writeFile(path.join(oldTarget, "old.txt"), "old", "utf8");

  const installing = startNode(fixture.sourceInstaller, ["--codex-home", codexHome], tempRoot, {
    BOSSCODING_INSTALL_TESTING: "1",
    BOSSCODING_INSTALL_HOLD_AFTER_SNAPSHOT_MS: "700",
  });
  await waitForTransactionMarker(codexHome, "snapshot.ready");
  await writeFile(path.join(fixture.sourceRoot, "integrations", "codex-native", "skills", "bosscoding-secretary", "SKILL.md"), "drifted\n", "utf8");
  const result = await installing.result;
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /source.*drift|snapshot.*mismatch/i);
  assert.equal(await readFile(path.join(oldTarget, "old.txt"), "utf8"), "old");
});

test("installer detects file and directory target drift before the first mutation", async (t) => {
  for (const targetKind of ["file", "directory"]) {
    const tempRoot = await mkdtemp(path.join(canonicalTempBase, `pdgo-install-target-drift-${targetKind}-`));
    t.after(() => rm(tempRoot, { recursive: true, force: true }));
    const fixture = await makeInstallerSource(tempRoot);
    const codexHome = path.join(tempRoot, "codex-home");
    const agentsPath = path.join(codexHome, "AGENTS.md");
    const skillTarget = path.join(codexHome, "skills", "bosscoding-secretary");
    await mkdir(skillTarget, { recursive: true });
    await writeFile(path.join(skillTarget, "old.txt"), "old\n", "utf8");
    await writeFile(agentsPath, "# original\n", "utf8");

    const installing = startNode(fixture.sourceInstaller, ["--codex-home", codexHome], tempRoot, {
      BOSSCODING_INSTALL_TESTING: "1",
      BOSSCODING_INSTALL_HOLD_AFTER_SNAPSHOT_MS: "700",
    });
    await waitForTransactionMarker(codexHome, "snapshot.ready");
    if (targetKind === "file") await writeFile(agentsPath, "# concurrent file edit\n", "utf8");
    else await writeFile(path.join(skillTarget, "concurrent.txt"), "concurrent directory edit\n", "utf8");
    const result = await installing.result;
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /target.*drift|concurrent target/i);
    if (targetKind === "file") assert.equal(await readFile(agentsPath, "utf8"), "# concurrent file edit\n");
    else assert.equal(await readFile(path.join(skillTarget, "concurrent.txt"), "utf8"), "concurrent directory edit\n");
  }
});

test("installer preserves and recovers the physical backup across both rename journal windows", async (t) => {
  for (const [faultName, expectedStatus] of [
    ["BOSSCODING_INSTALL_FAIL_AFTER_BACKUP_RENAME", 88],
    ["BOSSCODING_INSTALL_FAIL_AFTER_TARGET_RENAME", 89],
  ]) {
    const tempRoot = await mkdtemp(path.join(canonicalTempBase, `pdgo-install-rename-window-${expectedStatus}-`));
    t.after(() => rm(tempRoot, { recursive: true, force: true }));
    const fixture = await makeInstallerSource(tempRoot);
    const codexHome = path.join(tempRoot, "codex-home");
    const skillTarget = path.join(codexHome, "skills", "bosscoding-secretary");
    await mkdir(skillTarget, { recursive: true });
    await writeFile(path.join(skillTarget, "old.txt"), "old-before-crash\n", "utf8");

    const interrupted = runNode(fixture.sourceInstaller, ["--codex-home", codexHome], tempRoot, {
      BOSSCODING_INSTALL_TESTING: "1",
      [faultName]: "1",
    });
    assert.equal(interrupted.status, expectedStatus, interrupted.stderr);

    await rm(path.join(fixture.sourceRoot, "integrations", "codex-native", "skills", "pdgo-codex-native-bridge"), { recursive: true });
    const recoveryThenPreflightFailure = runNode(fixture.sourceInstaller, ["--codex-home", codexHome], tempRoot);
    assert.notEqual(recoveryThenPreflightFailure.status, 0);
    assert.match(recoveryThenPreflightFailure.stderr, /recovered interrupted installation/i);
    assert.equal(await readFile(path.join(skillTarget, "old.txt"), "utf8"), "old-before-crash\n");
  }
});

test("first-install interruption before atomic publish leaves no partial live Skill", async (t) => {
  const tempRoot = await mkdtemp(path.join(canonicalTempBase, "pdgo-install-first-publish-interrupt-"));
  t.after(() => rm(tempRoot, { recursive: true, force: true }));
  const fixture = await makeInstallerSource(tempRoot);
  const codexHome = path.join(tempRoot, "codex-home");
  const skillTarget = path.join(codexHome, "skills", "bosscoding-secretary");

  const interrupted = runNode(fixture.sourceInstaller, ["--codex-home", codexHome], tempRoot, {
    BOSSCODING_INSTALL_TESTING: "1",
    BOSSCODING_INSTALL_FAIL_BEFORE_NEW_TARGET_PUBLISH: "1",
  });
  assert.equal(interrupted.status, 90, interrupted.stderr);
  assert.equal(await exists(skillTarget), false);

  const recovered = expectSuccess(runNode(fixture.sourceInstaller, ["--codex-home", codexHome], tempRoot));
  assert.equal(recovered.ok, true);
  assert.match(await readFile(path.join(skillTarget, "SKILL.md"), "utf8"), /secretary/);
});

test("first install preserves file and directory targets created concurrently after the final snapshot", async (t) => {
  for (const targetKind of ["directory", "file"]) {
    const tempRoot = await mkdtemp(path.join(canonicalTempBase, `pdgo-install-first-late-${targetKind}-`));
    t.after(() => rm(tempRoot, { recursive: true, force: true }));
    const fixture = await makeInstallerSource(tempRoot);
    const codexHome = path.join(tempRoot, "codex-home");
    const target = targetKind === "directory"
      ? path.join(codexHome, "skills", "bosscoding-secretary")
      : path.join(codexHome, "AGENTS.md");
    const markerIndex = targetKind === "directory" ? 1 : 3;
    const installing = startNode(fixture.sourceInstaller, ["--codex-home", codexHome], tempRoot, {
      BOSSCODING_INSTALL_TESTING: "1",
      BOSSCODING_INSTALL_HOLD_BEFORE_TARGET_RENAME_MS: "700",
    });
    await waitForTransactionMarker(codexHome, `pre-rename-${markerIndex}.ready`);
    if (targetKind === "directory") {
      await mkdir(target, { recursive: true });
      await writeFile(path.join(target, "late.txt"), "preserve late directory\n", "utf8");
    } else {
      await writeFile(target, "# preserve late file\n", "utf8");
    }
    const result = await installing.result;
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /concurrent target drift|externally created target.*preserved/i);
    if (targetKind === "directory") assert.equal(await readFile(path.join(target, "late.txt"), "utf8"), "preserve late directory\n");
    else assert.equal(await readFile(target, "utf8"), "# preserve late file\n");
  }
});

test("first install preserves identical file and directory targets copied concurrently from staging", async (t) => {
  for (const targetKind of ["directory", "file"]) {
    const tempRoot = await mkdtemp(path.join(canonicalTempBase, `pdgo-install-first-identical-${targetKind}-`));
    t.after(() => rm(tempRoot, { recursive: true, force: true }));
    const fixture = await makeInstallerSource(tempRoot);
    const codexHome = path.join(tempRoot, "codex-home");
    const target = targetKind === "directory"
      ? path.join(codexHome, "skills", "bosscoding-secretary")
      : path.join(codexHome, "AGENTS.md");
    const entryIndex = targetKind === "directory" ? 0 : 2;
    const installing = startNode(fixture.sourceInstaller, ["--codex-home", codexHome], tempRoot, {
      BOSSCODING_INSTALL_TESTING: "1",
      BOSSCODING_INSTALL_HOLD_BEFORE_TARGET_RENAME_MS: "700",
    });
    const marker = await waitForTransactionMarker(codexHome, `pre-rename-${entryIndex + 1}.ready`);
    const staged = path.join(path.dirname(marker), "staged", String(entryIndex));
    if (targetKind === "directory") await cp(staged, target, { recursive: true, force: false, errorOnExist: true });
    else await cp(staged, target, { force: false, errorOnExist: true });
    const result = await installing.result;
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /concurrent target drift|externally created target.*preserved/i);
    assert.equal(await exists(target), true);
    if (targetKind === "directory") assert.equal(await fileSha256(path.join(target, "SKILL.md")), await fileSha256(path.join(fixture.sourceRoot, "integrations", "codex-native", "skills", "bosscoding-secretary", "SKILL.md")));
    else assert.match(await readFile(target, "utf8"), /BEGIN BOSSCODING-PDGO OVERLAY/);
  }
});

test("installer preserves late file and directory edits made after the final snapshot check", async (t) => {
  for (const targetKind of ["directory", "file"]) {
    const tempRoot = await mkdtemp(path.join(canonicalTempBase, `pdgo-install-late-target-drift-${targetKind}-`));
    t.after(() => rm(tempRoot, { recursive: true, force: true }));
    const fixture = await makeInstallerSource(tempRoot);
    const codexHome = path.join(tempRoot, "codex-home");
    const skillTarget = path.join(codexHome, "skills", "bosscoding-secretary");
    const agentsPath = path.join(codexHome, "AGENTS.md");
    await mkdir(skillTarget, { recursive: true });
    await writeFile(path.join(skillTarget, "old.txt"), "old\n", "utf8");
    await writeFile(agentsPath, "# original\n", "utf8");

    const installing = startNode(fixture.sourceInstaller, ["--codex-home", codexHome], tempRoot, {
      BOSSCODING_INSTALL_TESTING: "1",
      BOSSCODING_INSTALL_HOLD_BEFORE_TARGET_RENAME_MS: "700",
    });
    const markerIndex = targetKind === "directory" ? 1 : 3;
    await waitForTransactionMarker(codexHome, `pre-rename-${markerIndex}.ready`);
    if (targetKind === "directory") await writeFile(path.join(skillTarget, "concurrent.txt"), "late directory edit\n", "utf8");
    else await writeFile(agentsPath, "# late file edit\n", "utf8");
    const result = await installing.result;
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /concurrent target drift|backup.*original snapshot/i);
    if (targetKind === "directory") assert.equal(await readFile(path.join(skillTarget, "concurrent.txt"), "utf8"), "late directory edit\n");
    else assert.equal(await readFile(agentsPath, "utf8"), "# late file edit\n");
  }
});

test("installer rollback preserves an externally modified committed target", async (t) => {
  const tempRoot = await mkdtemp(path.join(canonicalTempBase, "pdgo-install-rollback-conflict-"));
  t.after(() => rm(tempRoot, { recursive: true, force: true }));
  const fixture = await makeInstallerSource(tempRoot);
  const codexHome = path.join(tempRoot, "codex-home");
  const skillTarget = path.join(codexHome, "skills", "bosscoding-secretary");
  await mkdir(skillTarget, { recursive: true });
  await writeFile(path.join(skillTarget, "old.txt"), "old\n", "utf8");

  const installing = startNode(fixture.sourceInstaller, ["--codex-home", codexHome], tempRoot, {
    BOSSCODING_INSTALL_TESTING: "1",
    BOSSCODING_INSTALL_FAIL_AFTER: "1",
    BOSSCODING_INSTALL_FAIL_MODE: "error",
    BOSSCODING_INSTALL_HOLD_AFTER_EACH_COMMIT_MS: "700",
  });
  await waitForTransactionMarker(codexHome, "commit-1.ready");
  await writeFile(path.join(skillTarget, "concurrent.txt"), "preserve me\n", "utf8");
  const result = await installing.result;
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /rollback.*conflict|externally modified/i);
  assert.equal(await readFile(path.join(skillTarget, "concurrent.txt"), "utf8"), "preserve me\n");
});

test("installer rechecks the live source after commit and rolls back stale output", async (t) => {
  const tempRoot = await mkdtemp(path.join(canonicalTempBase, "pdgo-install-post-source-drift-"));
  t.after(() => rm(tempRoot, { recursive: true, force: true }));
  const fixture = await makeInstallerSource(tempRoot);
  const codexHome = path.join(tempRoot, "codex-home");
  const skillTarget = path.join(codexHome, "skills", "bosscoding-secretary");
  await mkdir(skillTarget, { recursive: true });
  await writeFile(path.join(skillTarget, "old.txt"), "old\n", "utf8");

  const installing = startNode(fixture.sourceInstaller, ["--codex-home", codexHome], tempRoot, {
    BOSSCODING_INSTALL_TESTING: "1",
    BOSSCODING_INSTALL_HOLD_AFTER_COMMIT_MS: "700",
  });
  await waitForTransactionMarker(codexHome, "commit.complete");
  await writeFile(path.join(fixture.sourceRoot, "integrations", "codex-native", "skills", "bosscoding-secretary", "SKILL.md"), "post-commit source drift\n", "utf8");
  const result = await installing.result;
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /source.*drift.*after commit/i);
  assert.equal(await readFile(path.join(skillTarget, "old.txt"), "utf8"), "old\n");
});

test("installer verifies every committed target and rolls back a post-commit mismatch", async (t) => {
  const tempRoot = await mkdtemp(path.join(canonicalTempBase, "pdgo-install-post-verify-"));
  t.after(() => rm(tempRoot, { recursive: true, force: true }));
  const fixture = await makeInstallerSource(tempRoot);
  const codexHome = path.join(tempRoot, "codex-home");
  const oldTarget = path.join(codexHome, "skills", "bosscoding-secretary");
  await mkdir(oldTarget, { recursive: true });
  await writeFile(path.join(oldTarget, "old.txt"), "old", "utf8");

  const result = runNode(fixture.sourceInstaller, ["--codex-home", codexHome], tempRoot, {
    BOSSCODING_INSTALL_TESTING: "1",
    BOSSCODING_INSTALL_CORRUPT_AFTER_COMMIT: "1",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /post-commit verification failed/i);
  assert.equal(await readFile(path.join(oldTarget, "old.txt"), "utf8"), "old");
});

test("stateful dispatcher actions require explicit root and project unless legacy defaults are explicitly enabled", async (t) => {
  const tempRoot = await mkdtemp(path.join(canonicalTempBase, "pdgo-cli-args-"));
  t.after(() => rm(tempRoot, { recursive: true, force: true }));

  const noRoot = runNode(dispatcherSource, ["--action", "resume", "--project", "p", "--external-agents", "false"], tempRoot);
  assert.notEqual(noRoot.status, 0);
  assert.match(noRoot.stderr, /root is required/i);

  const noProject = runNode(dispatcherSource, ["--action", "resume", "--root", path.join(tempRoot, "state"), "--external-agents", "false"], tempRoot);
  assert.notEqual(noProject.status, 0);
  assert.match(noProject.stderr, /project is required/i);

  const legacy = expectSuccess(runNode(dispatcherSource, [
    "--action", "resume",
    "--legacy-cwd-defaults", "true",
    "--external-agents", "false",
  ], tempRoot));
  assert.equal(legacy.ok, true);
});
