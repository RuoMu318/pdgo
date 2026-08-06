#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const USER_AGENT = "FlowState-external-agent-importer";

function argsToObject(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) result[key] = true;
    else { result[key] = value; index += 1; }
  }
  return result;
}

function parseBoolean(value, defaultValue = true) {
  if (value === undefined || value === null || value === true) return defaultValue;
  if (value === false) return false;
  const normalized = String(value).trim().toLowerCase();
  if (["false", "0", "no", "off"].includes(normalized)) return false;
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  throw new Error(`invalid boolean value: ${value}`);
}

function positiveInteger(value, defaultValue, name) {
  const parsed = value === undefined || value === null || value === true ? defaultValue : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error(`${name} must be a positive integer`);
  return parsed;
}

function safeProviderId(value) {
  const providerId = String(value ?? "");
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(providerId) || providerId === "." || providerId === "..") {
    throw new Error("provider must be a safe path segment");
  }
  return providerId;
}

function safeRepository(value) {
  const repository = String(value ?? "");
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    throw new Error("repo must be a GitHub owner/repository path");
  }
  return repository;
}

function safeRef(value) {
  const ref = String(value ?? "");
  if (!ref || ref.includes("..") || ref.includes("\\") || /[\u0000-\u001f\u007f]/.test(ref)) {
    throw new Error("ref contains an unsafe path segment");
  }
  return ref;
}

function safeRemotePath(value) {
  const filePath = String(value ?? "").replaceAll("\\", "/");
  const parts = filePath.split("/");
  if (!filePath || filePath.startsWith("/") || parts.some((part) => !part || part === "." || part === ".." || part.includes("\u0000"))) {
    throw new Error(`provider tree path is unsafe: ${value}`);
  }
  return filePath;
}

function parseFrontmatter(markdown) {
  const lines = markdown.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") return {};
  const result = {};
  for (const line of lines.slice(1)) {
    if (line.trim() === "---") break;
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) continue;
    result[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, "");
  }
  return result;
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/vnd.github+json" } });
  if (!response.ok) throw new Error(`GitHub request failed (${response.status}): ${url}`);
  return response.json();
}

async function fetchText(url) {
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!response.ok) throw new Error(`Source request failed (${response.status}): ${url}`);
  return response.text();
}

function isCandidatePath(filePath) {
  const parts = filePath.split("/");
  return filePath.endsWith(".md") && ![".github", "examples", "scripts", "docs"].includes(parts[0]) && !["CONTRIBUTING.md", "CONTRIBUTING_zh-CN.md", "SECURITY.md"].includes(parts.at(-1));
}

function markdown(provider, entries, divisions) {
  const lines = [
    "# External Agent Repository",
    "",
    `Provider: **${provider.provider_id}**`,
    `Source: [${provider.repository}](https://github.com/${provider.repository})`,
    `Imported ref: \`${provider.ref}\``,
    `Source commit: \`${provider.source_commit}\``,
    `Agents imported: **${entries.length}**`,
    "",
    "This catalog is an external Agent prompt source, not a replacement for PDGO governance. Every invocation still needs a classified scenario, approved dispatch, scope, evidence, report, and planning review.",
    "",
    "## Divisions",
    "",
    "| Division | Agents |",
    "|---|---:|",
  ];
  for (const [division, count] of Object.entries(divisions).sort(([left], [right]) => left.localeCompare(right))) lines.push(`| \`${division}\` | ${count} |`);
  lines.push("", "## Invocation", "", "1. Search `integrations/external-agents/agency-agents/index.json` by division, name, description, and routing terms.", "2. Select an Agent by scenario fit, not by name alone.", "3. Include `external_agent_id` in the approved task dispatch.", "4. The external adapter injects the cached prompt plus the PDGO dispatch contract into the worker session.", "5. Return the result as an ordinary execution report and let the planning controller review it.", "", "The cached prompt files retain their upstream paths, SHA, and source URL for auditability.", "");
  return `${lines.join("\n")}\n`;
}

const options = argsToObject(process.argv.slice(2));
const root = path.resolve(options.root ?? process.cwd());
const providerId = safeProviderId(options.provider ?? "agency-agents");
const repository = safeRepository(options.repo ?? "msitarzewski/agency-agents");
const ref = safeRef(options.ref ?? "main");
const download = parseBoolean(options.download, true);
const tree = await fetchJson(`https://api.github.com/repos/${repository}/git/trees/${encodeURIComponent(ref)}?recursive=1`);
if (!Array.isArray(tree.tree) || tree.truncated === true) throw new Error("GitHub provider tree is missing or truncated; refusing a partial Agent index");
const files = tree.tree
  .filter((entry) => entry.type === "blob" && isCandidatePath(entry.path))
  .map((entry) => ({ ...entry, path: safeRemotePath(entry.path) }));
if (!files.length) throw new Error("No agent Markdown files were found in the provider tree");

const destination = path.join(root, "integrations", "external-agents", providerId);
const promptRoot = path.join(destination, "prompts");
await mkdir(promptRoot, { recursive: true });
const entries = [];
const divisions = {};
const concurrency = positiveInteger(options.concurrency, 8, "concurrency");
for (let index = 0; index < files.length; index += concurrency) {
  const batch = files.slice(index, index + concurrency);
  const batchEntries = await Promise.all(batch.map(async (file) => {
    const sourceRefPath = ref.split("/").map(encodeURIComponent).join("/");
    const sourceUrl = `https://raw.githubusercontent.com/${repository}/${sourceRefPath}/${file.path.split("/").map(encodeURIComponent).join("/")}`;
    const text = await fetchText(sourceUrl);
    const metadata = parseFrontmatter(text);
    const division = file.path.split("/")[0];
    const agentName = metadata.name || path.basename(file.path, ".md");
    if (!metadata.name && !metadata.description) return null;
    const entry = {
      agent_id: `${providerId}/${file.path}`,
      provider_id: providerId,
      name: agentName,
      description: metadata.description || metadata.vibe || "External specialized Agent prompt.",
      division,
      vibe: metadata.vibe || "",
      source_path: file.path,
      source_url: sourceUrl,
      source_ref: ref,
      source_commit: tree.sha,
      source_sha: file.sha,
      routing_terms: [agentName, metadata.description, metadata.vibe, division].filter(Boolean),
      prompt_path: null,
    };
    if (download) {
      const promptPath = path.join(promptRoot, file.path);
      await mkdir(path.dirname(promptPath), { recursive: true });
      await writeFile(promptPath, text, "utf8");
      entry.prompt_path = path.relative(root, promptPath).replaceAll("\\", "/");
    }
    divisions[division] = (divisions[division] ?? 0) + 1;
    return entry;
  }));
  entries.push(...batchEntries.filter(Boolean));
}

entries.sort((left, right) => left.agent_id.localeCompare(right.agent_id));
const provider = {
  provider_id: providerId,
  repository,
  ref,
  source_commit: tree.sha,
  imported_at: new Date().toISOString(),
  agent_count: entries.length,
  cache_mode: download ? "prompt-cache" : "index-only",
};
await writeFile(path.join(destination, "index.json"), `${JSON.stringify({ schema_version: "1.0", provider, divisions, agents: entries }, null, 2)}\n`, "utf8");
await writeFile(path.join(destination, "provider.json"), `${JSON.stringify(provider, null, 2)}\n`, "utf8");
const licenseUrl = `https://raw.githubusercontent.com/${repository}/${ref}/LICENSE`;
try { await writeFile(path.join(destination, "LICENSE"), await fetchText(licenseUrl), "utf8"); } catch { /* Some providers expose license metadata elsewhere. */ }
await mkdir(path.join(root, "docs"), { recursive: true });
await writeFile(path.join(root, "docs", "external-agents.md"), markdown(provider, entries, divisions), "utf8");
console.log(JSON.stringify({ ok: true, provider: providerId, agents: entries.length, source_commit: tree.sha, cache_mode: provider.cache_mode }, null, 2));
