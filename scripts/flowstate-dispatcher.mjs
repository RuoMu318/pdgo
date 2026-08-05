#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import { FileQueueAdapter, FlowStateDispatcher, FlowStateStore } from "./lib/flowstate-dispatcher.mjs";
import { AgencyAgentsAdapter, ExternalAgentCatalog } from "./lib/external-agent-adapter.mjs";

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

async function readJson(filePath) {
  return JSON.parse(await readFile(path.resolve(filePath), "utf8"));
}

const options = argsToObject(process.argv.slice(2));
const action = options.action ?? process.argv.find((value) => !value.startsWith("-"));
if (!action) {
  console.error("Usage: node scripts/flowstate-dispatcher.mjs --action <create-plan|approve|dispatch|report|review|resolve-blocker|sync> --input <json> [--root <state-dir>] [--project <id>]");
  process.exit(2);
}

try {
  const root = path.resolve(options.root ?? ".flowstate");
  const projectId = options.project ?? "project";
  const store = new FlowStateStore({ root });
  const queueAdapter = new FileQueueAdapter({ root: path.join(root, "queue") });
  const externalIndex = path.resolve(options.externalIndex ?? path.join(process.cwd(), "integrations", "external-agents", "agency-agents", "index.json"));
  let adapter = queueAdapter;
  const externalAgentsEnabled = options.externalAgents !== false && String(options.externalAgents ?? "true").toLowerCase() !== "false";
  if (externalAgentsEnabled) {
    try {
      adapter = new AgencyAgentsAdapter({ catalog: new ExternalAgentCatalog({ root: process.cwd(), indexPath: path.relative(process.cwd(), externalIndex) }), baseAdapter: queueAdapter });
    } catch {
      adapter = queueAdapter;
    }
  }
  const dispatcher = new FlowStateDispatcher({ store, adapter, projectId });
  const input = options.input ? await readJson(options.input) : {};
  let result;
  if (action === "search-agents") result = await adapter.searchAgents({ query: options.query ?? input.query ?? "", division: options.division ?? input.division ?? null, limit: Number(options.limit ?? 10) });
  else if (action === "create-plan") result = await dispatcher.createPlan(input);
  else if (action === "approve") result = await dispatcher.approvePlan(input);
  else if (action === "dispatch") result = await dispatcher.dispatchReady(input);
  else if (action === "report") result = await dispatcher.ingestExecutionReport(input);
  else if (action === "review") result = await dispatcher.ingestPlanningReview(input);
  else if (action === "resolve-blocker") result = await dispatcher.resolveBlocker(input);
  else if (action === "sync") result = await dispatcher.syncParallelResult(input);
  else throw new Error(`Unknown action: ${action}`);
  console.log(JSON.stringify({ ok: true, action, ...result }, null, 2));
} catch (error) {
  console.error(`FlowState dispatch failed: ${error.message}`);
  process.exit(1);
}
