import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { AgencyAgentsAdapter, ExternalAgentCatalog } from "../scripts/lib/external-agent-adapter.mjs";

function gitBlobSha(text) {
  const content = Buffer.from(text, "utf8");
  return createHash("sha1").update(`blob ${content.length}\0`).update(content).digest("hex");
}

async function catalogFixture(entryOverrides = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "flowstate-external-agent-"));
  const entry = {
    agent_id: "agency-agents/engineering/backend.md",
    provider_id: "agency-agents",
    name: "Backend Architect",
    description: "backend architecture",
    division: "engineering",
    source_url: "https://raw.githubusercontent.com/example/repo/main/engineering/backend.md",
    source_ref: "main",
    source_sha: null,
    prompt_path: null,
    ...entryOverrides,
  };
  await writeFile(path.join(root, "index.json"), JSON.stringify({
    schema_version: "1.0",
    provider: { provider_id: "agency-agents", source_commit: "tree-commit" },
    agents: [entry],
  }));
  await writeFile(path.join(root, "metadata.json"), JSON.stringify({ schema_version: "1.0", agents: [{ agent_id: entry.agent_id, confidence: "high", routing_mode: "eligible-with-explicit-task-selector", auto_route: true }] }));
  return { root, entry };
}

test("external catalog rejects prompt paths outside its root", async () => {
  const { root, entry } = await catalogFixture({ prompt_path: "../secret.md" });
  try {
    const catalog = new ExternalAgentCatalog({ root, indexPath: "index.json" });
    await assert.rejects(() => catalog.prompt(entry), /prompt_path must stay within/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("external catalog verifies cached prompt against the recorded Git blob SHA", async () => {
  const { root, entry } = await catalogFixture({
    prompt_path: "prompts/backend.md",
    source_sha: "0000000000000000000000000000000000000000",
  });
  try {
    await mkdir(path.join(root, "prompts"), { recursive: true });
    await writeFile(path.join(root, "prompts", "backend.md"), "cached prompt\n");
    const catalog = new ExternalAgentCatalog({ root, indexPath: "index.json" });
    await assert.rejects(() => catalog.prompt(entry), /prompt integrity mismatch/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("external catalog accepts an intact cached prompt and rejects non-HTTPS fallback URLs", async () => {
  const prompt = "cached prompt\n";
  const { root, entry } = await catalogFixture({
    prompt_path: "prompts/backend.md",
    source_sha: gitBlobSha(prompt),
  });
  try {
    await mkdir(path.join(root, "prompts"), { recursive: true });
    await writeFile(path.join(root, "prompts", "backend.md"), prompt);
    const catalog = new ExternalAgentCatalog({ root, indexPath: "index.json" });
    assert.equal(await catalog.prompt(entry), prompt);

    const remoteOnly = new ExternalAgentCatalog({
      root,
      indexPath: "index.json",
      fetchText: async () => ({ ok: true, text: async () => prompt }),
    });
    await assert.rejects(
      () => remoteOnly.prompt({ ...entry, prompt_path: null, source_url: "file:///etc/passwd" }),
      /source_url must use HTTPS/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("external Agent selection is only sent as a complete governed dispatch", async () => {
  const messages = [];
  const entry = {
    agent_id: "agency-agents/engineering/backend.md",
    provider_id: "agency-agents",
    name: "Backend Architect",
    division: "engineering",
    description: "backend architecture",
    source_path: "engineering/backend.md",
    source_url: "https://raw.githubusercontent.com/example/repo/main/engineering/backend.md",
    source_ref: "main",
    source_sha: "a".repeat(40),
  };
  const catalog = {
    async resolve() { return entry; },
    async prompt() { return "role prompt"; },
    async load() { return { provider: { source_commit: "tree-commit" } }; },
  };
  const adapter = new AgencyAgentsAdapter({
    catalog,
    baseAdapter: { async send(message) { messages.push(message); return { message_id: "m1" }; } },
  });

  await assert.rejects(
    () => adapter.send({ external_agent_id: entry.agent_id, message_type: "EXECUTION_REPORT" }),
    /requires a PLAN_DISPATCH/,
  );

  const result = await adapter.send({
    message_type: "PLAN_DISPATCH",
    trace_id: "trace-1",
    dispatch_id: "dispatch-1",
    project_id: "demo",
    plan_series_id: "series-1",
    plan_id: "plan-1",
    plan_version: "v1",
    task_id: "T01",
    target_session_id: "worker-1",
    planning_session_id: "planning-1",
    execution_session_id: "execution-1",
    return_to: "planning-1",
    acceptance_criteria: ["done"],
    expected_evidence: ["report"],
    external_agent_query: "backend architecture",
  });

  assert.equal(result.message_id, "m1");
  assert.equal(messages[0].external_agent_id, entry.agent_id);
  assert.equal(messages[0].external_agent_source_commit, "tree-commit");
  assert.equal(messages[0].external_agent.invocation_status, "dispatched");
  assert.equal(messages[0].external_agent.source_commit, "tree-commit");
  assert.equal(messages[0].external_agent.instructions, "role prompt");
});

test("external catalog gates automatic selection on evidence metadata", async () => {
  const { root, entry } = await catalogFixture();
  try {
    const catalog = new ExternalAgentCatalog({ root, indexPath: "index.json", metadataIndexPath: "metadata.json" });
    const resolved = await catalog.resolve({ agentId: entry.agent_id, requireAutoRoute: true });
    assert.equal(resolved.routing_metadata.auto_route, true);
    await writeFile(path.join(root, "metadata.json"), JSON.stringify({ schema_version: "1.0", agents: [{ agent_id: entry.agent_id, confidence: "medium", routing_mode: "manual-only", auto_route: false }] }));
    const uncached = new ExternalAgentCatalog({ root, indexPath: "index.json", metadataIndexPath: "metadata.json" });
    await assert.rejects(() => uncached.resolve({ agentId: entry.agent_id, requireAutoRoute: true }), /not eligible for automatic routing/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("external Agent adapter inherits a stage selector and uses the connected host transport", async () => {
  const calls = [];
  const entry = {
    agent_id: "agency-agents/engineering/backend.md",
    provider_id: "agency-agents",
    name: "Backend Architect",
    division: "engineering",
    description: "backend architecture",
    source_path: "engineering/backend.md",
    source_url: "https://raw.githubusercontent.com/example/repo/main/engineering/backend.md",
    source_ref: "main",
    source_sha: "a".repeat(40),
    routing_metadata: { auto_route: false, routing_mode: "manual-only" },
  };
  const catalog = {
    async resolve({ agentId }) { assert.equal(agentId, entry.agent_id); return entry; },
    async prompt() { return "role prompt"; },
    async load() { return { provider: { source_commit: "tree-commit" } }; },
  };
  const adapter = new AgencyAgentsAdapter({
    catalog,
    baseAdapter: {
      async ensureWorkerSession() { return { worker_session_id: "audit-worker", delivery_status: "adapter-unavailable" }; },
      async send() { return { message_id: "audit-message" }; },
    },
    hostTransport: {
      async startWorker(input) { calls.push({ type: "start", input }); return { worker_session_id: "host-worker-1", platform_session_id: "host-worker-1" }; },
      async send(input) { calls.push({ type: "send", input }); return { message_id: "host-message-1", runtime_agent_id: "host-worker-1" }; },
    },
  });

  const worker = await adapter.ensureWorkerSession({
    seriesId: "series-1",
    taskId: "T01",
    projectId: "demo",
    task: { objective: "Implement backend" },
    stage: { agent_selectors: [{ external_agent_id: entry.agent_id, division: "engineering" }] },
  });
  assert.equal(worker.worker_session_id, "host-worker-1");
  assert.equal(worker.delivery_status, "connected");
  const dispatch = {
    message_type: "PLAN_DISPATCH",
    trace_id: "trace-1",
    dispatch_id: "dispatch-1",
    project_id: "demo",
    plan_series_id: "series-1",
    plan_id: "plan-1",
    plan_version: "v1",
    task_id: "T01",
    target_session_id: worker.worker_session_id,
    planning_session_id: "planning-1",
    execution_session_id: "execution-1",
    return_to: "planning-1",
    acceptance_criteria: ["done"],
    expected_evidence: ["report"],
    external_agent_id: entry.agent_id,
  };
  const result = await adapter.send(dispatch);
  assert.equal(result.message_id, "host-message-1");
  assert.equal(result.external_agent.runtime_agent_id, "host-worker-1");
  assert.equal(result.external_agent.invocation_status, "started");
  assert.deepEqual(calls.map((call) => call.type), ["start", "send"]);
  assert.equal(calls[0].input.instructions, "role prompt");
  assert.equal(calls[0].input.agent.agent_id, entry.agent_id);
  assert.equal(calls[1].input.message.external_agent.instructions, "role prompt");

  adapter.hostTransport.send = async () => ({ message_id: "missing-runtime-id" });
  await assert.rejects(
    () => adapter.send({ ...dispatch, dispatch_id: "dispatch-2", message_id: "dispatch-2" }),
    /did not return a runtime Agent id/,
  );
});

test("external Agent adapter rejects a host worker without a real session id", async () => {
  const entry = { agent_id: "agency-agents/testing/tester.md", provider_id: "agency-agents", name: "Tester", division: "testing", source_sha: "a".repeat(40) };
  const adapter = new AgencyAgentsAdapter({
    catalog: {
      async resolve() { return entry; },
      async prompt() { return "role prompt"; },
      async load() { return { provider: { source_commit: "tree-commit" } }; },
    },
    baseAdapter: { async ensureWorkerSession() { return { worker_session_id: "audit-worker", delivery_status: "adapter-unavailable" }; } },
    hostTransport: { async startWorker() { return {}; } },
  });

  await assert.rejects(
    () => adapter.ensureWorkerSession({ task: { external_agent_id: entry.agent_id } }),
    /did not return a worker session/,
  );
});
