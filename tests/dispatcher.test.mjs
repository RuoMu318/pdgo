import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { CodexAppServerAdapter, FileQueueAdapter, FlowStateDispatcher, FlowStateRuntime, FlowStateStore } from "../scripts/lib/flowstate-dispatcher.mjs";

class MockAdapter {
  constructor() {
    this.messages = [];
    this.seriesCalls = [];
    this.workerCalls = [];
    this.sequence = 0;
    this.failTypes = new Set();
  }

  async ensureSeriesSessions({ seriesId }) {
    this.seriesCalls.push(seriesId);
    return { planning_session_id: `plan-session-${seriesId}`, execution_session_id: `exec-session-${seriesId}`, delivery_status: "connected", adapter: "mock" };
  }

  async ensureWorkerSession({ seriesId, taskId }) {
    this.workerCalls.push({ seriesId, taskId });
    return { worker_session_id: `worker-session-${seriesId}-${taskId}`, platform_session_id: `worker-session-${seriesId}-${taskId}`, delivery_status: "connected" };
  }

  async send(message) {
    if (this.failTypes.has(message.message_type)) throw new Error(`send failed for ${message.message_type}`);
    this.messages.push(message);
    this.sequence += 1;
    return { message_id: `message-${this.sequence}` };
  }
}

class ConnectedQueueAdapter extends FileQueueAdapter {
  async ensureSeriesSessions({ seriesId }) {
    return {
      planning_session_id: `connected-planning-${seriesId}`,
      execution_session_id: `connected-execution-${seriesId}`,
      platform_session_ids: { planning: `connected-planning-${seriesId}`, execution: `connected-execution-${seriesId}` },
      delivery_status: "connected",
      adapter: "connected-queue-test-double",
    };
  }

  async ensureWorkerSession({ seriesId, taskId }) {
    const workerSessionId = `connected-worker-${seriesId}-${taskId}`;
    return { worker_session_id: workerSessionId, platform_session_id: workerSessionId, delivery_status: "connected" };
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
    await dispatcher.ingestExecutionReport({ report_id: "report-blocked", project_id: "demo", plan_series_id: "series-a", plan_id: "series-a-plan-v1", plan_version: "v1", task_id: "T01", dispatch_id: dispatch.dispatches[0].dispatch_id, status: "blocked", new_blockers: [{ blocker_id: "B99", dependency: "missing decision", reason: "The required implementation choice is absent from the approved plan.", impact: "cannot continue", recommended_solution: "Planning should select an in-scope option.", requires_user: false }] });
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

test("formal blocker reports require reason impact advice and user disposition", async () => {
  const { root, dispatcher } = await fixture();
  try {
    await dispatcher.createPlan({ planSeriesId: "series-blocker-contract", planVersion: "v1", plan: makePlan({ plan_id: "series-blocker-contract-plan-v1", risks: [] }) });
    await dispatcher.approvePlan({ planSeriesId: "series-blocker-contract", planVersion: "v1", approval: { approver: "user", plan_id: "series-blocker-contract-plan-v1", plan_version: "v1", decision: "approved", acknowledged_risks: [] } });
    const dispatch = await dispatcher.dispatchReady({ planSeriesId: "series-blocker-contract", planVersion: "v1" });

    await assert.rejects(() => dispatcher.ingestExecutionReport({
      report_id: "report-invalid-blocker",
      project_id: "demo",
      plan_series_id: "series-blocker-contract",
      plan_id: "series-blocker-contract-plan-v1",
      plan_version: "v1",
      task_id: "T01",
      dispatch_id: dispatch.dispatches[0].dispatch_id,
      status: "blocked",
      new_blockers: [{ blocker_id: "B01", impact: "Execution cannot continue." }],
    }), /new_blockers\[0\]\.reason is required/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("abnormal execution stop immediately sends a formal blocker report to planning while normal return does not", async () => {
  const { root, adapter, dispatcher } = await fixture();
  try {
    await dispatcher.createPlan({ planSeriesId: "series-abnormal-stop", planVersion: "v1", plan: makePlan({ plan_id: "series-abnormal-stop-plan-v1", risks: [] }) });
    await dispatcher.approvePlan({ planSeriesId: "series-abnormal-stop", planVersion: "v1", approval: { approver: "user", plan_id: "series-abnormal-stop-plan-v1", plan_version: "v1", decision: "approved", acknowledged_risks: [] } });
    const dispatch = await dispatcher.dispatchReady({ planSeriesId: "series-abnormal-stop", planVersion: "v1" });

    const result = await dispatcher.ingestExecutionReport({
      message_type: "EXECUTION_STOPPED",
      report_id: "report-abnormal-stop",
      project_id: "demo",
      plan_series_id: "series-abnormal-stop",
      plan_id: "series-abnormal-stop-plan-v1",
      plan_version: "v1",
      task_id: "T01",
      dispatch_id: dispatch.dispatches[0].dispatch_id,
      status: "abnormal-stopped",
      summary: "Worker process exited unexpectedly.",
      new_blockers: [{
        blocker_id: "B-STOP",
        dependency: "healthy execution worker",
        reason: "The worker process terminated before returning task evidence.",
        impact: "The approved task is incomplete and cannot be reviewed.",
        recommended_solution: "Restart the worker and re-dispatch the same approved task.",
        requires_user: false,
        status: "resolved",
      }],
    });

    const blockerMessage = adapter.messages.at(-1);
    assert.equal(result.abnormal_stop, true);
    assert.equal(result.blocker_report_sent, true);
    assert.equal(blockerMessage.message_type, "BLOCKER_REPORT");
    assert.equal(blockerMessage.target_session_id, "plan-session-series-abnormal-stop");
    assert.equal(blockerMessage.return_to, "exec-session-series-abnormal-stop");
    assert.equal(blockerMessage.blockers[0].reason, "The worker process terminated before returning task evidence.");
    assert.equal(blockerMessage.blockers[0].recommended_solution, "Restart the worker and re-dispatch the same approved task.");
    assert.equal(blockerMessage.blockers[0].requires_user, false);
    assert.equal(blockerMessage.blockers[0].status, "open");

    const normal = await fixture();
    try {
      await normal.dispatcher.createPlan({ planSeriesId: "series-normal-return", planVersion: "v1", plan: makePlan({ plan_id: "series-normal-return-plan-v1", risks: [] }) });
      await normal.dispatcher.approvePlan({ planSeriesId: "series-normal-return", planVersion: "v1", approval: { approver: "user", plan_id: "series-normal-return-plan-v1", plan_version: "v1", decision: "approved", acknowledged_risks: [] } });
      const normalDispatch = await normal.dispatcher.dispatchReady({ planSeriesId: "series-normal-return", planVersion: "v1" });
      const normalResult = await normal.dispatcher.ingestExecutionReport({ report_id: "report-normal", project_id: "demo", plan_series_id: "series-normal-return", plan_id: "series-normal-return-plan-v1", plan_version: "v1", task_id: "T01", dispatch_id: normalDispatch.dispatches[0].dispatch_id, status: "returned-to-planning" });
      assert.equal(normalResult.abnormal_stop, false);
      assert.equal(normal.adapter.messages.at(-1).message_type, "EXECUTION_REPORT");
    } finally {
      await rm(normal.root, { recursive: true, force: true });
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("planning resolves an internal blocker, sends its opinion, and automatically re-dispatches the stopped task", async () => {
  const { root, adapter, dispatcher } = await fixture();
  try {
    await dispatcher.createPlan({ planSeriesId: "series-internal-blocker", planVersion: "v1", plan: makePlan({ plan_id: "series-internal-blocker-plan-v1", risks: [] }) });
    await dispatcher.approvePlan({ planSeriesId: "series-internal-blocker", planVersion: "v1", approval: { approver: "user", plan_id: "series-internal-blocker-plan-v1", plan_version: "v1", decision: "approved", acknowledged_risks: [] } });
    const first = await dispatcher.dispatchReady({ planSeriesId: "series-internal-blocker", planVersion: "v1" });
    await dispatcher.ingestExecutionReport({
      report_id: "report-internal-blocker",
      project_id: "demo",
      plan_series_id: "series-internal-blocker",
      plan_id: "series-internal-blocker-plan-v1",
      plan_version: "v1",
      task_id: "T01",
      dispatch_id: first.dispatches[0].dispatch_id,
      status: "abnormal-stopped",
      abnormal_stop: true,
      new_blockers: [{ blocker_id: "B-INTERNAL", dependency: "worker restart", reason: "The worker process stopped unexpectedly.", impact: "Task T01 is incomplete.", recommended_solution: "Restart and re-dispatch T01.", requires_user: false }],
    });

    const review = await dispatcher.ingestPlanningReview({
      message_type: "PLANNING_BLOCKER_OPINION",
      review_id: "opinion-internal-blocker",
      report_id: "report-internal-blocker",
      plan_series_id: "series-internal-blocker",
      plan_id: "series-internal-blocker-plan-v1",
      plan_version: "v1",
      task_id: "T01",
      decision: "continue",
      requires_user: false,
      opinion: "The approved scope is unchanged; restart the worker and retry the same task.",
      blocker_resolutions: [{ blocker_id: "B-INTERNAL", resolution: "Planning authorized a worker restart within the approved plan.", status: "resolved" }],
      next_action: "dispatch",
    });

    const opinion = adapter.messages.find((message) => message.message_type === "PLANNING_BLOCKER_OPINION");
    assert.equal(opinion.target_session_id, "exec-session-series-internal-blocker");
    assert.equal(opinion.opinion, "The approved scope is unchanged; restart the worker and retry the same task.");
    assert.equal(review.next_dispatches.length, 1);
    assert.equal(review.next_dispatches[0].task_id, "T01");
    const state = await dispatcher.store.load("demo");
    assert.equal(state.series["series-internal-blocker"].blockers["B-INTERNAL"].status, "resolved");
    assert.equal(state.series["series-internal-blocker"].plans.v1.tasks.find((task) => task.task_id === "T01").status, "dispatched");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("planning escalates an unresolved blocker to the user and does not resume execution", async () => {
  const { root, adapter, dispatcher } = await fixture();
  try {
    await dispatcher.createPlan({ planSeriesId: "series-user-blocker", planVersion: "v1", plan: makePlan({ plan_id: "series-user-blocker-plan-v1", risks: [] }) });
    await dispatcher.approvePlan({ planSeriesId: "series-user-blocker", planVersion: "v1", approval: { approver: "user", plan_id: "series-user-blocker-plan-v1", plan_version: "v1", decision: "approved", acknowledged_risks: [] } });
    const first = await dispatcher.dispatchReady({ planSeriesId: "series-user-blocker", planVersion: "v1" });
    await dispatcher.ingestExecutionReport({
      report_id: "report-user-blocker",
      project_id: "demo",
      plan_series_id: "series-user-blocker",
      plan_id: "series-user-blocker-plan-v1",
      plan_version: "v1",
      task_id: "T01",
      dispatch_id: first.dispatches[0].dispatch_id,
      status: "blocked",
      new_blockers: [{ blocker_id: "B-USER", dependency: "user-owned credential", reason: "The required credential is unavailable to the project.", impact: "Task T01 cannot access the approved service.", recommended_solution: "The user must provide or authorize the credential.", requires_user: true }],
    });

    await assert.rejects(() => dispatcher.ingestPlanningReview({
      review_id: "legacy-blocked-user-blocker",
      report_id: "report-user-blocker",
      plan_series_id: "series-user-blocker",
      plan_id: "series-user-blocker-plan-v1",
      plan_version: "v1",
      task_id: "T01",
      decision: "blocked",
      requires_user: true,
      opinion: "Planning cannot supply the user-owned credential.",
    }), /formal blocker report requires continue or await-user/);

    const review = await dispatcher.ingestPlanningReview({
      message_type: "PLANNING_BLOCKER_OPINION",
      review_id: "opinion-user-blocker",
      report_id: "report-user-blocker",
      plan_series_id: "series-user-blocker",
      plan_id: "series-user-blocker-plan-v1",
      plan_version: "v1",
      task_id: "T01",
      decision: "await-user",
      requires_user: true,
      opinion: "Planning cannot supply the user-owned credential.",
      next_action: "wait-for-user",
    });

    assert.equal(review.next_dispatches, undefined);
    assert.equal(adapter.messages.some((message) => message.message_type === "PLANNING_BLOCKER_OPINION" && message.target_session_id === "exec-session-series-user-blocker"), true);
    const userNotice = adapter.messages.find((message) => message.message_type === "USER_ACTION_REQUIRED");
    assert.equal(userNotice.target_session_id, "plan-session-series-user-blocker");
    assert.equal(userNotice.blockers[0].reason, "The required credential is unavailable to the project.");
    assert.equal(userNotice.blockers[0].recommended_solution, "The user must provide or authorize the credential.");
    const state = await dispatcher.store.load("demo");
    assert.equal(state.series["series-user-blocker"].status, "waiting-on-planning");
    assert.equal(state.series["series-user-blocker"].plans.v1.status, "awaiting-user-action");
    assert.equal(state.series["series-user-blocker"].plans.v1.tasks.find((task) => task.task_id === "T01").status, "blocked");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("failed blocker notifications do not commit reports or planning opinions", async () => {
  const { root, adapter, dispatcher } = await fixture();
  try {
    await dispatcher.createPlan({ planSeriesId: "series-notification-failure", planVersion: "v1", plan: makePlan({ plan_id: "series-notification-failure-plan-v1", risks: [] }) });
    await dispatcher.approvePlan({ planSeriesId: "series-notification-failure", planVersion: "v1", approval: { approver: "user", plan_id: "series-notification-failure-plan-v1", plan_version: "v1", decision: "approved", acknowledged_risks: [] } });
    const first = await dispatcher.dispatchReady({ planSeriesId: "series-notification-failure", planVersion: "v1" });
    const blockerReport = {
      report_id: "report-notification-failure",
      project_id: "demo",
      plan_series_id: "series-notification-failure",
      plan_id: "series-notification-failure-plan-v1",
      plan_version: "v1",
      task_id: "T01",
      dispatch_id: first.dispatches[0].dispatch_id,
      status: "abnormal-stopped",
      new_blockers: [{ blocker_id: "B-FAIL", dependency: "worker transport", reason: "The worker stopped unexpectedly.", impact: "Task T01 is incomplete.", recommended_solution: "Restore the worker transport and retry.", requires_user: false }],
    };

    adapter.failTypes.add("BLOCKER_REPORT");
    await assert.rejects(() => dispatcher.ingestExecutionReport(blockerReport), /send failed for BLOCKER_REPORT/);
    let state = await dispatcher.store.load("demo");
    assert.equal(state.series["series-notification-failure"].reports["report-notification-failure"], undefined);
    assert.equal(state.series["series-notification-failure"].plans.v1.tasks.find((task) => task.task_id === "T01").status, "dispatched");

    adapter.failTypes.delete("BLOCKER_REPORT");
    await dispatcher.ingestExecutionReport(blockerReport);
    adapter.failTypes.add("PLANNING_BLOCKER_OPINION");
    await assert.rejects(() => dispatcher.ingestPlanningReview({
      review_id: "opinion-notification-failure",
      report_id: "report-notification-failure",
      plan_series_id: "series-notification-failure",
      plan_id: "series-notification-failure-plan-v1",
      plan_version: "v1",
      task_id: "T01",
      decision: "continue",
      requires_user: false,
      opinion: "Retry is inside the approved contract.",
      blocker_resolutions: [{ blocker_id: "B-FAIL", resolution: "Planning authorized an in-scope retry.", status: "resolved" }],
    }), /send failed for PLANNING_BLOCKER_OPINION/);
    state = await dispatcher.store.load("demo");
    assert.equal(state.series["series-notification-failure"].reviews["opinion-notification-failure"], undefined);
    assert.equal(state.series["series-notification-failure"].blockers["B-FAIL"].status, "open");
    assert.equal(state.series["series-notification-failure"].plans.v1.status, "paused-needs-review");
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
    const blocked = await adapter.enqueueReport({ report_id: "report-blocked-fixed", return_to: "planning-1", status: "blocked", new_blockers: [{ blocker_id: "B01", reason: "A dependency is unavailable.", impact: "The task cannot continue.", recommended_solution: "Restore the dependency.", requires_user: false }] });
    assert.match(await readFile(sent.path, "utf8"), /PLAN_DISPATCH/);
    assert.equal((await adapter.receiveReports("planning-1")).some((report) => report.report_id === "report-fixed"), true);
    assert.match(queued.path, /report-fixed\.json$/);
    assert.equal(JSON.parse(await readFile(blocked.path, "utf8")).message_type, "BLOCKER_REPORT");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("file queue dispatches are idempotent and processed messages are archived", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "flowstate-queue-idempotency-"));
  try {
    const adapter = new FileQueueAdapter({ root: path.join(root, "queue"), id: (prefix) => `${prefix}-fixed` });
    const first = await adapter.send({ message_type: "PLAN_DISPATCH", dispatch_id: "dispatch-1", target_session_id: "worker-1" });
    const second = await adapter.send({ message_type: "PLAN_DISPATCH", dispatch_id: "dispatch-1", target_session_id: "worker-1" });
    assert.equal(first.path, second.path);
    assert.equal((await readdir(path.join(root, "queue", "outbox", "worker-1"))).length, 1);

    await adapter.enqueueReport({ report_id: "report-1", return_to: "planning-1", status: "returned-to-planning" });
    assert.equal((await adapter.receiveReports("planning-1")).length, 1);
    const archived = await adapter.acknowledgeReport("planning-1", "report-1");
    assert.equal(archived.acknowledged, true);
    assert.equal((await adapter.receiveReports("planning-1")).length, 0);
    assert.match(await readFile(archived.path, "utf8"), /report-1/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("automatic dispatch pauses instead of treating a file queue as a live Agent transport", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "flowstate-automatic-transport-"));
  try {
    const adapter = new FileQueueAdapter({ root: path.join(root, "queue") });
    const dispatcher = new FlowStateDispatcher({
      store: new FlowStateStore({ root: path.join(root, "state") }),
      adapter,
      projectId: "demo",
    });
    const runtime = new FlowStateRuntime({ dispatcher });
    await dispatcher.createPlan({ planSeriesId: "series-transport", planVersion: "v1", plan: makePlan({ plan_id: "series-transport-plan-v1" }) });
    await dispatcher.approvePlan({ planSeriesId: "series-transport", planVersion: "v1", approval: { approver: "user", plan_id: "series-transport-plan-v1", plan_version: "v1", decision: "approved", acknowledged_risks: ["R01"] } });
    const cycle = await runtime.runOnce();
    assert.equal(cycle.errors.length, 0);
    const state = await dispatcher.store.load("demo");
    assert.equal(state.series["series-transport"].status, "waiting-on-planning");
    assert.equal(state.series["series-transport"].plans.v1.blockers.find((blocker) => blocker.blocker_id === "transport-T01").status, "blocked");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("runtime resumes queued reports and reviews and dispatches the next task once", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "flowstate-runtime-"));
  let sequence = 0;
  try {
    const adapter = new ConnectedQueueAdapter({ root: path.join(root, "queue"), id: (prefix) => `${prefix}-${++sequence}` });
    const dispatcher = new FlowStateDispatcher({
      store: new FlowStateStore({ root: path.join(root, "state") }),
      adapter,
      projectId: "demo",
      id: (prefix) => `${prefix}-${++sequence}`,
    });
    const runtime = new FlowStateRuntime({ dispatcher, pollIntervalMs: 10 });
    await dispatcher.createPlan({ planSeriesId: "series-runtime", planVersion: "v1", plan: makePlan({ plan_id: "series-runtime-plan-v1" }) });
    await dispatcher.approvePlan({ planSeriesId: "series-runtime", planVersion: "v1", approval: { approver: "user", plan_id: "series-runtime-plan-v1", plan_version: "v1", decision: "approved", acknowledged_risks: ["R01"] } });
    const first = await dispatcher.dispatchReady({ planSeriesId: "series-runtime", planVersion: "v1" });
    const firstDispatch = first.dispatches[0];

    await adapter.enqueueReport({
      report_id: "runtime-report-1",
      return_to: "connected-planning-series-runtime",
      planning_session_id: "connected-planning-series-runtime",
      execution_session_id: "connected-execution-series-runtime",
      project_id: "demo",
      plan_series_id: "series-runtime",
      plan_id: "series-runtime-plan-v1",
      plan_version: "v1",
      task_id: "T01",
      dispatch_id: firstDispatch.dispatch_id,
      status: "returned-to-planning",
      evidence: ["diff"],
    });
    const reportCycle = await runtime.runOnce();
    assert.equal(reportCycle.reports.length, 1);
    assert.equal(reportCycle.errors.length, 0);

    await adapter.enqueueReview({
      review_id: "runtime-review-1",
      return_to: "connected-execution-series-runtime",
      reviewer_session_id: "connected-planning-series-runtime",
      report_id: "runtime-report-1",
      plan_series_id: "series-runtime",
      plan_id: "series-runtime-plan-v1",
      plan_version: "v1",
      task_id: "T01",
      decision: "accepted",
    });
    const reviewCycle = await runtime.runOnce();
    assert.equal(reviewCycle.reviews.length, 1);
    assert.equal(reviewCycle.reviews[0].next_dispatches.length, 1);
    assert.equal(reviewCycle.errors.length, 0);

    const state = await dispatcher.store.load("demo");
    assert.equal(state.series["series-runtime"].plans.v1.tasks.find((task) => task.task_id === "T02").status, "dispatched");
    const workerQueue = path.join(root, "queue", "outbox", "connected-worker-series-runtime-T02");
    assert.equal((await readdir(workerQueue)).length, 1);

    const repeat = await runtime.runOnce();
    assert.equal(repeat.reports.length, 0);
    assert.equal(repeat.reviews.length, 0);
    assert.equal(repeat.dispatches.length, 0);
    assert.equal((await readdir(workerQueue)).length, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("runtime keeps the series paused when planning waits for the user", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "flowstate-runtime-blocked-"));
  let sequence = 0;
  try {
    const adapter = new FileQueueAdapter({ root: path.join(root, "queue"), id: (prefix) => `${prefix}-${++sequence}` });
    const dispatcher = new FlowStateDispatcher({
      store: new FlowStateStore({ root: path.join(root, "state") }),
      adapter,
      projectId: "demo",
      id: (prefix) => `${prefix}-${++sequence}`,
    });
    const runtime = new FlowStateRuntime({ dispatcher });
    await dispatcher.createPlan({ planSeriesId: "series-blocked", planVersion: "v1", plan: makePlan({ plan_id: "series-blocked-plan-v1" }) });
    await dispatcher.approvePlan({ planSeriesId: "series-blocked", planVersion: "v1", approval: { approver: "user", plan_id: "series-blocked-plan-v1", plan_version: "v1", decision: "approved", acknowledged_risks: ["R01"] } });
    const first = await dispatcher.dispatchReady({ planSeriesId: "series-blocked", planVersion: "v1" });
    await adapter.enqueueReport({
      report_id: "blocked-report-1",
      return_to: "local-planning-series-blocked",
      project_id: "demo",
      plan_series_id: "series-blocked",
      plan_id: "series-blocked-plan-v1",
      plan_version: "v1",
      task_id: "T01",
      dispatch_id: first.dispatches[0].dispatch_id,
      status: "blocked",
      new_blockers: [{ blocker_id: "B01", dependency: "user decision", reason: "The approved plan lacks a required user decision.", impact: "cannot continue", recommended_solution: "Ask the user for the missing decision.", requires_user: true }],
    });
    await runtime.runOnce();
    await adapter.enqueueReview({
      review_id: "blocked-review-1",
      return_to: "local-execution-series-blocked",
      plan_series_id: "series-blocked",
      plan_id: "series-blocked-plan-v1",
      plan_version: "v1",
      task_id: "T01",
      decision: "await-user",
      requires_user: true,
      opinion: "Planning cannot make the required user-owned decision.",
      next_action: "wait-for-user",
    });
    const cycle = await runtime.runOnce();
    assert.equal(cycle.dispatches.length, 0);
    const state = await dispatcher.store.load("demo");
    assert.equal(state.series["series-blocked"].status, "waiting-on-planning");
    assert.equal(state.series["series-blocked"].plans.v1.status, "awaiting-user-action");
    assert.equal(state.series["series-blocked"].plans.v1.tasks.find((task) => task.task_id === "T02").status, "pending");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("runtime supports an unscoped same-window cycle without product paths", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "flowstate-runtime-unscoped-"));
  try {
    const adapter = new FileQueueAdapter({ root: path.join(root, "queue") });
    const dispatcher = new FlowStateDispatcher({
      store: new FlowStateStore({ root: path.join(root, "state") }),
      adapter,
      projectId: "unscoped",
    });
    const runtime = new FlowStateRuntime({ dispatcher, pollIntervalMs: 10 });
    await dispatcher.createPlan({ planSeriesId: "series-unscoped", planVersion: "v1", plan: makePlan({ project_id: "unscoped", plan_id: "series-unscoped-plan-v1", risks: [], tasks: [] }) });
    await dispatcher.approvePlan({ planSeriesId: "series-unscoped", planVersion: "v1", approval: { approver: "user", plan_id: "series-unscoped-plan-v1", plan_version: "v1", decision: "approved", acknowledged_risks: [] } });
    const result = await runtime.watch({ intervalMs: 10, maxCycles: 2 });
    assert.equal(result.project_id, "unscoped");
    assert.equal(result.cycles, 2);
    assert.equal(result.stopped, false);
    assert.equal((await dispatcher.store.load("unscoped")).series["series-unscoped"].status, "approved");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("accepted serial stages activate the next parallel stage with stage Skills", async () => {
  const { root, adapter, dispatcher } = await fixture();
  try {
    await dispatcher.createPlan({
      planSeriesId: "series-stages",
      planVersion: "v1",
      plan: makePlan({
        plan_id: "series-stages-plan-v1",
        risks: [],
        max_parallel: 2,
        stages: [
          { stage_id: "stage-1", title: "Foundation", order: 1, kind: "serial" },
          { stage_id: "stage-2", title: "Parallel validation", order: 2, kind: "parallel", required_skills: ["pdgo-tdd-work"], agent_selectors: [{ external_agent_id: "agency-agents/testing/testing-api-tester.md", division: "testing" }] },
        ],
        tasks: [
          { task_id: "T01", title: "Foundation", objective: "Prepare the foundation.", stage_id: "stage-1", stage_order: 1, acceptance_criteria: ["foundation exists"] },
          { task_id: "T02", title: "Validation A", objective: "Validate path A.", stage_id: "stage-2", stage_order: 2, acceptance_criteria: ["A passes"] },
          { task_id: "T03", title: "Validation B", objective: "Validate path B.", stage_id: "stage-2", stage_order: 2, acceptance_criteria: ["B passes"] },
        ],
      }),
    });
    await dispatcher.approvePlan({ planSeriesId: "series-stages", planVersion: "v1", approval: { approver: "user", plan_id: "series-stages-plan-v1", plan_version: "v1", decision: "approved", acknowledged_risks: [] } });
    const first = await dispatcher.dispatchReady({ planSeriesId: "series-stages", planVersion: "v1" });
    assert.deepEqual(first.dispatches.map((dispatch) => dispatch.task_id), ["T01"]);
    await dispatcher.ingestExecutionReport({ report_id: "stage-report-1", project_id: "demo", plan_series_id: "series-stages", plan_id: "series-stages-plan-v1", plan_version: "v1", task_id: "T01", dispatch_id: first.dispatches[0].dispatch_id, status: "returned-to-planning" });
    const review = await dispatcher.ingestPlanningReview({ review_id: "stage-review-1", report_id: "stage-report-1", plan_series_id: "series-stages", plan_id: "series-stages-plan-v1", plan_version: "v1", task_id: "T01", decision: "accepted" });
    assert.deepEqual(review.next_dispatches.map((dispatch) => dispatch.task_id).sort(), ["T02", "T03"]);
    assert.deepEqual(review.next_dispatches[0].required_skills, ["pdgo-tdd-work"]);
    assert.equal(review.next_dispatches[0].external_agent_id, "agency-agents/testing/testing-api-tester.md");
    assert.equal(review.next_dispatches[0].external_agent_division, "testing");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("revision-required creates an in-scope correction dispatch until acceptance", async () => {
  const { root, adapter, dispatcher } = await fixture();
  try {
    await dispatcher.createPlan({ planSeriesId: "series-revision", planVersion: "v1", plan: makePlan({ plan_id: "series-revision-plan-v1", risks: [] }) });
    await dispatcher.approvePlan({ planSeriesId: "series-revision", planVersion: "v1", approval: { approver: "user", plan_id: "series-revision-plan-v1", plan_version: "v1", decision: "approved", acknowledged_risks: [] } });
    let dispatch = await dispatcher.dispatchReady({ planSeriesId: "series-revision", planVersion: "v1" });
    await dispatcher.ingestExecutionReport({ report_id: "revision-report-1", project_id: "demo", plan_series_id: "series-revision", plan_id: "series-revision-plan-v1", plan_version: "v1", task_id: "T01", dispatch_id: dispatch.dispatches[0].dispatch_id, status: "returned-to-planning" });
    const correction = await dispatcher.ingestPlanningReview({ review_id: "revision-review-1", report_id: "revision-report-1", plan_series_id: "series-revision", plan_id: "series-revision-plan-v1", plan_version: "v1", task_id: "T01", decision: "revision-required", required_changes: ["Add the missing validation."], criteria_results: [{ criterion: "change exists", result: "fail" }] });
    assert.equal(correction.revision_dispatches.length, 1);
    assert.equal(correction.revision_attempt, 1);
    assert.deepEqual(correction.revision_dispatches[0].revision.feedback, ["Add the missing validation.", { criterion: "change exists", result: "fail" }]);

    dispatch = await dispatcher.dispatchReady({ planSeriesId: "series-revision", planVersion: "v1" });
    assert.equal(dispatch.dispatches.length, 0);
    const stateAfterCorrection = await dispatcher.store.load("demo");
    const taskAfterCorrection = stateAfterCorrection.series["series-revision"].plans.v1.tasks.find((task) => task.task_id === "T01");
    assert.equal(taskAfterCorrection.status, "dispatched");
    assert.equal(taskAfterCorrection.revision_attempts, 1);

    await dispatcher.ingestExecutionReport({ report_id: "revision-report-2", project_id: "demo", plan_series_id: "series-revision", plan_id: "series-revision-plan-v1", plan_version: "v1", task_id: "T01", dispatch_id: taskAfterCorrection.dispatch_id, status: "returned-to-planning" });
    const accepted = await dispatcher.ingestPlanningReview({ review_id: "revision-review-2", report_id: "revision-report-2", plan_series_id: "series-revision", plan_id: "series-revision-plan-v1", plan_version: "v1", task_id: "T01", decision: "accepted" });
    assert.equal(accepted.next_dispatches.length, 1);
    assert.equal(accepted.next_dispatches[0].task_id, "T02");
    const finalState = await dispatcher.store.load("demo");
    assert.equal(finalState.series["series-revision"].plans.v1.tasks.find((task) => task.task_id === "T01").revision_history.at(-1).status, "accepted");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("accepted review with a new risk pauses the plan and requires reapproval", async () => {
  const { root, adapter, dispatcher } = await fixture();
  try {
    await dispatcher.createPlan({
      planSeriesId: "series-risk-review",
      planVersion: "v1",
      plan: makePlan({
        plan_id: "series-risk-review-plan-v1",
        risks: [],
        next_plan: { title: "Follow-up", summary: "Continue after approval.", objective: "Continue.", risks: [], tasks: [{ task_id: "T03", title: "Follow-up task", objective: "Continue the work." }] },
      }),
    });
    await dispatcher.approvePlan({ planSeriesId: "series-risk-review", planVersion: "v1", approval: { approver: "user", plan_id: "series-risk-review-plan-v1", plan_version: "v1", decision: "approved", acknowledged_risks: [] } });
    const first = await dispatcher.dispatchReady({ planSeriesId: "series-risk-review", planVersion: "v1" });
    await dispatcher.ingestExecutionReport({ report_id: "risk-review-report-1", project_id: "demo", plan_series_id: "series-risk-review", plan_id: "series-risk-review-plan-v1", plan_version: "v1", task_id: "T01", dispatch_id: first.dispatches[0].dispatch_id, status: "returned-to-planning", new_risks: [{ risk_id: "R99", severity: "low", impact: "requires a planning decision" }] });
    const review = await dispatcher.ingestPlanningReview({
      review_id: "risk-review-1",
      report_id: "risk-review-report-1",
      plan_series_id: "series-risk-review",
      plan_id: "series-risk-review-plan-v1",
      plan_version: "v1",
      task_id: "T01",
      decision: "accepted",
      scope_change: true,
    });
    assert.equal(review.plan_completed, false);
    assert.equal(review.auto_dispatch_ready, false);
    assert.equal(review.next_dispatches, undefined);
    assert.equal(review.next_plan, undefined);
    const state = await dispatcher.store.load("demo");
    assert.equal(state.series["series-risk-review"].status, "waiting-on-planning");
    assert.equal(state.series["series-risk-review"].plans.v1.status, "awaiting-user-approval");
    assert.equal(state.series["series-risk-review"].plans.v1.approval, null);
    assert.equal(state.series["series-risk-review"].plans.v1.risks.find((risk) => risk.risk_id === "R99").status, "open");
    assert.equal(state.series["series-risk-review"].plans.v1.tasks.find((task) => task.task_id === "T02").status, "pending");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("completed plans proactively create the next version but keep its approval gate", async () => {
  const { root, adapter, dispatcher } = await fixture();
  try {
    await dispatcher.createPlan({
      planSeriesId: "series-next-plan",
      planVersion: "v1",
      plan: makePlan({
        plan_id: "series-next-plan-v1",
        risks: [],
        tasks: [{ task_id: "T01", title: "First stage", objective: "Complete the first stage." }],
        next_plan: { title: "Second stage", summary: "Continue after the first stage.", objective: "Complete the second stage.", risks: [], tasks: [{ task_id: "T02", title: "Second stage task", objective: "Complete the second stage task." }] },
      }),
    });
    await dispatcher.approvePlan({ planSeriesId: "series-next-plan", planVersion: "v1", approval: { approver: "user", plan_id: "series-next-plan-v1", plan_version: "v1", decision: "approved", acknowledged_risks: [] } });
    const first = await dispatcher.dispatchReady({ planSeriesId: "series-next-plan", planVersion: "v1" });
    await dispatcher.ingestExecutionReport({ report_id: "next-plan-report-1", project_id: "demo", plan_series_id: "series-next-plan", plan_id: "series-next-plan-v1", plan_version: "v1", task_id: "T01", dispatch_id: first.dispatches[0].dispatch_id, status: "returned-to-planning" });
    const completed = await dispatcher.ingestPlanningReview({ review_id: "next-plan-review-1", report_id: "next-plan-report-1", plan_series_id: "series-next-plan", plan_id: "series-next-plan-v1", plan_version: "v1", task_id: "T01", decision: "accepted" });
    assert.equal(completed.plan_completed, true);
    assert.equal(completed.next_plan.created, true);
    const state = await dispatcher.store.load("demo");
    assert.equal(state.series["series-next-plan"].current_plan_version, "v2");
    assert.equal(state.series["series-next-plan"].plans.v2.status, "awaiting-user-approval");
    await dispatcher.approvePlan({ planSeriesId: "series-next-plan", planVersion: "v2", approval: { approver: "user", plan_id: state.series["series-next-plan"].plans.v2.plan_id, plan_version: "v2", decision: "approved", acknowledged_risks: [] } });
    const second = await dispatcher.dispatchReady({ planSeriesId: "series-next-plan", planVersion: "v2" });
    assert.equal(second.dispatches[0].task_id, "T02");
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

test("Codex App Server adapter can receive governed reports and reviews when transport provides polling", async () => {
  const received = [];
  const adapter = new CodexAppServerAdapter({
    request: async (method) => method === "thread/start" ? { thread: { id: "thread-1" } } : { turn: { id: "turn-1" } },
    receive: async (request) => {
      received.push(request);
      return request.message_types[0] === "EXECUTION_REPORT"
        ? [{ message_type: "EXECUTION_REPORT", report_id: "report-1" }]
        : [{ message_type: "REVIEW_DECISION", review_id: "review-1" }];
    },
  });
  assert.equal((await adapter.receiveReports("planning-1"))[0].report_id, "report-1");
  assert.equal((await adapter.receiveReviews("execution-1"))[0].review_id, "review-1");
  assert.deepEqual(received, [
    { session_id: "planning-1", message_types: ["EXECUTION_REPORT", "EXECUTION_STOPPED", "BLOCKER_REPORT"] },
    { session_id: "execution-1", message_types: ["REVIEW_DECISION", "PLANNING_BLOCKER_OPINION"] },
  ]);
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
