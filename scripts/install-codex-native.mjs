#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import {
  cp,
  link,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  rmdir,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const INTEGRATION_ID = "pdgo-codex-native";
const SKILLS = ["bosscoding-secretary", "pdgo-codex-native-bridge"];
const OVERLAY_BEGIN = "<!-- BEGIN BOSSCODING-PDGO OVERLAY -->";
const OVERLAY_END = "<!-- END BOSSCODING-PDGO OVERLAY -->";
const RUNTIME_TREE_ALGORITHM = "sha256-tree-v1";
const TRANSACTION_DIRECTORY = ".bosscoding-install";
const INSTALL_LOCK_DIRECTORY = ".bosscoding-install.lock";

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

function normalized(value) {
  const result = path.normalize(value);
  return process.platform === "win32" ? result.toLowerCase() : result;
}

function isWithin(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`));
}

async function exists(filePath) {
  try {
    await lstat(filePath);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

async function samePhysicalFile(leftPath, rightPath) {
  try {
    const [left, right] = await Promise.all([lstat(leftPath), lstat(rightPath)]);
    return left.isFile() && right.isFile()
      && left.dev === right.dev
      && left.ino !== 0
      && left.ino === right.ino;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

async function sha256File(filePath) {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

function sha256Text(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function assertRegularTree(root, relative = "") {
  const current = path.join(root, relative);
  const info = await lstat(current);
  if (info.isSymbolicLink()) throw new Error(`installation source cannot contain symbolic links: ${relative || "."}`);
  if (info.isFile()) return;
  if (!info.isDirectory()) throw new Error(`installation source contains an unsupported entry: ${relative || "."}`);
  for (const entry of (await readdir(current)).sort()) await assertRegularTree(root, path.join(relative, entry));
}

async function treeDigest(root) {
  if (!await exists(root)) return null;
  const records = [];
  async function visit(relative = "") {
    const current = path.join(root, relative);
    const info = await lstat(current);
    if (info.isSymbolicLink()) throw new Error(`tree cannot contain symbolic links: ${relative || "."}`);
    const portable = relative.replaceAll("\\", "/");
    if (info.isFile()) {
      records.push(`file:${portable}:${await sha256File(current)}`);
      return;
    }
    if (!info.isDirectory()) throw new Error(`tree contains an unsupported entry: ${relative || "."}`);
    records.push(`dir:${portable}`);
    for (const entry of (await readdir(current)).sort()) await visit(path.join(relative, entry));
  }
  await visit();
  return createHash("sha256").update(records.join("\n"), "utf8").digest("hex");
}

async function runtimeTreeDigest(runtimeRoot, requiredRuntimePaths) {
  const records = [];
  async function visit(relativePath) {
    const absolute = path.resolve(runtimeRoot, relativePath);
    if (!isWithin(runtimeRoot, absolute)) throw new Error(`runtime entry escapes runtime root: ${relativePath}`);
    const canonical = await realpath(absolute);
    if (normalized(canonical) !== normalized(absolute) || !isWithin(runtimeRoot, canonical)) {
      throw new Error(`runtime tree cannot traverse a symbolic link, junction, reparse point, or non-canonical path: ${relativePath}`);
    }
    const info = await lstat(absolute);
    if (info.isSymbolicLink()) throw new Error(`runtime tree cannot contain symbolic links: ${relativePath}`);
    const portable = relativePath.replaceAll("\\", "/");
    if (info.isFile()) {
      records.push(`file:${portable}:${await sha256File(absolute)}`);
      return;
    }
    if (!info.isDirectory()) throw new Error(`runtime tree contains an unsupported entry: ${relativePath}`);
    records.push(`dir:${portable}`);
    for (const entry of (await readdir(absolute)).sort()) await visit(path.join(relativePath, entry));
  }
  for (const relativePath of requiredRuntimePaths) await visit(relativePath);
  return createHash("sha256").update(records.join("\n"), "utf8").digest("hex");
}

function runtimePathsFromManifest(manifest) {
  if (String(manifest.schema_version) !== "1.1") throw new Error("manifest schema_version must be 1.1");
  if (manifest.integration_id !== INTEGRATION_ID) throw new Error(`manifest integration_id must be ${INTEGRATION_ID}`);
  const runtimeTree = manifest.runtime_tree;
  if (!runtimeTree || typeof runtimeTree !== "object" || Array.isArray(runtimeTree)) {
    throw new Error("manifest.runtime_tree must be an object");
  }
  if (runtimeTree.algorithm !== RUNTIME_TREE_ALGORITHM) {
    throw new Error(`manifest.runtime_tree.algorithm must be ${RUNTIME_TREE_ALGORITHM}`);
  }
  if (!Array.isArray(runtimeTree.paths) || runtimeTree.paths.length === 0) {
    throw new Error("manifest.runtime_tree.paths must be a non-empty array");
  }
  const paths = runtimeTree.paths.map((entry, index) => {
    const relativePath = required(entry, `manifest.runtime_tree.paths[${index}]`);
    if (path.isAbsolute(relativePath)) throw new Error("manifest.runtime_tree paths must be relative");
    const normalizedPath = path.normalize(relativePath);
    if (normalizedPath === ".." || normalizedPath.startsWith(`..${path.sep}`)) {
      throw new Error("manifest.runtime_tree paths must stay inside runtime_root");
    }
    return relativePath.replaceAll("\\", "/");
  });
  if (new Set(paths).size !== paths.length) throw new Error("manifest.runtime_tree.paths must be unique");
  const requiredPaths = [
    manifest.dispatcher,
    manifest.external_agent_catalog?.index,
    manifest.external_agent_catalog?.metadata_index,
    manifest.external_agent_catalog?.prompts,
  ].map((entry, index) => required(entry, `manifest required runtime path ${index}`).replaceAll("\\", "/"));
  for (const requiredPath of requiredPaths) {
    if (!paths.includes(requiredPath)) throw new Error(`manifest.runtime_tree.paths must include ${requiredPath}`);
  }
  return paths;
}

async function nearestExistingAncestor(target) {
  let current = path.resolve(target);
  while (!await exists(current)) {
    const parent = path.dirname(current);
    if (parent === current) throw new Error(`cannot locate an existing ancestor for ${target}`);
    current = parent;
  }
  return current;
}

async function assertCanonicalExistingPath(target, label) {
  const existingAncestor = await nearestExistingAncestor(target);
  const info = await lstat(existingAncestor);
  if (info.isSymbolicLink()) throw new Error(`${label} cannot use a symbolic link, junction, or reparse point`);
  const canonical = await realpath(existingAncestor);
  if (normalized(canonical) !== normalized(existingAncestor)) {
    throw new Error(`${label} cannot traverse a symbolic link, junction, reparse point, or non-canonical path`);
  }
}

async function assertSafeTargetPath(codexHome, target, label) {
  const resolved = path.resolve(target);
  if (!isWithin(codexHome, resolved)) throw new Error(`${label} must stay inside canonical CodexHome`);
  await assertCanonicalExistingPath(resolved, label);
  const relative = path.relative(codexHome, resolved);
  let current = codexHome;
  for (const component of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, component);
    if (!await exists(current)) break;
    const info = await lstat(current);
    if (info.isSymbolicLink()) throw new Error(`${label} cannot use a symbolic link, junction, or reparse point`);
    const canonical = await realpath(current);
    if (normalized(canonical) !== normalized(current)) {
      throw new Error(`${label} cannot traverse a symbolic link, junction, reparse point, or non-canonical path`);
    }
  }
}

async function ensureCanonicalDirectory(codexHome, target) {
  if (!isWithin(codexHome, target)) throw new Error("directory creation must stay inside canonical CodexHome");
  const existingAncestor = await nearestExistingAncestor(target);
  if (!isWithin(codexHome, existingAncestor) && normalized(existingAncestor) !== normalized(codexHome)) {
    throw new Error("directory creation cannot start outside canonical CodexHome");
  }
  const relative = path.relative(existingAncestor, target);
  let current = existingAncestor;
  for (const component of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, component);
    if (!await exists(current)) {
      try {
        await mkdir(current);
      } catch (error) {
        if (error.code !== "EEXIST") throw error;
      }
    }
    const info = await lstat(current);
    if (info.isSymbolicLink() || !info.isDirectory()) {
      throw new Error("created path cannot contain a symbolic link, junction, reparse point, or non-directory");
    }
    const canonical = await realpath(current);
    if (normalized(canonical) !== normalized(current) || !isWithin(codexHome, canonical)) {
      throw new Error("created path escaped canonical CodexHome");
    }
  }
}

async function atomicWriteJson(filePath, value) {
  const temporary = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  const previous = `${filePath}.previous`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rm(previous, { force: true });
  const hadPrevious = await exists(filePath);
  if (hadPrevious) await rename(filePath, previous);
  try {
    await rename(temporary, filePath);
  } catch (error) {
    if (hadPrevious && !await exists(filePath) && await exists(previous)) await rename(previous, filePath);
    throw error;
  }
  await rm(previous, { force: true });
}

function processIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

async function readLockOwner(lockPath) {
  try {
    return JSON.parse(await readFile(path.join(lockPath, "owner.json"), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT" || error instanceof SyntaxError) return null;
    throw error;
  }
}

async function acquireInstallLock(codexHome) {
  const lockPath = path.join(codexHome, INSTALL_LOCK_DIRECTORY);
  const token = randomUUID();
  const candidatePath = `${lockPath}.candidate-${token}`;
  const owner = { schema_version: "1.0", integration_id: INTEGRATION_ID, token, pid: process.pid, started_at: new Date().toISOString() };
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await mkdir(candidatePath);
      await atomicWriteJson(path.join(candidatePath, "owner.json"), owner);
      if (process.env.BOSSCODING_INSTALL_TESTING === "1" && process.env.BOSSCODING_INSTALL_FAIL_BEFORE_LOCK_PUBLISH === "1") {
        const canonicalTemp = await realpath(os.tmpdir());
        if (!isWithin(canonicalTemp, codexHome)) throw new Error("installer fault injection is restricted to the OS temporary directory");
        process.exit(87);
      }
      await rename(candidatePath, lockPath);
      return { lockPath, token };
    } catch (error) {
      if (await exists(candidatePath)) await rm(candidatePath, { recursive: true, force: true });
      if (!await exists(lockPath)) throw error;
      let existing = await readLockOwner(lockPath);
      if (!existing) {
        await delay(40);
        existing = await readLockOwner(lockPath);
      }
      if (!existing || processIsAlive(Number(existing.pid))) {
        throw new Error("installation is active or the installation lock has a live owner");
      }
      const quarantine = `${lockPath}.stale-${existing.token ?? randomUUID()}`;
      try {
        await rename(lockPath, quarantine);
      } catch (renameError) {
        if (renameError.code === "ENOENT") continue;
        throw renameError;
      }
      const movedOwner = await readLockOwner(quarantine);
      if (movedOwner?.token !== existing.token) {
        throw new Error("installation lock ownership changed during stale recovery");
      }
      await rm(quarantine, { recursive: true, force: true });
    }
  }
  throw new Error("unable to acquire installation ownership lock");
}

async function releaseInstallLock(lock) {
  const owner = await readLockOwner(lock.lockPath);
  if (!owner || owner.token !== lock.token || Number(owner.pid) !== process.pid) {
    throw new Error("installation lock ownership changed before release");
  }
  await rm(lock.lockPath, { recursive: true, force: true });
}

function overlayBlock(source) {
  const body = source.trim();
  if (!body) throw new Error("global Agent overlay source is empty");
  if (body.includes(OVERLAY_BEGIN) || body.includes(OVERLAY_END)) {
    throw new Error("global Agent overlay source must not contain installer boundary markers");
  }
  return `${OVERLAY_BEGIN}\n${body}\n${OVERLAY_END}`;
}

function insertBlock(existing, index, block) {
  const before = existing.slice(0, index);
  const after = existing.slice(index);
  const beforeSeparator = before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n";
  return `${before}${beforeSeparator}${block}\n\n${after}`;
}

function installOverlay(existing, source) {
  const block = overlayBlock(source);
  const beginCount = existing.split(OVERLAY_BEGIN).length - 1;
  const endCount = existing.split(OVERLAY_END).length - 1;
  if (beginCount !== endCount || beginCount > 1) {
    throw new Error("global AGENTS overlay boundaries are incomplete or duplicated");
  }
  if (beginCount === 1) {
    const start = existing.indexOf(OVERLAY_BEGIN);
    const endMarker = existing.indexOf(OVERLAY_END, start);
    if (endMarker < start) throw new Error("global AGENTS overlay boundaries are out of order");
    return `${existing.slice(0, start)}${block}${existing.slice(endMarker + OVERLAY_END.length)}`;
  }

  const legacy = /^## BossCoding 默认协作方式[\t ]*(?:\r?\n|$)/m.exec(existing);
  if (legacy) {
    const sectionBodyStart = legacy.index + legacy[0].length;
    const nextHeading = /^#{1,2}[\t ]+.+(?:\r?\n|$)/m.exec(existing.slice(sectionBodyStart));
    const insertionIndex = nextHeading ? sectionBodyStart + nextHeading.index : existing.length;
    return insertBlock(existing, insertionIndex, block);
  }

  if (!existing) return `${block}\n`;
  return insertBlock(existing, existing.length, block).replace(/\n\n$/, "\n");
}

function unmanagedAgentsText(existing) {
  const beginCount = existing.split(OVERLAY_BEGIN).length - 1;
  const endCount = existing.split(OVERLAY_END).length - 1;
  if (beginCount !== endCount || beginCount > 1) {
    throw new Error("global AGENTS overlay boundaries are incomplete or duplicated");
  }
  if (beginCount === 0) return existing;
  const start = existing.indexOf(OVERLAY_BEGIN);
  const endMarker = existing.indexOf(OVERLAY_END, start);
  if (endMarker < start) throw new Error("global AGENTS overlay boundaries are out of order");
  return `${existing.slice(0, start)}${existing.slice(endMarker + OVERLAY_END.length)}`;
}

function assertNoKnownLegacyApprovalConflict(existing) {
  const unmanaged = unmanagedAgentsText(existing).replace(/\s+/g, "");
  const knownLegacyRule = /任何文件写入[（(]包括临时文件和会产生文件的验证命令[）)]、子Agent[／/]新对话、Git分支[／/]暂存[／/]提交[／/]合并，以及系统或外部状态变更，都要先展示精确批次、影响和验证方式并取得批准/;
  if (knownLegacyRule.test(unmanaged)) {
    throw new Error("known legacy absolute write-approval rule found in unmanaged global AGENTS text");
  }
}

function allowedTargets(codexHome) {
  return new Set([
    ...SKILLS.map((skill) => normalized(path.join(codexHome, "skills", skill))),
    normalized(path.join(codexHome, "AGENTS.md")),
    normalized(path.join(codexHome, "runtime", "bosscoding", "runtime.json")),
  ]);
}

async function rollbackTransaction(codexHome, transactionRoot, journal) {
  const allowed = allowedTargets(codexHome);
  const conflicts = [];
  const preservedDrifts = [];
  const preservedLateArrivals = [];
  for (const [reverseIndex, entry] of [...journal.entries].reverse().entries()) {
    const target = path.resolve(entry.target);
    const staged = path.resolve(entry.staged);
    const backup = path.resolve(entry.backup);
    if (!allowed.has(normalized(target))) throw new Error(`recovery journal contains an unauthorized target: ${target}`);
    if (!isWithin(transactionRoot, staged) || !isWithin(transactionRoot, backup)) {
      throw new Error("recovery journal contains a path outside its transaction directory");
    }
    const originalIndex = journal.entries.length - 1 - reverseIndex;
    const backupExists = await exists(backup);
    const stagedExists = await exists(staged);
    const current = await targetSnapshot(target);
    const original = {
      exists: Boolean(entry.had_target),
      kind: entry.original_kind ?? null,
      digest: entry.original_digest ?? null,
    };
    const installed = { exists: true, kind: entry.kind, digest: entry.expected_digest };
    const knownInjectedCorruption = entry.rollback_safe_digest
      ? { exists: true, kind: entry.kind, digest: entry.rollback_safe_digest }
      : null;

    // A physical backup is authoritative even if the process died before its
    // journal flag was persisted. Never discard it based only on stale flags.
    if (backupExists) {
      const backupSnapshot = await targetSnapshot(backup);
      const backupMatchesOriginal = sameSnapshot(backupSnapshot, original);
      if (current.exists) {
        if (sameSnapshot(current, installed) || (knownInjectedCorruption && sameSnapshot(current, knownInjectedCorruption))) {
          if (stagedExists && entry.target_installed !== true) {
            conflicts.push(target);
            continue;
          }
          await rm(target, { recursive: true, force: true });
        } else {
          conflicts.push(target);
          continue;
        }
      }
      await ensureCanonicalDirectory(codexHome, path.dirname(target));
      await rename(backup, target);
      if (!backupMatchesOriginal) preservedDrifts.push(target);
      continue;
    }

    const legacyEntry = entry.target_installed === undefined && entry.backup_created === undefined;
    const legacyCommitted = legacyEntry && originalIndex < Number(journal.committed_count ?? 0);
    const journalSaysInstalled = entry.target_installed === true || legacyCommitted;
    if (!original.exists && current.exists && sameSnapshot(current, installed)) {
      const publishedByThisTransaction = journalSaysInstalled
        || !stagedExists
        || (entry.kind === "file" && await samePhysicalFile(staged, target));
      if (publishedByThisTransaction) await rm(target, { recursive: true, force: true });
      else preservedLateArrivals.push(target);
      continue;
    }
    if (!original.exists && current.exists) {
      // This target appeared after the original absent snapshot and was not
      // published by this transaction. Leave the external content exactly
      // where it appeared; rollback only owns content whose digest matches the
      // staged installation.
      preservedLateArrivals.push(target);
      continue;
    }
    if (original.exists && journalSaysInstalled && !sameSnapshot(current, original)) {
      conflicts.push(target);
      continue;
    }
    if (original.exists && !current.exists) {
      conflicts.push(target);
    }
  }
  if (conflicts.length) {
    throw new Error(`rollback conflict: externally modified target(s) preserved; manual recovery required: ${conflicts.join(", ")}`);
  }
  await rm(transactionRoot, { recursive: true, force: true });
  if (preservedDrifts.length) {
    throw new Error(`rollback preserved target drift recovered from physical backup: ${preservedDrifts.join(", ")}`);
  }
  if (preservedLateArrivals.length) {
    throw new Error(`rollback stopped after externally created target(s) were preserved in place: ${preservedLateArrivals.join(", ")}`);
  }
}

async function readTransactionJournal(transactionRoot) {
  for (const name of ["journal.json", "journal.json.previous"]) {
    try {
      return JSON.parse(await readFile(path.join(transactionRoot, name), "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT" && !(error instanceof SyntaxError)) throw error;
    }
  }
  return null;
}

async function recoverInterruptedTransactions(codexHome) {
  const transactionParent = path.join(codexHome, TRANSACTION_DIRECTORY);
  if (!await exists(transactionParent)) return 0;
  await assertSafeTargetPath(codexHome, transactionParent, "transaction directory");
  const parentInfo = await lstat(transactionParent);
  if (!parentInfo.isDirectory()) throw new Error("transaction path must be a directory");
  let recovered = 0;
  for (const entryName of (await readdir(transactionParent)).sort()) {
    const transactionRoot = path.join(transactionParent, entryName);
    const info = await lstat(transactionRoot);
    if (info.isSymbolicLink() || !info.isDirectory()) throw new Error("transaction directory contains an unsupported entry");
    const journal = await readTransactionJournal(transactionRoot);
    if (!journal) {
      await rm(transactionRoot, { recursive: true, force: true });
      recovered += 1;
      continue;
    }
    if (journal.integration_id !== INTEGRATION_ID || journal.schema_version !== "1.0" || !Array.isArray(journal.entries)) {
      throw new Error("invalid interrupted installation journal");
    }
    if (journal.phase === "committed") await rm(transactionRoot, { recursive: true, force: true });
    else {
      await rollbackTransaction(codexHome, transactionRoot, journal);
      recovered += 1;
    }
  }
  try {
    await rmdir(transactionParent);
  } catch (error) {
    if (!new Set(["ENOENT", "ENOTEMPTY", "EEXIST"]).has(error.code)) throw error;
  }
  return recovered;
}

async function readExistingFile(filePath, label) {
  if (!await exists(filePath)) return null;
  const info = await lstat(filePath);
  if (info.isSymbolicLink() || !info.isFile()) throw new Error(`${label} must be a regular file`);
  return readFile(filePath, "utf8");
}

async function sourceFingerprint(sourceRoot) {
  const integrationRoot = path.join(sourceRoot, "integrations", "codex-native");
  const manifestPath = path.join(integrationRoot, "manifest.json");
  const overlayPath = path.join(integrationRoot, "global-agents-overlay.md");
  await assertRegularTree(integrationRoot);
  const manifestText = await readFile(manifestPath, "utf8");
  const manifest = JSON.parse(manifestText);
  const runtimePaths = runtimePathsFromManifest(manifest);
  if (JSON.stringify(manifest.skills) !== JSON.stringify(SKILLS)) {
    throw new Error(`manifest skills must be exactly: ${SKILLS.join(", ")}`);
  }
  for (const relativePath of runtimePaths) await assertRegularTree(path.join(sourceRoot, relativePath));
  const dispatcherPath = path.join(sourceRoot, required(manifest.dispatcher, "manifest.dispatcher"));
  const overlay = await readFile(overlayPath, "utf8");
  const skillDigests = {};
  for (const skill of SKILLS) {
    const source = path.join(integrationRoot, "skills", skill);
    await assertRegularTree(source);
    skillDigests[skill] = await treeDigest(source);
  }
  const values = {
    manifest_sha256: sha256Text(manifestText),
    dispatcher_sha256: await sha256File(dispatcherPath),
    runtime_tree_sha256: await runtimeTreeDigest(sourceRoot, runtimePaths),
    overlay_sha256: sha256Text(overlay),
    skill_digests: skillDigests,
  };
  return {
    integrationRoot,
    manifestPath,
    dispatcherPath,
    overlayPath,
    overlay,
    manifest,
    runtimePaths,
    values,
    digest: sha256Text(JSON.stringify(values)),
  };
}

async function preflight(sourceRoot, codexHome) {
  const source = await sourceFingerprint(sourceRoot);
  const { integrationRoot, manifestPath, dispatcherPath, manifest, runtimePaths } = source;

  const agentsPath = path.join(codexHome, "AGENTS.md");
  const existingAgents = await readExistingFile(agentsPath, "global AGENTS target") ?? "";
  assertNoKnownLegacyApprovalConflict(existingAgents);
  const desiredAgents = installOverlay(existingAgents, source.overlay);
  const descriptorPath = path.join(codexHome, "runtime", "bosscoding", "runtime.json");
  const descriptor = {
    schema_version: "1.1",
    integration_id: INTEGRATION_ID,
    runtime_root: sourceRoot,
    manifest: { path: "integrations/codex-native/manifest.json", sha256: source.values.manifest_sha256 },
    dispatcher: { path: manifest.dispatcher, sha256: source.values.dispatcher_sha256 },
    runtime_tree: {
      algorithm: RUNTIME_TREE_ALGORITHM,
      paths: manifest.runtime_tree.paths,
      sha256: source.values.runtime_tree_sha256,
    },
  };
  const descriptorText = `${JSON.stringify(descriptor, null, 2)}\n`;

  const entries = [];
  for (const skill of SKILLS) {
    const skillSource = path.join(integrationRoot, "skills", skill);
    const target = path.join(codexHome, "skills", skill);
    await assertRegularTree(skillSource);
    await assertSafeTargetPath(codexHome, target, `Skill target ${skill}`);
    const original = await targetSnapshot(target);
    if (source.values.skill_digests[skill] !== original.digest) entries.push({ kind: "directory", source: skillSource, target, change: `skill:${skill}`, original });
  }
  for (const [target, content, change, label] of [
    [agentsPath, desiredAgents, "global-agents-overlay", "global AGENTS target"],
    [descriptorPath, descriptorText, "runtime-descriptor", "runtime descriptor target"],
  ]) {
    await assertSafeTargetPath(codexHome, target, label);
    const previous = await readExistingFile(target, label);
    const original = previous === null
      ? { exists: false, kind: null, digest: null }
      : { exists: true, kind: "file", digest: sha256Text(previous) };
    if (previous !== content) entries.push({ kind: "file", content, target, change, original });
  }
  await assertSafeTargetPath(codexHome, path.join(codexHome, TRANSACTION_DIRECTORY), "transaction directory");
  return { agentsPath, descriptorPath, entries, source_digest: source.digest };
}

async function entryDigest(target, kind) {
  return kind === "directory" ? treeDigest(target) : (await exists(target) ? sha256File(target) : null);
}

async function targetSnapshot(target) {
  if (!await exists(target)) return { exists: false, kind: null, digest: null };
  const info = await lstat(target);
  if (info.isSymbolicLink()) throw new Error(`installation target cannot be a symbolic link, junction, or reparse point: ${target}`);
  if (info.isDirectory()) return { exists: true, kind: "directory", digest: await treeDigest(target) };
  if (info.isFile()) return { exists: true, kind: "file", digest: await sha256File(target) };
  throw new Error(`installation target has an unsupported type: ${target}`);
}

function sameSnapshot(left, right) {
  return Boolean(left?.exists) === Boolean(right?.exists)
    && (left?.kind ?? null) === (right?.kind ?? null)
    && (left?.digest ?? null) === (right?.digest ?? null);
}

async function assertOriginalTargetUnchanged(entry) {
  const current = await targetSnapshot(entry.target);
  if (!sameSnapshot(current, entry.original)) {
    throw new Error(`concurrent target drift detected before installation commit: ${entry.target}`);
  }
}

async function installStagedExclusive(entry) {
  try {
    if (entry.kind === "directory") await rename(entry.staged, entry.target);
    else {
      await link(entry.staged, entry.target);
      await rm(entry.staged, { force: true });
    }
  } catch (error) {
    if (new Set(["EEXIST", "EPERM", "ENOTEMPTY"]).has(error.code)) {
      throw new Error(`concurrent target drift detected during installation commit: ${entry.target}`, { cause: error });
    }
    throw error;
  }
  if (await entryDigest(entry.target, entry.kind) !== entry.expected_digest) {
    throw new Error(`installed target does not match staged content: ${entry.target}`);
  }
  await rm(entry.staged, { recursive: true, force: true });
}

async function stageAndCommit(codexHome, sourceRoot, entries, expectedSourceDigest) {
  if (entries.length === 0) return;
  const transactionParent = path.join(codexHome, TRANSACTION_DIRECTORY);
  await ensureCanonicalDirectory(codexHome, transactionParent);
  const transactionRoot = path.join(transactionParent, `${Date.now()}-${process.pid}-${randomUUID()}`);
  const stagedRoot = path.join(transactionRoot, "staged");
  const backupRoot = path.join(transactionRoot, "backups");
  await mkdir(transactionRoot);
  await mkdir(stagedRoot);
  await mkdir(backupRoot);

  const journalPath = path.join(transactionRoot, "journal.json");
  const journal = { schema_version: "1.0", integration_id: INTEGRATION_ID, phase: "staging", committed_count: 0, entries: [] };
  let commitComplete = false;
  try {
    await atomicWriteJson(journalPath, journal);
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      const staged = path.join(stagedRoot, String(index));
      const backup = path.join(backupRoot, String(index));
      if (entry.kind === "directory") await cp(entry.source, staged, { recursive: true, force: false, errorOnExist: true });
      else await writeFile(staged, entry.content, "utf8");
      journal.entries.push({
        target: entry.target,
        staged,
        backup,
        kind: entry.kind,
        had_target: entry.original.exists,
        original_kind: entry.original.kind,
        original_digest: entry.original.digest,
        expected_digest: await entryDigest(staged, entry.kind),
        backup_created: false,
        target_installed: false,
      });
      await atomicWriteJson(journalPath, journal);
    }
    journal.phase = "prepared";
    await atomicWriteJson(journalPath, journal);

    const testMode = process.env.BOSSCODING_INSTALL_TESTING === "1";
    const failAfter = Number(process.env.BOSSCODING_INSTALL_FAIL_AFTER ?? 0);
    const failMode = process.env.BOSSCODING_INSTALL_FAIL_MODE ?? "";
    const holdAfterSnapshotMs = Number(process.env.BOSSCODING_INSTALL_HOLD_AFTER_SNAPSHOT_MS ?? 0);
    const holdBeforeTargetRenameMs = Number(process.env.BOSSCODING_INSTALL_HOLD_BEFORE_TARGET_RENAME_MS ?? 0);
    const holdAfterEachCommitMs = Number(process.env.BOSSCODING_INSTALL_HOLD_AFTER_EACH_COMMIT_MS ?? 0);
    const holdAfterCommitMs = Number(process.env.BOSSCODING_INSTALL_HOLD_AFTER_COMMIT_MS ?? 0);
    const failAfterBackupRename = Number(process.env.BOSSCODING_INSTALL_FAIL_AFTER_BACKUP_RENAME ?? 0);
    const failAfterTargetRename = Number(process.env.BOSSCODING_INSTALL_FAIL_AFTER_TARGET_RENAME ?? 0);
    const failBeforeNewTargetPublish = Number(process.env.BOSSCODING_INSTALL_FAIL_BEFORE_NEW_TARGET_PUBLISH ?? 0);
    const corruptAfterCommit = process.env.BOSSCODING_INSTALL_CORRUPT_AFTER_COMMIT === "1";
    if (testMode) {
      const canonicalTemp = await realpath(os.tmpdir());
      if (!isWithin(canonicalTemp, codexHome)) throw new Error("installer fault injection is restricted to the OS temporary directory");
      const failInjectionValid = failAfter === 0 && failMode === ""
        || Number.isInteger(failAfter) && failAfter >= 1 && new Set(["error", "interrupt"]).has(failMode);
      const renameInjectionValid = [failAfterBackupRename, failAfterTargetRename, failBeforeNewTargetPublish]
        .every((value) => Number.isInteger(value) && value >= 0);
      if (!failInjectionValid
        || !renameInjectionValid
        || ![holdAfterSnapshotMs, holdBeforeTargetRenameMs, holdAfterEachCommitMs, holdAfterCommitMs]
          .every((value) => Number.isFinite(value) && value >= 0)) {
        throw new Error("invalid installer fault injection settings");
      }
    }

    if (testMode) await writeFile(path.join(transactionRoot, "snapshot.ready"), "ready\n", "utf8");
    if (testMode && holdAfterSnapshotMs > 0) await delay(holdAfterSnapshotMs);
    const currentSource = await sourceFingerprint(sourceRoot);
    if (currentSource.digest !== expectedSourceDigest) throw new Error("source drift detected after staging snapshot");
    for (const entry of entries) await assertOriginalTargetUnchanged(entry);

    journal.phase = "committing";
    await atomicWriteJson(journalPath, journal);
    let committed = 0;
    for (const entry of journal.entries) {
      const preparedEntry = entries[committed];
      await assertOriginalTargetUnchanged(preparedEntry);
      await ensureCanonicalDirectory(codexHome, path.dirname(entry.target));
      entry.phase = "committing";
      await atomicWriteJson(journalPath, journal);
      if (testMode) await writeFile(path.join(transactionRoot, `pre-rename-${committed + 1}.ready`), "ready\n", "utf8");
      if (testMode && holdBeforeTargetRenameMs > 0) await delay(holdBeforeTargetRenameMs);
      if (entry.had_target) {
        await rename(entry.target, entry.backup);
        if (testMode && committed + 1 === failAfterBackupRename) process.exit(88);
        const backupSnapshot = await targetSnapshot(entry.backup);
        const originalSnapshot = {
          exists: true,
          kind: entry.original_kind,
          digest: entry.original_digest,
        };
        if (!sameSnapshot(backupSnapshot, originalSnapshot)) {
          if (!await exists(entry.target)) await rename(entry.backup, entry.target);
          throw new Error(`backup does not match original snapshot; concurrent target drift preserved: ${entry.target}`);
        }
        entry.backup_created = true;
        await atomicWriteJson(journalPath, journal);
      }
      if (testMode && !entry.had_target && committed + 1 === failBeforeNewTargetPublish) process.exit(90);
      await installStagedExclusive(entry);
      if (testMode && committed + 1 === failAfterTargetRename) process.exit(89);
      entry.target_installed = true;
      entry.phase = "installed";
      committed += 1;
      journal.committed_count = committed;
      await atomicWriteJson(journalPath, journal);
      if (testMode) await writeFile(path.join(transactionRoot, `commit-${committed}.ready`), "ready\n", "utf8");
      if (testMode && holdAfterEachCommitMs > 0) await delay(holdAfterEachCommitMs);
      if (testMode && committed === failAfter) {
        if (failMode === "interrupt") process.exit(86);
        throw new Error(`injected commit failure after ${committed} entries`);
      }
    }

    if (testMode) await writeFile(path.join(transactionRoot, "commit.complete"), "ready\n", "utf8");
    if (testMode && holdAfterCommitMs > 0) await delay(holdAfterCommitMs);

    if (testMode && corruptAfterCommit) {
      const first = journal.entries[0];
      if (first.kind === "directory") await writeFile(path.join(first.target, ".injected-corruption"), "corrupt\n", "utf8");
      else await writeFile(first.target, "corrupt\n", "utf8");
      first.rollback_safe_digest = await entryDigest(first.target, first.kind);
      await atomicWriteJson(journalPath, journal);
    }
    for (const entry of journal.entries) {
      if (await entryDigest(entry.target, entry.kind) !== entry.expected_digest) {
        throw new Error(`post-commit verification failed for ${entry.target}`);
      }
      if (entry.had_target) {
        const backupSnapshot = await targetSnapshot(entry.backup);
        const originalSnapshot = { exists: true, kind: entry.original_kind, digest: entry.original_digest };
        if (!sameSnapshot(backupSnapshot, originalSnapshot)) {
          throw new Error(`backup drift detected before installation finalization: ${entry.target}`);
        }
      }
    }
    const postCommitSource = await sourceFingerprint(sourceRoot);
    if (postCommitSource.digest !== expectedSourceDigest) throw new Error("source drift detected after commit");
    journal.phase = "committed";
    await atomicWriteJson(journalPath, journal);
    commitComplete = true;
    try {
      await rm(transactionRoot, { recursive: true, force: true });
      await rmdir(transactionParent);
    } catch (error) {
      if (!new Set(["ENOENT", "ENOTEMPTY", "EEXIST"]).has(error.code)) {
        console.error(`Installation committed; deferred transaction cleanup: ${error.message}`);
      }
    }
  } catch (error) {
    if (!commitComplete) await rollbackTransaction(codexHome, transactionRoot, journal);
    throw error;
  }
}

async function main() {
  const options = argsToObject(process.argv.slice(2));
  const requestedCodexHome = path.resolve(required(options.codexHome, "codex-home"));
  await assertCanonicalExistingPath(requestedCodexHome, "CodexHome");
  const existingAncestor = await nearestExistingAncestor(requestedCodexHome);
  const canonicalAncestor = await realpath(existingAncestor);
  const codexHome = path.resolve(canonicalAncestor, path.relative(existingAncestor, requestedCodexHome));
  if (normalized(codexHome) !== normalized(requestedCodexHome)) {
    throw new Error("CodexHome cannot traverse a symbolic link, junction, reparse point, or non-canonical path");
  }

  const codexHomeExists = await exists(codexHome);
  if (codexHomeExists) {
    const existingAgents = await readExistingFile(path.join(codexHome, "AGENTS.md"), "global AGENTS target") ?? "";
    assertNoKnownLegacyApprovalConflict(existingAgents);
  }

  if (!codexHomeExists) {
    const parent = await nearestExistingAncestor(codexHome);
    const parentCanonical = await realpath(parent);
    const relative = path.relative(parent, codexHome);
    let current = parentCanonical;
    for (const component of relative.split(path.sep).filter(Boolean)) {
      current = path.join(current, component);
      if (!await exists(current)) await mkdir(current);
      const actual = await realpath(current);
      if (normalized(actual) !== normalized(current)) throw new Error("CodexHome creation escaped its canonical path");
    }
  }

  const lock = await acquireInstallLock(codexHome);
  let response;
  try {
    const testMode = process.env.BOSSCODING_INSTALL_TESTING === "1";
    const holdAfterLockMs = Number(process.env.BOSSCODING_INSTALL_HOLD_AFTER_LOCK_MS ?? 0);
    if (testMode) {
      const canonicalTemp = await realpath(os.tmpdir());
      if (!isWithin(canonicalTemp, codexHome)) throw new Error("installer fault injection is restricted to the OS temporary directory");
      if (!Number.isFinite(holdAfterLockMs) || holdAfterLockMs < 0) throw new Error("invalid installer lock hold setting");
      if (holdAfterLockMs > 0) await delay(holdAfterLockMs);
    }

    const existingAgents = await readExistingFile(path.join(codexHome, "AGENTS.md"), "global AGENTS target") ?? "";
    assertNoKnownLegacyApprovalConflict(existingAgents);

    const recovered = await recoverInterruptedTransactions(codexHome);
    if (recovered > 0) console.error(`Recovered interrupted installation batch(es): ${recovered}`);

    const sourceRoot = await realpath(path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."));
    const prepared = await preflight(sourceRoot, codexHome);
    if (prepared.entries.length > 0) {
      await stageAndCommit(codexHome, sourceRoot, prepared.entries, prepared.source_digest);
    }
    const finalSource = await sourceFingerprint(sourceRoot);
    if (finalSource.digest !== prepared.source_digest) throw new Error("source drift detected after installation preflight");
    response = {
      ok: true,
      integration_id: INTEGRATION_ID,
      runtime_root: sourceRoot,
      codex_home: codexHome,
      installed_skills: SKILLS,
      agents_path: prepared.agentsPath,
      descriptor_path: prepared.descriptorPath,
      changed: prepared.entries.length > 0,
      changes: prepared.entries.map((entry) => entry.change),
    };
  } finally {
    await releaseInstallLock(lock);
  }

  console.log(JSON.stringify(response, null, 2));
}

main().catch((error) => {
  console.error(`Codex-native installation failed: ${error.message}`);
  process.exitCode = 1;
});
