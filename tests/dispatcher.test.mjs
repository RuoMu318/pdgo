import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { CodexAppServerAdapter, FileQueueAdapter, FlowStateDispatcher, FlowStateStore } from "../scripts/lib/flowstate-dispatcher.mjs";

class MockAdapter {
  constructor() {
    this.messages = [];
    this.seriesCalls = [];
    this.workerCalls = [];
    this.sequence = 0;
  }

  async ensureSeriesSessions({ seriesId }) {
    this.seriesCalls.push(seriesId);
    return { planning_session_id: `plan-session-${seriesId}`, execution_session_id: `exec-session-${seriesId}`, adapter: "mock" };
  }

  async ensureWorkerSession({ seriesId, taskId }) {
    this.workerCalls.push({ seriesId, taskId });
    return { worker_session_id: `worker-session-${seriesId}-${taskId}` };
  }

  async send(message) {
    this.messages.push(message);
    this.sequence += 1;
    return { message_id: `message-${this.sequence}` };
  }
}

function makePlan(overrides = {}) {
  return {
    project_id: "demo",
    title: "Two-step governed change",
    summary: "Run two dependent tasks in one series conversation.",
    objective: "Implement and validate a small change.",
    risks: [{ risk_id: "R01", severity: "medium", impact: "bounded", status: "open" }],
    tasks: [
      { task_id: "T01", title: "Implement change", objective: "Implement the bounded change.", acceptance_criteria: ["change exists"], expected_evidence: ["diff"] },
      { task_id: "T02", title: "Validate change", objective: "Run the validation.", dependencies: ["T01"], acceptance_criteria: ["tests pass"], expected_evidence: ["test log"] },
    ],
    ...overrides,
  };
}

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "flowstate-dispatcher-"));
  const adapter = new MockAdapter();
  const dispatcher = new FlowStateDispatcher({
    store: new FlowStateStore({ root: path.join(root, "state") }),
    adapter,
    projectId: "demo",
    id: (prefix) => `${prefix}-${++adapter.sequence}`,
  });
  return { root, adapter, dispatcher };
}

test("extension reuses series sessions while parallel creates new sessions", async () => {
  const { root, adapter, dispatcher } = await fixture();
  try {
    const first = await dispatcher.createPlan({ planSeriesId: "series-a", planVersion: "v1", plan: makePlan({ plan_id: "series-a-plan-v1" }) });
    const extension = await dispatcher.createPlan({ planSeriesId: "series-a", planVersion: "v2", relation: "extension", plan: makePlan({ title: "Extended change", plan_id: "series-a-plan-v2" }) });
    const parallel = await dispatcher.createPlan({ planSeriesId: "series-b", planVersion: "v1", relation: "parallel", parallelOf: "series-a", plan: makePlan({ title: "Parallel research", plan_id: "series-b-plan-v1", serial_parallel_policy: "parallel", max_parallel: 2 }) });
    assert.equal(first.planning_session_id, extension.planning_session_id);
    assert.equal(first.execution_session_id, extension.execution_session_id);
    assert.notEqual(first.planning_session_id, parallel.planning_session_id);
    assert.notEqual(first.execution_session_id, parallel.execution_session_id);
    assert.deepEqual(adapter.seriesCalls, ["series-a", "series-b"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("approval acknowledges every risk and accepted report unlocks the next task automatically", async () => {
  const { root, adapter, dispatcher } = await fixture();
  try {
    await dispatcher.createPlan({ planSeriesId: "series-a", planVersion: "v1", plan: makePlan({ plan_id: "series-a-plan-v1" }) });
    await assert.rejects(() => dispatcher.approvePlan({ planSeriesId: "series-a", planVersion: "v1", approval: { approver: "user", plan_version: "v1", decision: "approved", acknowledged_risks: [] } }), /acknowledge every risk/);
    await dispatcher.approvePlan({ planSeriesId: "series-a", planVersion: "v1", approval: { approver: "user", plan_version: "v1", decision: "approved", acknowledged_risks: ["R01"], resolved_blockers: [] } });
    const firstDispatch = await dispatcher.dispatchReady({ planSeriesId: "series-a", planVersion: "v1" });
    assert.equal(firstDispatch.dispatches.length, 1);
    assert.equal(firstDispatch.dispatches[0].target_session_id, "worker-session-series-a-T01");
    await dispatcher.ingestExecutionReport({ report_id: "report-1", project_id: "demo", plan_series_id: "series-a", plan_id: "series-a-plan-v1", plan_version: "v1", task_id: "T01", dispatch_id: firstDispatch.dispatches[0].dispatch_id, session_id: "worker-session-series-a-T01", status: "returned-to-planning", evidence: ["diff"] });
    const review = await dispatcher.ingestPlanningReview({ review_id: "review-1", report_id: "report-1", plan_series_id: "series-a", plan_version: "v1", task_id: "T01", decision: "accepted", criteria_results: [{ criterion: "change exists", result: "pass" }] });
    assert.equal(review.next_dispatches.length, 1);
    assert.equal(review.next_dispatches[0].task_id, "T02");
    const state = await dispatcher.store.load("demo");
    assert.equal(state.series["series-a"].plans.v1.tasks.find((task) => task.task_id === "T02").status, "dispatched");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("new blocker pauses the plan and resolution returns it to approved", async () => {
  const { root, adapter, dispatcher } = await fixture();
  try {
    await dispatcher.createPlan({ planSeriesId: "series-a", planVersion: "v1", plan: makePlan({ plan_id: "series-a-plan-v1", risks: [] }) });
    await dispatcher.approvePlan({ planSeriesId: "series-a", planVersion: "v1", approval: { approver: "user", plan_version: "v1", decision: "approved", acknowledged_risks: [] } });
    const dispatch = await dispatcher.dispatchReady({ planSeriesId: "series-a", planVersion: "v1" });
    await dispatcher.ingestExecutionReport({ report_id: "report-blocked", project_id: "demo", plan_series_id: "series-a", plan_id: "series-a-plan-v1", plan_version: "v1", task_id: "T01", dispatch_id: dispatch.dispatches[0].dispatch_id, status: "blocked", new_blockers: [{ blocker_id: "B99", dependency: "missing decision", impact: "cannot continue" }] });
    let state = await dispatcher.store.load("demo");
    assert.equal(state.series["series-a"].status, "waiting-on-planning");
    assert.equal(state.series["series-a"].plans.v1.status, "paused-needs-review");
    await dispatcher.resolveBlocker({ planSeriesId: "series-a", planVersion: "v1", blockerId: "B99", resolution: "user supplied decision" });
    state = await dispatcher.store.load("demo");
    assert.equal(state.series["series-a"].status, "approved");
    assert.equal(state.series["series-a"].plans.v1.tasks.find((task) => task.task_id === "T01").status, "ready");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("file queue leaves dispatch and report messages on disk", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "flowstate-queue-"));
  try {
    const adapter = new FileQueueAdapter({ root: path.join(root, "queue"), id: (prefix) => `${prefix}-fixed` });
    const sessions = await adapter.ensureSeriesSessions({ seriesId: "series-local" });
    assert.equal(sessions.platform_session_ids.planning, null);
    const sent = await adapter.send({ message_type: "PLAN_DISPATCH", target_session_id: "worker-1", task_id: "T01" });
    const queued = await adapter.enqueueReport({ report_id: "report-fixed", return_to: "planning-1", status: "returned-to-planning" });
    assert.match(await readFile(sent.path, "utf8"), /PLAN_DISPATCH/);
    assert.equal((await adapter.receiveReports("planning-1"))[0].report_id, "report-fixed");
    assert.match(queued.path, /report-fixed\.json$/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Codex App Server adapter creates controller threads once and task threads separately", async () => {
  const calls = [];
  let counter = 0;
  const adapter = new CodexAppServerAdapter({
    request: async (method, params) => {
      calls.push({ method, params });
      if (method === "thread/start") return { thread: { id: `thread-${++counter}` } };
      return { turn: { id: `turn-${++counter}` } };
    },
  });
  const root = await mkdtemp(path.join(os.tmpdir(), "flowstate-app-server-"));
  try {
    const dispatcher = new FlowStateDispatcher({ store: new FlowStateStore({ root }), adapter, projectId: "demo" });
    await dispatcher.createPlan({ planSeriesId: "series-app", planVersion: "v1", plan: makePlan({ plan_id: "series-app-plan-v1" }) });
    await dispatcher.createPlan({ planSeriesId: "series-app", planVersion: "v2", relation: "extension", plan: makePlan({ plan_id: "series-app-plan-v2" }) });
    assert.equal(calls.filter((call) => call.method === "thread/start").length, 2);
    await dispatcher.approvePlan({ planSeriesId: "series-app", planVersion: "v2", approval: { approver: "user", plan_version: "v2", decision: "approved", acknowledged_risks: ["R01"] } });
    await dispatcher.dispatchReady({ planSeriesId: "series-app", planVersion: "v2" });
    assert.equal(calls.filter((call) => call.method === "thread/start").length, 3);
    assert.equal(calls.filter((call) => call.method === "turn/start").length, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("plan index is written and accepted tasks carry into a series extension", async () => {
  const { root, adapter, dispatcher } = await fixture();
  try {
    await dispatcher.createPlan({ planSeriesId: "series-a", planVersion: "v1", plan: makePlan({ plan_id: "series-a-plan-v1", tasks: [{ task_id: "T01", title: "Implement change", objective: "Implement the bounded change." }] }) });
    await dispatcher.approvePlan({ planSeriesId: "series-a", planVersion: "v1", approval: { approver: "user", plan_version: "v1", decision: "approved", acknowledged_risks: ["R01"] } });
    const dispatch = await dispatcher.dispatchReady({ planSeriesId: "series-a", planVersion: "v1" });
    await dispatcher.ingestExecutionReport({ report_id: "report-1", project_id: "demo", plan_series_id: "series-a", plan_id: "series-a-plan-v1", plan_version: "v1", task_id: "T01", dispatch_id: dispatch.dispatches[0].dispatch_id, status: "returned-to-planning" });
    await dispatcher.ingestPlanningReview({ review_id: "review-1", plan_series_id: "series-a", plan_version: "v1", task_id: "T01", decision: "accepted" });
    await dispatcher.createPlan({ planSeriesId: "series-a", planVersion: "v2", relation: "extension", plan: makePlan({ plan_id: "series-a-plan-v2", tasks: [{ task_id: "T02", title: "Validate change", objective: "Validate the accepted implementation.", dependencies: ["T01"] }] }) });
    const state = await dispatcher.store.load("demo");
    assert.equal(state.series["series-a"].plans.v2.tasks.find((task) => task.task_id === "T01").status, "accepted");
    const index = JSON.parse(await readFile(path.join(root, "state", "plan-index.json"), "utf8"));
    assert.equal(index.plans.find((plan) => plan.plan_id === "series-a-plan-v2").plan_series_id, "series-a");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
