#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FileQueueAdapter, FlowStateDispatcher, FlowStateRuntime, FlowStateStore } from "./lib/flowstate-dispatcher.mjs";
import { AgencyAgentsAdapter, ExternalAgentCatalog } from "./lib/external-agent-adapter.mjs";

const runtimeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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
const usage = "Usage: node scripts/flowstate-dispatcher.mjs --action <create-plan|bind-host-session|bind-host-worker|approve|dispatch|report|review|resume|watch|resolve-blocker|sync|search-agents> [--input <json>] --root <state-dir> --project <id> [--interval-ms <ms>] [--max-cycles <n>]\nStateful actions require explicit --root and --project. Only search-agents is stateless. Legacy cwd defaults require --legacy-cwd-defaults true. BossCoding v2 is accepted only through the installed resolver-owned entrypoint.";
if (options.help || process.argv.slice(2).includes("-h")) {
  console.log(usage);
  process.exit(0);
}
const action = options.action ?? process.argv.slice(2).find((value) => !value.startsWith("-"));
if (!action) {
  console.error(usage);
  process.exit(2);
}

try {
  if (options.interface !== undefined) throw new Error("the direct CLI does not accept --interface; verified BossCoding is resolver-owned");
  const verifiedInvocation = process.env.BOSSCODING_VERIFIED_INVOKE === "1";
  const legacyCwdDefaults = String(options.legacyCwdDefaults ?? "false").toLowerCase() === "true";
  if (verifiedInvocation && legacyCwdDefaults) {
    throw new Error("verified BossCoding forbids legacy cwd defaults");
  }
  if (action !== "search-agents" && !legacyCwdDefaults) {
    if (options.root === undefined || options.root === true || options.root === "") throw new Error("root is required for stateful actions");
    if (options.project === undefined || options.project === true || options.project === "") throw new Error("project is required for stateful actions");
  }
  const root = path.resolve(options.root ?? ".flowstate");
  const projectId = options.project ?? "project";
  if (verifiedInvocation) {
    const expectedParentPid = Number(process.env.BOSSCODING_VERIFIED_PARENT_PID ?? 0);
    const expectedStateRoot = path.resolve(process.env.BOSSCODING_VERIFIED_STATE_ROOT ?? "");
    const expectedProjectKey = process.env.BOSSCODING_VERIFIED_PROJECT_KEY ?? "";
    const expectedRuntimeRoot = path.resolve(process.env.BOSSCODING_VERIFIED_RUNTIME_ROOT ?? "");
    if (!Number.isInteger(expectedParentPid) || expectedParentPid !== process.ppid) {
      throw new Error("verified BossCoding requires the live resolver parent process");
    }
    if (path.normalize(expectedStateRoot).toLowerCase() !== path.normalize(root).toLowerCase()
      || expectedProjectKey !== projectId
      || path.normalize(expectedRuntimeRoot).toLowerCase() !== path.normalize(runtimeRoot).toLowerCase()) {
      throw new Error("verified BossCoding resolver-owned runtime, project, or state root does not match");
    }
    if (options.externalIndex !== undefined || options.externalRoot !== undefined) {
      throw new Error("verified BossCoding forbids external catalog overrides");
    }
  }
  const store = new FlowStateStore({ root });
  const queueAdapter = new FileQueueAdapter({ root: path.join(root, "queue") });
  const explicitExternalIndex = options.externalIndex !== undefined;
  const externalRoot = explicitExternalIndex ? path.resolve(options.externalRoot ?? process.cwd()) : runtimeRoot;
  const externalIndex = explicitExternalIndex
    ? path.resolve(options.externalIndex)
    : path.join(runtimeRoot, "integrations", "external-agents", "agency-agents", "index.json");
  let adapter = queueAdapter;
  const externalAgentsEnabled = options.externalAgents !== false && String(options.externalAgents ?? "true").toLowerCase() !== "false";
  if (externalAgentsEnabled) {
    try {
      adapter = new AgencyAgentsAdapter({ catalog: new ExternalAgentCatalog({ root: externalRoot, indexPath: path.relative(externalRoot, externalIndex) }), baseAdapter: queueAdapter });
    } catch {
      adapter = queueAdapter;
    }
  }
  const dispatcher = new FlowStateDispatcher({
    store,
    adapter,
    projectId,
    autoDispatch: String(options.autoDispatch ?? "true").toLowerCase() !== "false",
    autoRevision: String(options.autoRevision ?? "true").toLowerCase() !== "false",
    autoAdvance: String(options.autoAdvance ?? "true").toLowerCase() !== "false",
  });
  const runtime = new FlowStateRuntime({
    dispatcher,
    pollIntervalMs: Number(options.intervalMs ?? options.interval ?? 1000),
  });
  const input = options.input ? await readJson(options.input) : {};
  if (action !== "search-agents") {
    const state = await store.load(projectId);
    const currentPlans = Object.values(state.series ?? {})
      .map((series) => series.plans?.[series.current_plan_version])
      .filter(Boolean);
    const hasBossCodingV2 = currentPlans.some((plan) => plan.role_contract?.version === "bosscoding-v2");
    const hasLegacyCurrent = currentPlans.some((plan) => plan.role_contract?.version !== "bosscoding-v2");
    if (action === "create-plan") {
      const contractVersion = String(input?.plan?.role_contract?.version ?? input?.plan?.roleContract?.version ?? "");
      if (verifiedInvocation && contractVersion !== "bosscoding-v2") {
        throw new Error("verified BossCoding create-plan requires role_contract.version bosscoding-v2");
      }
      if (verifiedInvocation && hasLegacyCurrent) {
        throw new Error("verified BossCoding cannot create a v2 plan while legacy current plan state exists; use an explicit migration transaction");
      }
      if (!verifiedInvocation && (contractVersion === "bosscoding-v2" || hasBossCodingV2)) {
        throw new Error("BossCoding v2 state actions require the installed resolver-owned entrypoint");
      }
    } else if (!verifiedInvocation && hasBossCodingV2) {
      throw new Error("BossCoding v2 state actions require the installed resolver-owned entrypoint");
    } else if (verifiedInvocation && hasLegacyCurrent) {
      throw new Error("verified BossCoding cannot operate legacy current plan state");
    }
  }
  let result;
  if (action === "search-agents") result = await adapter.searchAgents({ query: options.query ?? input.query ?? "", division: options.division ?? input.division ?? null, limit: Number(options.limit ?? 10) });
  else if (action === "create-plan") result = await dispatcher.createPlan(input);
  else if (action === "bind-host-session") result = await dispatcher.bindHostSession(input);
  else if (action === "bind-host-worker") result = await dispatcher.bindHostWorker(input);
  else if (action === "approve") result = await dispatcher.approvePlan(input);
  else if (action === "dispatch") result = await dispatcher.dispatchReady(input);
  else if (action === "report") result = await dispatcher.ingestExecutionReport(input);
  else if (action === "review") {
    const observedSessionId = input.observed_session_id ?? input.observedSessionId;
    if (!observedSessionId) throw new Error("review action requires observed_session_id from the host transport");
    result = await dispatcher.ingestPlanningReview(input, {
      observedSessionId: String(observedSessionId),
      sourceVerified: true,
    });
  }
  else if (action === "resume" || action === "run-once") result = await runtime.runOnce({ resume: true });
  else if (action === "watch") {
    const controller = new AbortController();
    process.once("SIGINT", () => controller.abort());
    result = await runtime.watch({
      intervalMs: Number(options.intervalMs ?? options.interval ?? 1000),
      maxCycles: options.maxCycles === undefined || options.maxCycles === true ? null : Number(options.maxCycles),
      signal: controller.signal,
    });
  }
  else if (action === "resolve-blocker") result = await dispatcher.resolveBlocker(input);
  else if (action === "sync") result = await dispatcher.syncParallelResult(input);
  else throw new Error(`Unknown action: ${action}`);
  console.log(JSON.stringify({ ok: true, action, ...result }, null, 2));
} catch (error) {
  console.error(`PDGO dispatch failed: ${error.message}`);
  process.exit(1);
}
