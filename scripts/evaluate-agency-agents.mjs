#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

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

function yamlScalar(value) {
  return JSON.stringify(String(value ?? ""));
}

function yamlList(values, indent = "  ") {
  const list = Array.isArray(values) ? values : [values];
  return list.length ? list.map((item) => `${indent}- ${yamlScalar(item)}`).join("\n") : `${indent}[]`;
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function parseFrontmatter(text) {
  const lines = text.split(/\r?\n/);
  const fields = {};
  if (lines[0]?.trim() !== "---") return { fields, body: text, lines };
  const end = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
  if (end < 0) return { fields, body: text, lines };
  for (const line of lines.slice(1, end)) {
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (match) fields[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, "");
  }
  return { fields, body: lines.slice(end + 1).join("\n"), lines };
}

function headings(body) {
  return body.split(/\r?\n/).filter((line) => /^#{1,4}\s+/.test(line)).map((line) => line.replace(/^#+\s+/, "").trim());
}

function firstParagraph(body) {
  return body.split(/\r?\n\s*\r?\n/).map((part) => part.replace(/^#+\s+[^\n]+\n?/, "").trim()).find((part) => part && !part.startsWith("- ")) ?? "";
}

function extractBullets(body, pattern) {
  const lines = body.split(/\r?\n/);
  const values = [];
  let active = false;
  for (const line of lines) {
    if (/^#{1,4}\s+/.test(line)) {
      active = pattern.test(line.replace(/^#+\s+/, ""));
      continue;
    }
    if (active && /^\s*[-*]\s+/.test(line)) values.push(line.replace(/^\s*[-*]\s+/, "").trim());
    if (active && !line.trim() && values.length) active = false;
  }
  return values.slice(0, 12);
}

function confidence(fields, body, headingList, inputs, outputs) {
  let score = 0;
  if (fields.name) score += 1;
  if (fields.description || fields.vibe) score += 2;
  if (headingList.length >= 3) score += 1;
  if (inputs.length) score += 1;
  if (outputs.length) score += 1;
  if (body.length >= 1200) score += 1;
  if (score >= 6) return "high";
  if (score >= 4) return "medium";
  return "low";
}

function stageCandidates(division, body) {
  const explicit = [];
  if (/(plan|strategy|research|discovery|roadmap|priorit)/i.test(body)) explicit.push("planning");
  if (/(implement|develop|build|engineer|create|design)/i.test(body)) explicit.push("implementation");
  if (/(test|audit|review|qa|quality|validate|security)/i.test(body)) explicit.push("validation");
  if (explicit.length) return [...new Set(explicit)];
  return ["unknown"];
}

function departmentCandidates(division) {
  if (["product", "project-management", "academic", "finance", "marketing", "paid-media", "sales"].includes(division)) return ["planning"];
  if (["testing", "security", "support"].includes(division)) return ["review"];
  if (["engineering", "design", "game-development", "gis", "spatial-computing", "integrations"].includes(division)) return ["execution"];
  return ["unknown"];
}

function skillCandidates(body, division) {
  const result = ["pdgo-route-work"];
  if (/(test|qa|audit|review|quality|validate)/i.test(body) || ["testing", "security"].includes(division)) result.push("pdgo-review-receive");
  if (/(debug|incident|failure|troubleshoot|root cause)/i.test(body)) result.push("pdgo-debug-work");
  if (/(implement|develop|build|engineer|create)/i.test(body)) result.push("pdgo-execute-work");
  return [...new Set(result)];
}

function metadataYaml(metadata) {
  const lines = ["schema_version: \"1.0\"", `agent_id: ${yamlScalar(metadata.agent_id)}`, `name: ${yamlScalar(metadata.name)}`, `division: ${yamlScalar(metadata.division)}`, `provider_id: ${yamlScalar(metadata.provider_id)}`, `source_path: ${yamlScalar(metadata.source_path)}`, `source_url: ${yamlScalar(metadata.source_url)}`, `source_ref: ${yamlScalar(metadata.source_ref)}`, `source_commit: ${yamlScalar(metadata.source_commit)}`, `source_sha: ${yamlScalar(metadata.source_sha)}`, `prompt_sha256: ${yamlScalar(metadata.prompt_sha256)}`, `specific_description: ${yamlScalar(metadata.specific_description)}`, `when_to_use: ${yamlScalar(metadata.when_to_use)}`, `when_not_to_use: ${yamlScalar(metadata.when_not_to_use)}`, "inputs:", yamlList(metadata.inputs), "outputs:", yamlList(metadata.outputs), "stage:", yamlList(metadata.stage), "department:", yamlList(metadata.department), "required_skills:", yamlList(metadata.required_skills), `confidence: ${yamlScalar(metadata.confidence)}`, `routing_mode: ${yamlScalar(metadata.routing_mode)}`, `auto_route: ${metadata.auto_route ? "true" : "false"}`, "evidence:", `  source_frontmatter_name: ${yamlScalar(metadata.evidence.source_frontmatter_name)}`, `  source_frontmatter_description: ${yamlScalar(metadata.evidence.source_frontmatter_description)}`, `  source_frontmatter_vibe: ${yamlScalar(metadata.evidence.source_frontmatter_vibe)}`, "  headings:", yamlList(metadata.evidence.headings, "    "), `  extraction: ${yamlScalar(metadata.evidence.extraction)}`];
  return `${lines.join("\n")}\n`;
}

async function main() {
  const options = argsToObject(process.argv.slice(2));
  const root = path.resolve(options.root ?? process.cwd());
  const integrationRoot = path.join(root, "integrations", "external-agents", "agency-agents");
  const indexPath = path.join(integrationRoot, "index.json");
  const index = JSON.parse(await readFile(indexPath, "utf8"));
  index.agents = index.agents.map((entry) => ({ ...entry, source_commit: entry.source_commit || index.provider.source_commit }));
  await writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`, "utf8");
  const metadataRoot = path.join(integrationRoot, "metadata");
  await mkdir(metadataRoot, { recursive: true });
  const summary = { schema_version: "1.0", provider_id: index.provider.provider_id, source_commit: index.provider.source_commit, generated_at: new Date().toISOString(), agent_count: index.agents.length, counts: { high: 0, medium: 0, low: 0, auto_route: 0, manual_only: 0 }, agents: [] };
  for (const entry of index.agents) {
    const promptPath = path.join(root, entry.prompt_path);
    const prompt = await readFile(promptPath, "utf8");
    const parsed = parseFrontmatter(prompt);
    const headingList = headings(parsed.body);
    const description = String(parsed.fields.description || parsed.fields.vibe || firstParagraph(parsed.body) || "unknown").trim();
    const inputs = extractBullets(parsed.body, /(input|context|provide|need|requirement)/i);
    const outputs = extractBullets(parsed.body, /(output|deliverable|report|result|artifact|acceptance)/i);
    const confidenceLevel = confidence(parsed.fields, parsed.body, headingList, inputs, outputs);
    const explicitInputs = inputs.length ? inputs : ["unknown: the source prompt does not declare structured inputs"];
    const explicitOutputs = outputs.length ? outputs : ["unknown: the source prompt does not declare structured outputs"];
    const stage = stageCandidates(entry.division, parsed.body);
    const department = departmentCandidates(entry.division);
    const autoRoute = confidenceLevel === "high" && inputs.length > 0 && outputs.length > 0 && description !== "unknown" && !stage.includes("unknown") && !department.includes("unknown");
    const metadata = {
      agent_id: entry.agent_id,
      provider_id: entry.provider_id,
      name: entry.name,
      division: entry.division,
      source_path: entry.source_path,
      source_url: entry.source_url,
      source_ref: entry.source_ref,
      source_commit: entry.source_commit || index.provider.source_commit,
      source_sha: entry.source_sha,
      prompt_sha256: sha256(prompt),
      specific_description: description,
      when_to_use: `Use only when the approved task explicitly matches the source description: ${description}`,
      when_not_to_use: "Do not use outside the source description, declared division, approved scope, or evidence contract.",
      inputs: explicitInputs,
      outputs: explicitOutputs,
      stage,
      department,
      required_skills: skillCandidates(parsed.body, entry.division),
      confidence: confidenceLevel,
      routing_mode: autoRoute ? "eligible-with-explicit-task-selector" : "manual-only",
      auto_route: autoRoute,
      evidence: { source_frontmatter_name: parsed.fields.name || "unknown", source_frontmatter_description: parsed.fields.description || "unknown", source_frontmatter_vibe: parsed.fields.vibe || "unknown", headings: headingList.slice(0, 40), extraction: "Description is copied from frontmatter; inputs and outputs require matching source headings; stage and Skill candidates use explicit lexical markers plus the upstream division. Unknown is used when evidence is absent; auto_route requires high confidence and structured inputs and outputs." },
    };
    const divisionRoot = path.join(metadataRoot, entry.division);
    await mkdir(divisionRoot, { recursive: true });
    const fileName = path.basename(entry.source_path, ".md") + ".yaml";
    await writeFile(path.join(divisionRoot, fileName), metadataYaml(metadata), "utf8");
    summary.agents.push({ agent_id: metadata.agent_id, name: metadata.name, division: metadata.division, confidence: metadata.confidence, routing_mode: metadata.routing_mode, auto_route: metadata.auto_route, metadata_path: path.relative(root, path.join(divisionRoot, fileName)).replaceAll("\\", "/"), source_sha: metadata.source_sha });
    summary.counts[confidenceLevel] += 1;
    summary.counts[autoRoute ? "auto_route" : "manual_only"] += 1;
  }
  summary.agents.sort((left, right) => left.agent_id.localeCompare(right.agent_id));
  await writeFile(path.join(integrationRoot, "metadata-index.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ ok: true, agent_count: summary.agent_count, counts: summary.counts, metadata_root: "integrations/external-agents/agency-agents/metadata" }, null, 2));
}

main().catch((error) => { console.error(`Agency Agent evaluation failed: ${error.message}`); process.exit(1); });
