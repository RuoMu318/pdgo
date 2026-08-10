#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { lstat, mkdir, readFile, readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const INTEGRATION_ID = "pdgo-codex-native";
const DESCRIPTOR_VERSION = "1.1";
const RUNTIME_TREE_ALGORITHM = "sha256-tree-v1";

function argsToObject(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) result[key] = true;
    else {
      result[key] = value;
      index += 1;
    }
  }
  return result;
}

function required(value, name) {
  if (value === undefined || value === null || value === "" || value === true) {
    throw new Error(`${name} is required`);
  }
  return String(value);
}

function normalizedForIdentity(value) {
  const normalized = path.normalize(value);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function isWithin(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`));
}

function validateConfigLayout(configPath) {
  const resolved = path.resolve(configPath);
  const bosscodingDirectory = path.dirname(resolved);
  const runtimeDirectory = path.dirname(bosscodingDirectory);
  const matches = path.basename(resolved).toLowerCase() === "runtime.json"
    && path.basename(bosscodingDirectory).toLowerCase() === "bosscoding"
    && path.basename(runtimeDirectory).toLowerCase() === "runtime";
  if (!matches) throw new Error("config must be <CodexHome>/runtime/bosscoding/runtime.json");
  return { configPath: resolved, codexHome: path.dirname(runtimeDirectory) };
}

function defaultConfigPath() {
  const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
  const codexHome = path.resolve(scriptDirectory, "..", "..", "..");
  return path.join(codexHome, "runtime", "bosscoding", "runtime.json");
}

async function sha256File(filePath) {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

async function assertCanonicalPath(root, candidate, label) {
  if (!isWithin(root, candidate)) throw new Error(`${label} must stay within its trusted root`);
  const relative = path.relative(root, candidate);
  let current = root;
  for (const component of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, component);
    const info = await lstat(current);
    if (info.isSymbolicLink()) throw new Error(`${label} cannot contain a symbolic link, junction, or reparse point`);
    const canonical = await realpath(current);
    if (normalizedForIdentity(canonical) !== normalizedForIdentity(current)) {
      throw new Error(`${label} cannot traverse a symbolic link, junction, reparse point, or non-canonical path`);
    }
  }
}

async function runtimeTreeDigest(runtimeRoot, relativePaths) {
  const records = [];
  async function visit(relativePath) {
    const absolute = path.resolve(runtimeRoot, relativePath);
    if (!isWithin(runtimeRoot, absolute)) throw new Error("runtime_tree path must stay within runtime_root");
    await assertCanonicalPath(runtimeRoot, absolute, `runtime_tree entry ${relativePath}`);
    const info = await lstat(absolute);
    const portable = relativePath.replaceAll("\\", "/");
    if (info.isFile()) {
      records.push(`file:${portable}:${await sha256File(absolute)}`);
      return;
    }
    if (!info.isDirectory()) throw new Error(`runtime_tree contains an unsupported entry: ${relativePath}`);
    records.push(`dir:${portable}`);
    for (const entry of (await readdir(absolute)).sort()) await visit(path.join(relativePath, entry));
  }
  for (const relativePath of relativePaths) await visit(relativePath);
  return createHash("sha256").update(records.join("\n"), "utf8").digest("hex");
}

function runtimePathsFromManifest(manifest) {
  if (String(manifest.schema_version) !== "1.1") throw new Error("runtime manifest schema_version must be 1.1");
  const runtimeTree = manifest.runtime_tree;
  if (!runtimeTree || typeof runtimeTree !== "object" || Array.isArray(runtimeTree)) {
    throw new Error("runtime manifest runtime_tree must be an object");
  }
  if (runtimeTree.algorithm !== RUNTIME_TREE_ALGORITHM) {
    throw new Error(`runtime manifest runtime_tree.algorithm must be ${RUNTIME_TREE_ALGORITHM}`);
  }
  const configuredPaths = manifest.runtime_tree.paths;
  if (!Array.isArray(configuredPaths) || configuredPaths.length === 0) {
    throw new Error("runtime manifest runtime_tree.paths must be a non-empty array");
  }
  const paths = configuredPaths.map((entry, index) => {
    const relativePath = required(entry, `runtime manifest runtime_tree.paths[${index}]`);
    if (path.isAbsolute(relativePath)) throw new Error("runtime manifest runtime_tree paths must be relative");
    const normalized = path.normalize(relativePath);
    if (normalized === ".." || normalized.startsWith(`..${path.sep}`)) {
      throw new Error("runtime manifest runtime_tree paths must stay within runtime_root");
    }
    return relativePath.replaceAll("\\", "/");
  });
  if (new Set(paths).size !== paths.length) throw new Error("runtime manifest runtime_tree.paths must be unique");
  const requiredCatalogPaths = [
    manifest.dispatcher,
    manifest.external_agent_catalog?.index,
    manifest.external_agent_catalog?.metadata_index,
    manifest.external_agent_catalog?.prompts,
  ].map((entry, index) => required(entry, `runtime manifest required path ${index}`));
  for (const requiredPath of requiredCatalogPaths) {
    if (!paths.includes(requiredPath.replaceAll("\\", "/"))) {
      throw new Error(`runtime manifest runtime_tree.paths must include ${requiredPath}`);
    }
  }
  return paths;
}

async function verifyRuntimeTree(runtimeRoot, runtimeTree, requiredRuntimePaths) {
  if (!runtimeTree || typeof runtimeTree !== "object" || Array.isArray(runtimeTree)) {
    throw new Error("runtime_tree must be an object");
  }
  if (runtimeTree.algorithm !== RUNTIME_TREE_ALGORITHM) {
    throw new Error(`runtime_tree.algorithm must be ${RUNTIME_TREE_ALGORITHM}`);
  }
  if (JSON.stringify(runtimeTree.paths) !== JSON.stringify(requiredRuntimePaths)) {
    throw new Error("runtime_tree.paths must exactly match the SHA-256 verified runtime manifest");
  }
  const expected = required(runtimeTree.sha256, "runtime_tree.sha256").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(expected)) throw new Error("runtime_tree.sha256 must be a lowercase SHA-256");
  const actual = await runtimeTreeDigest(runtimeRoot, requiredRuntimePaths);
  if (actual !== expected) throw new Error("runtime_tree SHA-256 mismatch");
}

async function resolveDescriptorFile(runtimeRoot, entry, label) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw new Error(`${label} must be an object`);
  }
  const relativePath = required(entry.path, `${label}.path`);
  if (path.isAbsolute(relativePath)) throw new Error(`${label}.path must be relative to runtime_root`);
  const resolved = path.resolve(runtimeRoot, relativePath);
  if (!isWithin(runtimeRoot, resolved)) throw new Error(`${label}.path must stay within runtime_root`);

  await assertCanonicalPath(runtimeRoot, resolved, `${label}.path`);
  const canonical = await realpath(resolved);
  if (!isWithin(runtimeRoot, canonical)) throw new Error(`${label}.path must stay within runtime_root`);
  const expectedSha = required(entry.sha256, `${label}.sha256`).toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(expectedSha)) throw new Error(`${label}.sha256 must be a lowercase SHA-256`);
  const actualSha = await sha256File(canonical);
  if (actualSha !== expectedSha) throw new Error(`${label} SHA-256 mismatch`);
  return canonical;
}

async function loadDescriptor(configPath) {
  const descriptor = JSON.parse(await readFile(configPath, "utf8"));
  if (String(descriptor.schema_version) !== DESCRIPTOR_VERSION) {
    throw new Error(`unsupported descriptor schema_version: ${descriptor.schema_version}`);
  }
  if (descriptor.integration_id !== INTEGRATION_ID) {
    throw new Error(`descriptor integration_id must be ${INTEGRATION_ID}`);
  }
  if (!path.isAbsolute(required(descriptor.runtime_root, "runtime_root"))) {
    throw new Error("runtime_root must be absolute");
  }
  const requestedRuntimeRoot = path.resolve(descriptor.runtime_root);
  const runtimeRoot = await realpath(requestedRuntimeRoot);
  if (normalizedForIdentity(runtimeRoot) !== normalizedForIdentity(requestedRuntimeRoot)) {
    throw new Error("runtime_root cannot traverse a symbolic link, junction, reparse point, or non-canonical path");
  }
  const runtimeStats = await stat(runtimeRoot);
  if (!runtimeStats.isDirectory()) throw new Error("runtime_root must be a directory");
  const manifestPath = await resolveDescriptorFile(runtimeRoot, descriptor.manifest, "manifest");
  const dispatcherPath = await resolveDescriptorFile(runtimeRoot, descriptor.dispatcher, "dispatcher");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (manifest.integration_id !== INTEGRATION_ID) {
    throw new Error(`runtime manifest integration_id must be ${INTEGRATION_ID}`);
  }
  const requiredRuntimePaths = runtimePathsFromManifest(manifest);
  if (manifest.dispatcher.replaceAll("\\", "/") !== descriptor.dispatcher.path.replaceAll("\\", "/")) {
    throw new Error("runtime manifest dispatcher must match descriptor.dispatcher.path");
  }
  await verifyRuntimeTree(runtimeRoot, descriptor.runtime_tree, requiredRuntimePaths);
  return { runtimeRoot, manifestPath, dispatcherPath, manifest };
}

function safeProjectName(canonicalProjectRoot) {
  const normalized = path.basename(canonicalProjectRoot)
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return (normalized || "project").slice(0, 48);
}

async function inspect({ configPath, codexHome, project }) {
  const canonicalCodexHome = await realpath(codexHome);
  if (normalizedForIdentity(canonicalCodexHome) !== normalizedForIdentity(codexHome)) {
    throw new Error("CodexHome cannot traverse a symbolic link, junction, reparse point, or non-canonical path");
  }
  await assertCanonicalPath(canonicalCodexHome, configPath, "runtime descriptor path");
  const { runtimeRoot, manifestPath, dispatcherPath } = await loadDescriptor(configPath);
  const requestedProjectRoot = path.resolve(project);
  const canonicalProjectRoot = await realpath(requestedProjectRoot);
  if (normalizedForIdentity(canonicalProjectRoot) !== normalizedForIdentity(requestedProjectRoot)) {
    throw new Error("project cannot use or traverse a symbolic link, junction, reparse point, or non-canonical path");
  }
  const projectStats = await stat(canonicalProjectRoot);
  if (!projectStats.isDirectory()) throw new Error("project must be an existing directory");
  const projectHash = createHash("sha256")
    .update(normalizedForIdentity(canonicalProjectRoot), "utf8")
    .digest("hex")
    .slice(0, 16);
  const projectKey = `${safeProjectName(canonicalProjectRoot)}-${projectHash}`;
  const stateRoot = path.join(canonicalCodexHome, "state", "bosscoding", "projects", projectKey);
  let stateExists = false;
  try {
    const stateStats = await lstat(stateRoot);
    if (stateStats.isSymbolicLink()) throw new Error("computed state_root cannot be a symbolic link");
    if (!stateStats.isDirectory()) throw new Error("computed state_root exists but is not a directory");
    const canonicalStateRoot = await realpath(stateRoot);
    if (normalizedForIdentity(canonicalStateRoot) !== normalizedForIdentity(stateRoot)) {
      throw new Error("computed state_root cannot traverse a symbolic link");
    }
    stateExists = true;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  return {
    ok: true,
    action: "inspect",
    integration_id: INTEGRATION_ID,
    config_path: configPath,
    codex_home: canonicalCodexHome,
    runtime_root: runtimeRoot,
    manifest_path: manifestPath,
    dispatcher_path: dispatcherPath,
    canonical_project_root: canonicalProjectRoot,
    project_key: projectKey,
    state_root: stateRoot,
    state_exists: stateExists,
    requires_creation: !stateExists,
  };
}

async function ensureCanonicalDirectoryTree(codexHome, target) {
  if (!isWithin(codexHome, target)) throw new Error("state_root must stay within canonical CodexHome");
  const relative = path.relative(codexHome, target);
  let current = codexHome;
  for (const component of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, component);
    try {
      const info = await lstat(current);
      if (info.isSymbolicLink() || !info.isDirectory()) {
        throw new Error("state path ancestor cannot be a symbolic link, junction, reparse point, or non-directory");
      }
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      try {
        await mkdir(current);
      } catch (mkdirError) {
        if (mkdirError.code !== "EEXIST") throw mkdirError;
      }
    }
    const canonical = await realpath(current);
    if (normalizedForIdentity(canonical) !== normalizedForIdentity(current) || !isWithin(codexHome, canonical)) {
      throw new Error("state path ancestor cannot traverse a symbolic link, junction, reparse point, or non-canonical path");
    }
  }
}

async function main() {
  const options = argsToObject(process.argv.slice(2));
  const action = String(options.action ?? "inspect").toLowerCase();
  if (!new Set(["inspect", "ensure", "invoke"]).has(action)) throw new Error(`unknown action: ${action}`);
  const project = required(options.project, "project");
  const located = validateConfigLayout(options.config ? required(options.config, "config") : defaultConfigPath());
  const result = await inspect({ ...located, project });

  if (action === "invoke") {
    const allowedOptions = new Set(["action", "project", "config", "dispatcherAction", "input", "externalAgents"]);
    const unsupported = Object.keys(options).filter((key) => !allowedOptions.has(key));
    if (unsupported.length) throw new Error(`verified invoke forbids unsupported option(s): ${unsupported.join(", ")}`);
    if (!result.state_exists) throw new Error("verified invoke requires the approved state root to exist; run ensure only after approval");
    const dispatcherAction = required(options.dispatcherAction, "dispatcher-action").toLowerCase();
    const allowedActions = new Set(["create-plan", "bind-host-session", "bind-host-worker", "approve", "dispatch", "report", "review", "resume", "resolve-blocker", "sync"]);
    if (!allowedActions.has(dispatcherAction)) throw new Error(`unsupported verified dispatcher action: ${dispatcherAction}`);
    const externalAgents = String(options.externalAgents ?? "false").toLowerCase();
    if (!new Set(["true", "false"]).has(externalAgents)) throw new Error("external-agents must be true or false");
    const dispatcherArgs = [
      "--action", dispatcherAction,
      "--root", result.state_root,
      "--project", result.project_key,
      "--external-agents", externalAgents,
    ];
    if (options.input !== undefined) dispatcherArgs.push("--input", required(options.input, "input"));
    const invoked = spawnSync(process.execPath, [result.dispatcher_path, ...dispatcherArgs], {
      cwd: result.runtime_root,
      encoding: "utf8",
      windowsHide: true,
      env: {
        ...process.env,
        BOSSCODING_VERIFIED_INVOKE: "1",
        BOSSCODING_VERIFIED_PARENT_PID: String(process.pid),
        BOSSCODING_VERIFIED_STATE_ROOT: result.state_root,
        BOSSCODING_VERIFIED_PROJECT_KEY: result.project_key,
        BOSSCODING_VERIFIED_RUNTIME_ROOT: result.runtime_root,
      },
    });
    if (invoked.stderr) process.stderr.write(invoked.stderr);
    if (invoked.status !== 0) throw new Error(`verified dispatcher action failed with status ${invoked.status}`);
    const refreshed = await inspect({ ...located, project });
    if (!refreshed.state_exists
      || normalizedForIdentity(refreshed.state_root) !== normalizedForIdentity(result.state_root)
      || normalizedForIdentity(refreshed.runtime_root) !== normalizedForIdentity(result.runtime_root)) {
      throw new Error("verified dispatcher inputs changed during invocation");
    }
    process.stdout.write(invoked.stdout ?? "");
    return;
  }

  if (action === "ensure") {
    const expectedStateRoot = path.resolve(required(options.expectedStateRoot, "expected-state-root"));
    if (normalizedForIdentity(expectedStateRoot) !== normalizedForIdentity(result.state_root)) {
      throw new Error("expected-state-root does not match the inspected state root");
    }
    if (!result.state_exists) await ensureCanonicalDirectoryTree(result.codex_home, result.state_root);
    const refreshed = await inspect({ ...located, project });
    if (normalizedForIdentity(refreshed.state_root) !== normalizedForIdentity(result.state_root)
      || normalizedForIdentity(refreshed.canonical_project_root) !== normalizedForIdentity(result.canonical_project_root)
      || normalizedForIdentity(refreshed.runtime_root) !== normalizedForIdentity(result.runtime_root)) {
      throw new Error("cold-start inputs changed during ensure");
    }
    const ensuredStateRoot = await realpath(refreshed.state_root);
    if (normalizedForIdentity(ensuredStateRoot) !== normalizedForIdentity(result.state_root)) {
      throw new Error("computed state_root cannot traverse a symbolic link");
    }
    refreshed.action = "ensure";
    refreshed.created = !result.state_exists;
    refreshed.state_exists = true;
    refreshed.requires_creation = false;
    Object.assign(result, refreshed);
  }

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(`BossCoding cold start failed: ${error.message}`);
  process.exitCode = 1;
});
