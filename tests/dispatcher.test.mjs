import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
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
    return {
      planning_session_id: `plan-session-${seriesId}`,
      execution_session_id: `exec-session-${seriesId}`,
      reviewer_session_id: `review-session-${seriesId}`,
      delivery_status: "connected",
      adapter: "mock",
    };
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

class AttestedAdapter extends MockAdapter {
  constructor({ clock, mutateAttestation = null } = {}) {
    super();
    this.clock = clock;
    this.mutateAttestation = mutateAttestation;
    this.attestationCalls = [];
  }

  async attestAuthorization(request) {
    this.attestationCalls.push(request);
    const attestation = {
      proof_id: "trusted-proof-1",
      transport: "injected-test-adapter",
      boundary_digest: request.boundary_digest,
      plan_id: request.plan_id,
      plan_version: request.plan_version,
      attested_at: new Date(this.clock()).toISOString(),
      expires_at: "2026-08-11T02:00:00.000Z",
    };
    return this.mutateAttestation ? this.mutateAttestation(attestation, request) : attestation;
  }
}

class ConnectedQueueAdapter extends FileQueueAdapter {
  constructor(options) {
    super(options);
    this.authenticatedReviewSource = true;
  }

  async ensureSeriesSessions({ seriesId }) {
    return {
      planning_session_id: `connected-planning-${seriesId}`,
      execution_session_id: `connected-execution-${seriesId}`,
      reviewer_session_id: `connected-review-${seriesId}`,
      platform_session_ids: {
        planning: `connected-planning-${seriesId}`,
        execution: `connected-execution-${seriesId}`,
        review: `connected-review-${seriesId}`,
      },
      delivery_status: "connected",
      adapter: "connected-queue-test-double",
    };
  }

  async ensureWorkerSession({ seriesId, taskId }) {
    const workerSessionId = `connected-worker-${seriesId}-${taskId}`;
    return { worker_session_id: workerSessionId, platform_session_id: workerSessionId, delivery_status: "connected" };
  }
}

class SelectiveTransportAdapter extends ConnectedQueueAdapter {
  constructor(options) {
    super(options);
    this.unavailableTaskIds = new Set(options.unavailableTaskIds ?? []);
  }

  async ensureWorkerSession({ seriesId, taskId }) {
    if (this.unavailableTaskIds.has(taskId)) {
      return {
        worker_session_id: `local-execution-worker-${seriesId}-${taskId}`,
        platform_session_id: null,
        delivery_status: "adapter-unavailable",
      };
    }
    return super.ensureWorkerSession({ seriesId, taskId });
  }
}

function makePlan(overrides = {}) {
  return {
    role_contract: {
      version: "legacy-v1",
      migration: "role-assignments-not-recorded",
    },
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

function bossRoleAssignments(overrides = {}) {
  return {
    planning: { host_agent_type: "Multi-Agent Systems Architect", selection_source: "approved-role-selection:acy", permission_mode: "read-only" },
    execution: { host_agent_type: "Senior Developer", selection_source: "approved-role-selection:acy", permission_mode: "approved-scope-write" },
    review: { host_agent_type: "Code Reviewer", selection_source: "approved-role-selection:acy", permission_mode: "read-only" },
    ...overrides,
  };
}

function bossExecutionBaseline(overrides = {}) {
  return {
    goal: "Ship the approved bounded result.",
    confirmed_decisions: [{ decision: "Preserve the source.", source: "user-approved plan v1" }],
    allowed_objects: ["result.txt"],
    forbidden_objects: ["input.txt"],
    allowed_actions: ["create"],
    forbidden_actions: ["overwrite"],
    completion_criteria: ["result exists"],
    accepter: "independent reviewer",
    current_action: "Create result.txt.",
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

async function ingestObservedReview(dispatcher, review, observedSessionId = review.reviewer_session_id) {
  return dispatcher.ingestPlanningReview(review, { observedSessionId, sourceVerified: true });
}

test("one trusted approval envelope survives a fully host-bound BossCoding v2 batch unchanged", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "flowstate-authorization-"));
  const clock = () => Date.parse("2026-08-11T01:00:00.000Z");
  const adapter = new AttestedAdapter({ clock });
  const dispatcher = new FlowStateDispatcher({
    store: new FlowStateStore({ root: path.join(root, "state") }),
    adapter,
    projectId: "demo",
    clock,
    id: (prefix) => `${prefix}-${++adapter.sequence}`,
  });
  try {
    await dispatcher.createPlan({
      planSeriesId: "series-authorization",
      planVersion: "v1",
      plan: makePlan({
        plan_id: "series-authorization-plan-v1",
        risks: [],
        role_contract: { version: "bosscoding-v2" },
        role_assignments: bossRoleAssignments({
          execution: { host_agent_type: "Minimal Change Engineer", selection_source: "approved-role-selection:secretary", permission_mode: "approved-scope-write" },
        }),
        execution_baseline: bossExecutionBaseline(),
        authorization_policy: { required: true },
      }),
    });
    const approval = await dispatcher.approvePlan({
      planSeriesId: "series-authorization",
      planVersion: "v1",
      approval: {
        approval_id: "approval-authorization-v1",
        approver: "user",
        plan_id: "series-authorization-plan-v1",
        plan_version: "v1",
        decision: "approved",
        acknowledged_risks: [],
      },
    });
    await dispatcher.bindHostSession({
      planSeriesId: "series-authorization",
      planVersion: "v1",
      role: "planning",
      sessionId: "plan-session-series-authorization",
      hostAgentType: "Multi-Agent Systems Architect",
      selectionSource: "approved-role-selection:acy",
    });
    await dispatcher.bindHostSession({
      planSeriesId: "series-authorization",
      planVersion: "v1",
      role: "review",
      sessionId: "review-session-series-authorization",
      hostAgentType: "Code Reviewer",
      selectionSource: "approved-role-selection:acy",
    });
    assert.equal(adapter.attestationCalls.length, 1);
    assert.match(approval.authorization_envelope.boundary_digest, /^[a-f0-9]{64}$/);

    const afterApproval = await dispatcher.store.load("demo");
    const approvedPlan = afterApproval.series["series-authorization"].plans.v1;
    assert.deepEqual(approvedPlan.authorization_envelope, approval.authorization_envelope);
    assert.deepEqual(approvedPlan.approval.authorization_envelope, approval.authorization_envelope);

    const dispatched = await dispatcher.dispatchReady({ planSeriesId: "series-authorization", planVersion: "v1" });
    const dispatch = dispatched.dispatches[0];
    assert.deepEqual(dispatch.authorization_envelope, approval.authorization_envelope);
    await dispatcher.bindHostWorker({
      planSeriesId: "series-authorization",
      planVersion: "v1",
      taskId: "T01",
      dispatchId: dispatch.dispatch_id,
      workerSessionId: "authorization-execution-worker",
      hostAgentType: "Minimal Change Engineer",
      selectionSource: "approved-role-selection:secretary",
    });

    await dispatcher.ingestExecutionReport({
      report_id: "authorization-report-1",
      project_id: "demo",
      plan_series_id: "series-authorization",
      plan_id: "series-authorization-plan-v1",
      plan_version: "v1",
      task_id: "T01",
      dispatch_id: dispatch.dispatch_id,
      worker_session_id: "authorization-execution-worker",
      status: "returned-to-planning",
      authorization_envelope: approval.authorization_envelope,
    });
    const reviewRequest = adapter.messages.find((message) => message.message_type === "REVIEW_REQUEST" && message.report_id === "authorization-report-1");
    assert.deepEqual(reviewRequest.authorization_envelope, approval.authorization_envelope);
    const reviewed = await ingestObservedReview(dispatcher, {
      review_id: "authorization-review-1",
      reviewer_session_id: "review-session-series-authorization",
      report_id: "authorization-report-1",
      plan_series_id: "series-authorization",
      plan_id: "series-authorization-plan-v1",
      plan_version: "v1",
      task_id: "T01",
      decision: "accepted",
      criteria_results: [{ criterion: "change exists", result: "pass" }],
      evidence_checked: [{ evidence: "diff", result: "pass" }],
      authorization_envelope: approval.authorization_envelope,
    });
    assert.equal(reviewed.next_dispatches.length, 1);
    assert.equal(reviewed.next_dispatches[0].task_id, "T02");
    assert.deepEqual(reviewed.next_dispatches[0].authorization_envelope, approval.authorization_envelope);

    const finalState = await dispatcher.store.load("demo");
    const series = finalState.series["series-authorization"];
    assert.deepEqual(series.reports["authorization-report-1"].authorization_envelope, approval.authorization_envelope);
    assert.deepEqual(series.reviews["authorization-review-1"].authorization_envelope, approval.authorization_envelope);
    assert.equal(adapter.attestationCalls.length, 1);
    assert.equal(finalState.events.filter((event) => event.type === "USER_PLAN_APPROVED").length, 1);
    assert.equal(new Set([
      approvedPlan.authorization_envelope.boundary_digest,
      dispatch.authorization_envelope.boundary_digest,
      reviewRequest.authorization_envelope.boundary_digest,
      series.reports["authorization-report-1"].authorization_envelope.boundary_digest,
      series.reviews["authorization-review-1"].authorization_envelope.boundary_digest,
      reviewed.next_dispatches[0].authorization_envelope.boundary_digest,
    ]).size, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("authorization envelope rejects drift in approved risk details", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "flowstate-authorization-risk-drift-"));
  const clock = () => Date.parse("2026-08-11T01:00:00.000Z");
  const adapter = new AttestedAdapter({ clock });
  const store = new FlowStateStore({ root: path.join(root, "state") });
  const dispatcher = new FlowStateDispatcher({
    store,
    adapter,
    projectId: "demo",
    clock,
  });
  try {
    await dispatcher.createPlan({
      planSeriesId: "series-authorization-risk-drift",
      planVersion: "v1",
      plan: makePlan({
        plan_id: "plan-authorization-risk-drift-v1",
        authorization_policy: { required: true },
      }),
    });
    await dispatcher.approvePlan({
      planSeriesId: "series-authorization-risk-drift",
      planVersion: "v1",
      approval: {
        approval_id: "approval-authorization-risk-drift",
        approver: "user",
        plan_id: "plan-authorization-risk-drift-v1",
        plan_version: "v1",
        decision: "approved",
        acknowledged_risks: ["R01"],
      },
    });

    const state = await store.load("demo");
    state.series["series-authorization-risk-drift"].plans.v1.risks[0].severity = "critical";
    state.series["series-authorization-risk-drift"].plans.v1.risks[0].impact = "unbounded";
    await store.save(state);

    await assert.rejects(
      () => dispatcher.dispatchReady({ planSeriesId: "series-authorization-risk-drift", planVersion: "v1" }),
      /authorization boundary digest does not match/i,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("authorization attestation fails closed for unavailable, forged, mismatched, expired, or wrong-version proof", async () => {
  const cases = [
    {
      name: "FileQueue adapter has no authenticated proof channel",
      adapter: (root, clock) => new FileQueueAdapter({ root: path.join(root, "queue"), clock }),
      approvalExtra: {},
      error: /attestation.*unavailable|host transport adapter/i,
    },
    {
      name: "self-reported verified JSON is not host proof",
      adapter: () => new MockAdapter(),
      approvalExtra: { authorization_envelope: { verified: true }, host_attestation: { verified: true }, verified: true },
      error: /attestation.*unavailable|host transport adapter/i,
    },
    {
      name: "digest mismatch",
      adapter: (_root, clock) => new AttestedAdapter({ clock, mutateAttestation: (proof) => ({ ...proof, boundary_digest: "0".repeat(64) }) }),
      approvalExtra: {},
      error: /boundary digest does not match/i,
    },
    {
      name: "expired proof",
      adapter: (_root, clock) => new AttestedAdapter({ clock, mutateAttestation: (proof) => ({ ...proof, expires_at: "2026-08-11T00:59:59.000Z" }) }),
      approvalExtra: {},
      error: /expired|invalid expiry/i,
    },
    {
      name: "wrong plan version",
      adapter: (_root, clock) => new AttestedAdapter({ clock, mutateAttestation: (proof) => ({ ...proof, plan_version: "v2" }) }),
      approvalExtra: {},
      error: /plan id or version does not match/i,
    },
  ];

  for (const entry of cases) {
    const root = await mkdtemp(path.join(os.tmpdir(), "flowstate-authorization-negative-"));
    const clock = () => Date.parse("2026-08-11T01:00:00.000Z");
    const adapter = entry.adapter(root, clock);
    const dispatcher = new FlowStateDispatcher({
      store: new FlowStateStore({ root: path.join(root, "state") }),
      adapter,
      projectId: "demo",
      clock,
    });
    try {
      await dispatcher.createPlan({
        planSeriesId: `series-${entry.name.replace(/\W+/g, "-").toLowerCase()}`,
        planVersion: "v1",
        plan: makePlan({ plan_id: `plan-${entry.name.replace(/\W+/g, "-").toLowerCase()}`, risks: [], authorization_policy: { required: true } }),
      });
      const seriesId = `series-${entry.name.replace(/\W+/g, "-").toLowerCase()}`;
      const planId = `plan-${entry.name.replace(/\W+/g, "-").toLowerCase()}`;
      await assert.rejects(() => dispatcher.approvePlan({
        planSeriesId: seriesId,
        planVersion: "v1",
        approval: {
          approval_id: `approval-${entry.name.replace(/\W+/g, "-").toLowerCase()}`,
          approver: "user",
          plan_id: planId,
          plan_version: "v1",
          decision: "approved",
          acknowledged_risks: [],
          ...entry.approvalExtra,
        },
      }), entry.error, entry.name);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
});

test("authorization envelope rejects missing, mismatched, and expired report or review artifacts", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "flowstate-authorization-artifacts-"));
  let now = Date.parse("2026-08-11T01:00:00.000Z");
  const clock = () => now;
  const adapter = new AttestedAdapter({ clock });
  const dispatcher = new FlowStateDispatcher({
    store: new FlowStateStore({ root: path.join(root, "state") }),
    adapter,
    projectId: "demo",
    clock,
  });
  try {
    await dispatcher.createPlan({ planSeriesId: "series-artifacts", planVersion: "v1", plan: makePlan({ plan_id: "plan-artifacts-v1", risks: [], authorization_policy: { required: true } }) });
    const approval = await dispatcher.approvePlan({ planSeriesId: "series-artifacts", planVersion: "v1", approval: { approval_id: "approval-artifacts", approver: "user", plan_id: "plan-artifacts-v1", plan_version: "v1", decision: "approved", acknowledged_risks: [] } });
    const dispatched = await dispatcher.dispatchReady({ planSeriesId: "series-artifacts", planVersion: "v1" });
    const dispatch = dispatched.dispatches[0];
    const report = {
      report_id: "artifact-report-1",
      project_id: "demo",
      plan_series_id: "series-artifacts",
      plan_id: "plan-artifacts-v1",
      plan_version: "v1",
      task_id: "T01",
      dispatch_id: dispatch.dispatch_id,
      status: "returned-to-planning",
    };
    await assert.rejects(() => dispatcher.ingestExecutionReport(report), /authorization envelope is missing/i);
    await assert.rejects(() => dispatcher.ingestExecutionReport({ ...report, authorization_envelope: { ...approval.authorization_envelope, boundary_digest: "f".repeat(64) } }), /does not match the approved envelope/i);
    await dispatcher.ingestExecutionReport({ ...report, authorization_envelope: approval.authorization_envelope });

    const review = {
      review_id: "artifact-review-1",
      reviewer_session_id: "review-session-series-artifacts",
      report_id: "artifact-report-1",
      plan_series_id: "series-artifacts",
      plan_id: "plan-artifacts-v1",
      plan_version: "v1",
      task_id: "T01",
      decision: "accepted",
      criteria_results: [{ criterion: "change exists", result: "pass" }],
      evidence_checked: [{ evidence: "diff", result: "pass" }],
    };
    await assert.rejects(() => ingestObservedReview(dispatcher, review), /authorization envelope is missing/i);
    await assert.rejects(() => ingestObservedReview(dispatcher, { ...review, authorization_envelope: { ...approval.authorization_envelope, plan_version: "v2" } }), /does not match the approved envelope|plan id or version/i);
    now = Date.parse("2026-08-11T02:00:00.000Z");
    await assert.rejects(() => ingestObservedReview(dispatcher, { ...review, authorization_envelope: approval.authorization_envelope }), /expired/i);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("authorization digest detects plan-version, scope, and role drift before dispatch", async () => {
  for (const [name, mutate] of [
    ["plan version", (plan) => { plan.plan_version = "v2"; }],
    ["scope", (plan) => { plan.allowed_paths.push("outside-approved-scope.txt"); }],
    ["role", (plan) => { plan.role_assignments.execution = { host_agent_type: "Different Worker", selection_source: "unapproved", permission_mode: "approved-scope-write" }; }],
  ]) {
    const root = await mkdtemp(path.join(os.tmpdir(), "flowstate-authorization-drift-"));
    const clock = () => Date.parse("2026-08-11T01:00:00.000Z");
    const adapter = new AttestedAdapter({ clock });
    const dispatcher = new FlowStateDispatcher({ store: new FlowStateStore({ root: path.join(root, "state") }), adapter, projectId: "demo", clock });
    const seriesId = `series-drift-${name.replace(/\s+/g, "-")}`;
    try {
      await dispatcher.createPlan({ planSeriesId: seriesId, planVersion: "v1", plan: makePlan({ plan_id: `${seriesId}-v1`, risks: [], authorization_policy: { required: true } }) });
      await dispatcher.approvePlan({ planSeriesId: seriesId, planVersion: "v1", approval: { approval_id: `approval-${seriesId}`, approver: "user", plan_id: `${seriesId}-v1`, plan_version: "v1", decision: "approved", acknowledged_risks: [] } });
      await dispatcher.store.transaction("demo", async (state) => mutate(state.series[seriesId].plans.v1));
      await assert.rejects(() => dispatcher.dispatchReady({ planSeriesId: seriesId, planVersion: "v1" }), /authorization.*(?:version|digest|scope|roles|match)/i, name);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
});

test("authorization digest covers static dispatch selectors, lenses, stages, and concurrency", async () => {
  for (const [name, mutate] of [
    ["task external agent id", (plan) => { plan.tasks[0].external_agent_id = "external-agent-2"; }],
    ["task external agent query", (plan) => { plan.tasks[0].external_agent_query = "different-query"; }],
    ["task external agent division", (plan) => { plan.tasks[0].external_agent_division = "different-division"; }],
    ["stage required skills", (plan) => { plan.stages[0].required_skills.push("different-skill"); }],
    ["stage agent selectors", (plan) => { plan.stages[0].agent_selectors.push({ external_agent_id: "different-agent" }); }],
    ["method lenses", (plan) => { plan.method_lenses.push({ skill_id: "munger", mode: "lens", applies_to: ["execution"], authority: "advisory" }); }],
    ["serial parallel policy", (plan) => { plan.serial_parallel_policy = "parallel"; }],
    ["max parallel", (plan) => { plan.max_parallel = 2; }],
    ["planning policy", (plan) => { plan.planning_policy.max_revision_cycles += 1; }],
  ]) {
    const root = await mkdtemp(path.join(os.tmpdir(), "flowstate-authorization-static-drift-"));
    const clock = () => Date.parse("2026-08-11T01:00:00.000Z");
    const adapter = new AttestedAdapter({ clock });
    const dispatcher = new FlowStateDispatcher({ store: new FlowStateStore({ root: path.join(root, "state") }), adapter, projectId: "demo", clock });
    const seriesId = `series-static-drift-${name.replace(/\s+/g, "-")}`;
    try {
      await dispatcher.createPlan({ planSeriesId: seriesId, planVersion: "v1", plan: makePlan({ plan_id: `${seriesId}-v1`, risks: [], authorization_policy: { required: true } }) });
      await dispatcher.approvePlan({ planSeriesId: seriesId, planVersion: "v1", approval: { approval_id: `approval-${seriesId}`, approver: "user", plan_id: `${seriesId}-v1`, plan_version: "v1", decision: "approved", acknowledged_risks: [] } });
      await dispatcher.store.transaction("demo", async (state) => mutate(state.series[seriesId].plans.v1));
      await assert.rejects(() => dispatcher.dispatchReady({ planSeriesId: seriesId, planVersion: "v1" }), /authorization.*(?:digest|scope|roles|match)/i, name);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
});

test("an authorized report can surface a new risk for review before reapproval", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "flowstate-authorization-new-risk-"));
  const clock = () => Date.parse("2026-08-11T01:00:00.000Z");
  const adapter = new AttestedAdapter({ clock });
  const dispatcher = new FlowStateDispatcher({ store: new FlowStateStore({ root: path.join(root, "state") }), adapter, projectId: "demo", clock });
  try {
    await dispatcher.createPlan({ planSeriesId: "series-authorization-risk", planVersion: "v1", plan: makePlan({ plan_id: "plan-authorization-risk-v1", risks: [], authorization_policy: { required: true } }) });
    const approval = await dispatcher.approvePlan({ planSeriesId: "series-authorization-risk", planVersion: "v1", approval: { approval_id: "approval-authorization-risk", approver: "user", plan_id: "plan-authorization-risk-v1", plan_version: "v1", decision: "approved", acknowledged_risks: [] } });
    const dispatch = (await dispatcher.dispatchReady({ planSeriesId: "series-authorization-risk", planVersion: "v1" })).dispatches[0];
    await dispatcher.ingestExecutionReport({
      report_id: "authorization-risk-report-1",
      project_id: "demo",
      plan_series_id: "series-authorization-risk",
      plan_id: "plan-authorization-risk-v1",
      plan_version: "v1",
      task_id: "T01",
      dispatch_id: dispatch.dispatch_id,
      status: "returned-to-planning",
      new_risks: [{ risk_id: "R99", severity: "low", impact: "requires planning review" }],
      authorization_envelope: approval.authorization_envelope,
    });
    const reviewed = await ingestObservedReview(dispatcher, {
      review_id: "authorization-risk-review-1",
      reviewer_session_id: "review-session-series-authorization-risk",
      report_id: "authorization-risk-report-1",
      plan_series_id: "series-authorization-risk",
      plan_id: "plan-authorization-risk-v1",
      plan_version: "v1",
      task_id: "T01",
      decision: "accepted",
      criteria_results: [{ criterion: "change exists", result: "pass" }],
      evidence_checked: [{ evidence: "diff", result: "pass" }],
      authorization_envelope: approval.authorization_envelope,
    });
    assert.equal(reviewed.auto_dispatch_ready, false);
    const state = await dispatcher.store.load("demo");
    assert.equal(state.series["series-authorization-risk"].plans.v1.status, "awaiting-user-approval");
    assert.equal(adapter.attestationCalls.length, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("legacy plans without an authorization policy remain compatible", async () => {
  const { root, dispatcher } = await fixture();
  try {
    await dispatcher.createPlan({ planSeriesId: "series-legacy-authorization", planVersion: "v1", plan: makePlan({ plan_id: "series-legacy-authorization-v1", risks: [] }) });
    const approval = await dispatcher.approvePlan({ planSeriesId: "series-legacy-authorization", planVersion: "v1", approval: { approver: "user", plan_id: "series-legacy-authorization-v1", plan_version: "v1", decision: "approved", acknowledged_risks: [] } });
    assert.equal(approval.authorization_envelope, undefined);
    const dispatched = await dispatcher.dispatchReady({ planSeriesId: "series-legacy-authorization", planVersion: "v1" });
    assert.equal(dispatched.dispatches[0].authorization_envelope, undefined);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("plan scope is inherited by tasks and task scope can only narrow while prohibitions can only grow", async () => {
  const { root, dispatcher } = await fixture();
  try {
    await dispatcher.createPlan({
      planSeriesId: "series-scope-inheritance",
      planVersion: "v1",
      plan: makePlan({
        plan_id: "series-scope-inheritance-v1",
        risks: [],
        allowed_paths: ["src/a.mjs", "src/b.mjs"],
        forbidden_actions: ["push", "publish"],
        tasks: [
          { task_id: "T01", title: "Inherited", objective: "Use inherited scope.", acceptance_criteria: ["done"], expected_evidence: ["diff"] },
          { task_id: "T02", title: "Narrowed", objective: "Use one path.", allowed_paths: ["src/a.mjs"], forbidden_actions: ["install"], acceptance_criteria: ["done"], expected_evidence: ["diff"] },
        ],
      }),
    });
    const state = await dispatcher.store.load("demo");
    const [inherited, narrowed] = state.series["series-scope-inheritance"].plans.v1.tasks;
    assert.deepEqual(inherited.allowed_paths, ["src/a.mjs", "src/b.mjs"]);
    assert.deepEqual(inherited.forbidden_actions, ["push", "publish"]);
    assert.deepEqual(narrowed.allowed_paths, ["src/a.mjs"]);
    assert.deepEqual(narrowed.forbidden_actions, ["push", "publish", "install"]);

    await assert.rejects(() => dispatcher.createPlan({
      planSeriesId: "series-scope-expansion",
      planVersion: "v1",
      plan: makePlan({
        plan_id: "series-scope-expansion-v1",
        risks: [],
        allowed_paths: ["src/a.mjs"],
        tasks: [{ task_id: "T01", title: "Expand", objective: "Expand scope.", allowed_paths: ["src/b.mjs"], acceptance_criteria: ["done"], expected_evidence: ["diff"] }],
      }),
    }), /tasks\[0\]\.allowed_paths can only narrow plan\.allowed_paths/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("malformed execution report risks fail before any report, event, message, approval, or status mutation", async () => {
  const { root, adapter, dispatcher } = await fixture();
  try {
    await dispatcher.createPlan({ planSeriesId: "series-malformed-risk", planVersion: "v1", plan: makePlan({ plan_id: "series-malformed-risk-v1", risks: [] }) });
    await dispatcher.approvePlan({ planSeriesId: "series-malformed-risk", planVersion: "v1", approval: { approval_id: "approval-malformed-risk", approver: "user", plan_id: "series-malformed-risk-v1", plan_version: "v1", decision: "approved", acknowledged_risks: [] } });
    const dispatch = (await dispatcher.dispatchReady({ planSeriesId: "series-malformed-risk", planVersion: "v1" })).dispatches[0];
    const before = await dispatcher.store.load("demo");
    const messageCount = adapter.messages.length;

    await assert.rejects(() => dispatcher.ingestExecutionReport({
      report_id: "malformed-risk-report",
      project_id: "demo",
      plan_series_id: "series-malformed-risk",
      plan_id: "series-malformed-risk-v1",
      plan_version: "v1",
      task_id: "T01",
      dispatch_id: dispatch.dispatch_id,
      status: "returned-to-planning",
      new_risks: [{ risk_id: "R99", severity: "unknown", impact: "" }],
    }), /new_risks\[0\]/);

    assert.deepEqual(await dispatcher.store.load("demo"), before);
    assert.equal(adapter.messages.length, messageCount);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("explicit approval reuse keeps one real user approval only for an unchanged same-series boundary", async () => {
  const { root, dispatcher } = await fixture();
  try {
    const sharedPlan = makePlan({ plan_id: "series-approval-reuse-v1", risks: [], allowed_paths: ["result.txt"], forbidden_actions: ["push"] });
    await dispatcher.createPlan({ planSeriesId: "series-approval-reuse", planVersion: "v1", plan: sharedPlan });
    await dispatcher.approvePlan({ planSeriesId: "series-approval-reuse", planVersion: "v1", approval: { approval_id: "approval-reuse-source", approver: "user", plan_id: "series-approval-reuse-v1", plan_version: "v1", decision: "approved", acknowledged_risks: [] } });
    await dispatcher.createPlan({ planSeriesId: "series-approval-reuse", planVersion: "v2", relation: "extension", plan: { ...sharedPlan, plan_id: "series-approval-reuse-v2" } });
    await dispatcher.approvePlan({
      planSeriesId: "series-approval-reuse",
      planVersion: "v2",
      approval_reuse: { approval_id: "approval-reuse-source", source_plan_id: "series-approval-reuse-v1", source_plan_version: "v1" },
    });
    let state = await dispatcher.store.load("demo");
    assert.equal(state.series["series-approval-reuse"].plans.v2.approval.approval_id, "approval-reuse-source");
    assert.equal(state.events.filter((event) => event.type === "USER_PLAN_APPROVED").length, 1);
    assert.equal(state.events.filter((event) => event.type === "APPROVAL_REUSED").length, 1);

    await dispatcher.createPlan({
      planSeriesId: "series-approval-reuse",
      planVersion: "v3",
      relation: "extension",
      plan: { ...sharedPlan, plan_id: "series-approval-reuse-v3", allowed_paths: ["result.txt", "outside.txt"] },
    });
    await assert.rejects(() => dispatcher.approvePlan({
      planSeriesId: "series-approval-reuse",
      planVersion: "v3",
      approval_reuse: { approval_id: "approval-reuse-source", source_plan_id: "series-approval-reuse-v1", source_plan_version: "v1" },
    }), /approval reuse cannot expand or change the approved boundary/);
    state = await dispatcher.store.load("demo");
    assert.equal(state.series["series-approval-reuse"].plans.v3.approval, null);
    assert.equal(state.events.filter((event) => event.type === "APPROVAL_REUSED").length, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("approval reuse rejects stage, planning, and concurrency drift", async () => {
  for (const [name, overrides] of [
    ["stages", { stages: [{ stage_id: "stage-1", title: "Changed stage", order: 1, kind: "serial", agent_selectors: [{ external_agent_id: "different-agent" }] }] }],
    ["planning-policy", { planning_policy: { max_revision_cycles: 7 } }],
    ["serial-parallel-policy", { serial_parallel_policy: "parallel" }],
    ["max-parallel", { max_parallel: 2 }],
  ]) {
    const { root, dispatcher } = await fixture();
    const seriesId = `series-approval-reuse-${name}`;
    try {
      const sharedPlan = makePlan({
        plan_id: `${seriesId}-v1`,
        risks: [],
        allowed_paths: ["result.txt"],
        forbidden_actions: ["push"],
        tasks: [{ task_id: "T01", title: "Implement", objective: "Implement the bounded result.", acceptance_criteria: ["done"], expected_evidence: ["diff"] }],
      });
      await dispatcher.createPlan({ planSeriesId: seriesId, planVersion: "v1", plan: sharedPlan });
      await dispatcher.approvePlan({ planSeriesId: seriesId, planVersion: "v1", approval: { approval_id: `approval-${name}`, approver: "user", plan_id: `${seriesId}-v1`, plan_version: "v1", decision: "approved", acknowledged_risks: [] } });
      await dispatcher.createPlan({ planSeriesId: seriesId, planVersion: "v2", relation: "extension", plan: { ...sharedPlan, ...overrides, plan_id: `${seriesId}-v2` } });
      await assert.rejects(() => dispatcher.approvePlan({
        planSeriesId: seriesId,
        planVersion: "v2",
        approval_reuse: { approval_id: `approval-${name}`, source_plan_id: `${seriesId}-v1`, source_plan_version: "v1" },
      }), /approval reuse cannot expand or change the approved boundary/, name);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
});

test("resource policy is normalized on the plan and propagated unchanged to dispatch", async () => {
  const { root, dispatcher } = await fixture();
  const resourcePolicy = {
    context: "clean",
    reasoning: { source: "user-approved-or-host-default", effort: "medium" },
    planning: { max_agents: 1, followup_tasks: 0 },
    execution: { max_agents: 2, followup_tasks: 1 },
    review: { max_agents: 2, followup_tasks: 1 },
    evidence: "compact",
    failure: "stop-and-report",
    host_enforced: false,
    savings_proven: false,
  };
  try {
    await dispatcher.createPlan({ planSeriesId: "series-resource-policy", planVersion: "v1", plan: makePlan({ plan_id: "series-resource-policy-v1", risks: [], resource_policy: resourcePolicy }) });
    await dispatcher.approvePlan({ planSeriesId: "series-resource-policy", planVersion: "v1", approval: { approval_id: "approval-resource-policy", approver: "user", plan_id: "series-resource-policy-v1", plan_version: "v1", decision: "approved", acknowledged_risks: [] } });
    const dispatch = (await dispatcher.dispatchReady({ planSeriesId: "series-resource-policy", planVersion: "v1" })).dispatches[0];
    const state = await dispatcher.store.load("demo");
    assert.deepEqual(state.series["series-resource-policy"].plans.v1.resource_policy, resourcePolicy);
    assert.deepEqual(dispatch.resource_policy, resourcePolicy);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("extension reuses series sessions while parallel creates new sessions", async () => {
  const { root, adapter, dispatcher } = await fixture();
  try {
    const first = await dispatcher.createPlan({ planSeriesId: "series-a", planVersion: "v1", plan: makePlan({ plan_id: "series-a-plan-v1" }) });
    const extension = await dispatcher.createPlan({ planSeriesId: "series-a", planVersion: "v2", relation: "extension", plan: makePlan({ title: "Extended change", plan_id: "series-a-plan-v2" }) });
    const parallel = await dispatcher.createPlan({ planSeriesId: "series-b", planVersion: "v1", relation: "parallel", parallelOf: "series-a", plan: makePlan({ title: "Parallel research", plan_id: "series-b-plan-v1", serial_parallel_policy: "parallel", max_parallel: 2 }) });
    assert.equal(first.planning_session_id, extension.planning_session_id);
    assert.equal(first.execution_session_id, extension.execution_session_id);
    assert.equal(first.reviewer_session_id, extension.reviewer_session_id);
    assert.notEqual(first.planning_session_id, parallel.planning_session_id);
    assert.notEqual(first.execution_session_id, parallel.execution_session_id);
    assert.notEqual(first.reviewer_session_id, parallel.reviewer_session_id);
    assert.deepEqual(adapter.seriesCalls, ["series-a", "series-b"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("the durable plan preserves the complete five-field execution baseline", async () => {
  const { root, dispatcher } = await fixture();
  try {
    await dispatcher.createPlan({
      planSeriesId: "series-baseline",
      planVersion: "v1",
      plan: makePlan({
        plan_id: "series-baseline-plan-v1",
        execution_baseline: {
          goal: "Ship the approved bounded result.",
          confirmed_decisions: [{ decision: "Preserve the source.", source: "user request" }],
          allowed_objects: ["result.txt"],
          forbidden_objects: ["input.txt"],
          allowed_actions: ["create"],
          forbidden_actions: ["overwrite"],
          completion_criteria: ["result exists"],
          accepter: "independent reviewer",
          current_action: "Create result.txt.",
        },
      }),
    });
    const state = await dispatcher.store.load("demo");
    assert.deepEqual(state.series["series-baseline"].plans.v1.execution_baseline, {
      goal: "Ship the approved bounded result.",
      confirmed_decisions: [{ decision: "Preserve the source.", source: "user request" }],
      allowed_objects: ["result.txt"],
      forbidden_objects: ["input.txt"],
      allowed_actions: ["create"],
      forbidden_actions: ["overwrite"],
      completion_criteria: ["result exists"],
      accepter: "independent reviewer",
      current_action: "Create result.txt.",
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("BossCoding v2 requires an explicit complete execution baseline and dispatch preserves it", async () => {
  const { root, dispatcher } = await fixture();
  try {
    await assert.rejects(() => dispatcher.createPlan({
      planSeriesId: "series-v2-missing-baseline",
      planVersion: "v1",
      plan: makePlan({
        plan_id: "series-v2-missing-baseline-v1",
        role_contract: { version: "bosscoding-v2" },
        role_assignments: bossRoleAssignments(),
      }),
    }), /execution_baseline.*required|complete execution baseline/i);

    const incomplete = bossExecutionBaseline();
    delete incomplete.current_action;
    await assert.rejects(() => dispatcher.createPlan({
      planSeriesId: "series-v2-incomplete-baseline",
      planVersion: "v1",
      plan: makePlan({
        plan_id: "series-v2-incomplete-baseline-v1",
        role_contract: { version: "bosscoding-v2" },
        role_assignments: bossRoleAssignments(),
        execution_baseline: incomplete,
      }),
    }), /execution_baseline\.current_action.*required|complete execution baseline/i);

    for (const [field, value] of [
      ["allowed_objects", [""]],
      ["forbidden_objects", ["   "]],
      ["allowed_actions", [""]],
      ["forbidden_actions", ["\t"]],
      ["completion_criteria", [""]],
      ["allowed_objects", [{}]],
      ["allowed_actions", [{}]],
      ["completion_criteria", [{}]],
    ]) {
      await assert.rejects(() => dispatcher.createPlan({
        planSeriesId: `series-v2-blank-${field}`,
        planVersion: "v1",
        plan: makePlan({
          plan_id: `series-v2-blank-${field}-v1`,
          role_contract: { version: "bosscoding-v2" },
          role_assignments: bossRoleAssignments(),
          execution_baseline: bossExecutionBaseline({ [field]: value }),
        }),
      }), new RegExp(`execution_baseline\\.${field}.*blank|meaningful`, "i"));
    }

    for (const [field, taskValue] of [
      ["acceptance_criteria", []],
      ["expected_evidence", []],
      ["acceptance_criteria", [""]],
      ["expected_evidence", ["   "]],
      ["acceptance_criteria", [{}]],
      ["expected_evidence", [{}]],
    ]) {
      await assert.rejects(() => dispatcher.createPlan({
        planSeriesId: `series-v2-empty-task-${field}-${taskValue.length}`,
        planVersion: "v1",
        plan: makePlan({
          plan_id: `series-v2-empty-task-${field}-${taskValue.length}-v1`,
          role_contract: { version: "bosscoding-v2" },
          role_assignments: bossRoleAssignments(),
          execution_baseline: bossExecutionBaseline(),
          tasks: [{
            task_id: "T01",
            title: "Implement change",
            objective: "Implement the bounded change.",
            acceptance_criteria: ["change exists"],
            expected_evidence: ["diff"],
            [field]: taskValue,
          }],
        }),
      }), new RegExp(`tasks\\[0\\]\\.${field}.*(must not be empty|blank|meaningful)`, "i"));
    }

    const baseline = bossExecutionBaseline();
    await dispatcher.createPlan({
      planSeriesId: "series-v2-baseline-dispatch",
      planVersion: "v1",
      plan: makePlan({
        plan_id: "series-v2-baseline-dispatch-v1",
        risks: [],
        role_contract: { version: "bosscoding-v2" },
        role_assignments: bossRoleAssignments(),
        execution_baseline: baseline,
      }),
    });
    await dispatcher.approvePlan({
      planSeriesId: "series-v2-baseline-dispatch",
      planVersion: "v1",
      approval: { approver: "user", plan_id: "series-v2-baseline-dispatch-v1", plan_version: "v1", decision: "approved", acknowledged_risks: [] },
    });
    await dispatcher.bindHostSession({ planSeriesId: "series-v2-baseline-dispatch", planVersion: "v1", role: "planning", sessionId: "plan-session-series-v2-baseline-dispatch", hostAgentType: "Multi-Agent Systems Architect", selectionSource: "approved-role-selection:acy" });
    await dispatcher.bindHostSession({ planSeriesId: "series-v2-baseline-dispatch", planVersion: "v1", role: "review", sessionId: "review-session-series-v2-baseline-dispatch", hostAgentType: "Code Reviewer", selectionSource: "approved-role-selection:acy" });
    const dispatched = await dispatcher.dispatchReady({ planSeriesId: "series-v2-baseline-dispatch", planVersion: "v1" });
    assert.deepEqual(dispatched.dispatches[0].execution_baseline, baseline);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("approved role assignments and advisory execution lenses persist into dispatch without becoming external Agent selectors", async () => {
  const { root, dispatcher } = await fixture();
  try {
    await dispatcher.createPlan({
      planSeriesId: "series-role-contract",
      planVersion: "v1",
      plan: makePlan({
        plan_id: "series-role-contract-plan-v1",
        risks: [],
        role_contract: { version: "bosscoding-v2" },
        role_assignments: bossRoleAssignments(),
        execution_baseline: bossExecutionBaseline(),
        method_lenses: [
          {
            skill_id: "munger",
            mode: "lens",
            applies_to: ["execution"],
            authority: "advisory",
            purpose: "Invert the permission and identity failure modes.",
            evidence_cutoff: "2026-07-24",
          },
          { skill_id: "steve-jobs", mode: "lens", applies_to: ["planning"], authority: "advisory" },
        ],
      }),
    });
    await dispatcher.approvePlan({
      planSeriesId: "series-role-contract",
      planVersion: "v1",
      approval: {
        approver: "user",
        plan_id: "series-role-contract-plan-v1",
        plan_version: "v1",
        decision: "approved",
        acknowledged_risks: [],
      },
    });

    await assert.rejects(
      () => dispatcher.dispatchReady({ planSeriesId: "series-role-contract", planVersion: "v1" }),
      /host-observed planning role binding/,
    );
    await dispatcher.bindHostSession({
      planSeriesId: "series-role-contract",
      planVersion: "v1",
      role: "planning",
      sessionId: "plan-session-series-role-contract",
      hostAgentType: "Multi-Agent Systems Architect",
      selectionSource: "approved-role-selection:acy",
    });
    await dispatcher.bindHostSession({
      planSeriesId: "series-role-contract",
      planVersion: "v1",
      role: "review",
      sessionId: "review-session-series-role-contract",
      hostAgentType: "Code Reviewer",
      selectionSource: "approved-role-selection:acy",
    });

    const result = await dispatcher.dispatchReady({ planSeriesId: "series-role-contract", planVersion: "v1" });
    const dispatch = result.dispatches[0];
    const state = await dispatcher.store.load("demo");
    const plan = state.series["series-role-contract"].plans.v1;

    assert.equal(plan.role_assignments.execution.host_agent_type, "Senior Developer");
    assert.equal(plan.method_lenses.length, 2);
    assert.equal(dispatch.host_agent_type, "Senior Developer");
    assert.equal(dispatch.selection_source, "approved-role-selection:acy");
    assert.equal(dispatch.permission_mode, "approved-scope-write");
    assert.match(dispatch.role_assignment_hash, /^[a-f0-9]{64}$/);
    assert.deepEqual(dispatch.method_lenses, [
      {
        skill_id: "munger",
        mode: "lens",
        applies_to: ["execution"],
        explicit_opt_in: false,
        authority: "advisory",
        purpose: "Invert the permission and identity failure modes.",
        evidence_cutoff: "2026-07-24",
      },
    ]);
    assert.equal(dispatch.external_agent_id, null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("BossCoding v2 requires an explicit complete role contract", async () => {
  const { root, dispatcher } = await fixture();
  try {
    const withoutContract = makePlan({ plan_id: "missing-role-contract-v1" });
    delete withoutContract.role_contract;
    await assert.rejects(() => dispatcher.createPlan({
      planSeriesId: "series-missing-role-contract",
      planVersion: "v1",
      plan: withoutContract,
    }), /role_contract is required/);

    await assert.rejects(() => dispatcher.createPlan({
      planSeriesId: "series-invalid-legacy-contract",
      planVersion: "v1",
      plan: makePlan({ plan_id: "invalid-legacy-contract-v1", role_contract: { version: "legacy-v1" } }),
    }), /migration.*role-assignments-not-recorded/);

    await assert.rejects(() => dispatcher.createPlan({
      planSeriesId: "series-partial-bosscoding-contract",
      planVersion: "v1",
      plan: makePlan({
        plan_id: "partial-bosscoding-contract-v1",
        role_contract: { version: "bosscoding-v2" },
        role_assignments: {
          execution: { host_agent_type: "Senior Developer", selection_source: "approved-role-selection:acy", permission_mode: "approved-scope-write" },
        },
      }),
    }), /planning, execution, and review/);

    const missingSelection = bossRoleAssignments();
    delete missingSelection.review.selection_source;
    await assert.rejects(() => dispatcher.createPlan({
      planSeriesId: "series-missing-role-selection",
      planVersion: "v1",
      plan: makePlan({
        plan_id: "missing-role-selection-v1",
        role_contract: { version: "bosscoding-v2" },
        role_assignments: missingSelection,
      }),
    }), /role_assignments\.review\.selection_source.*required/);

    const created = await dispatcher.createPlan({
      planSeriesId: "series-complete-bosscoding-contract",
      planVersion: "v1",
      plan: makePlan({
        plan_id: "complete-bosscoding-contract-v1",
        role_contract: { version: "bosscoding-v2" },
        role_assignments: bossRoleAssignments(),
        execution_baseline: bossExecutionBaseline(),
      }),
    });
    assert.equal(created.plan_id, "complete-bosscoding-contract-v1");
    const state = await dispatcher.store.load("demo");
    assert.deepEqual(state.series["series-complete-bosscoding-contract"].plans.v1.role_contract, { version: "bosscoding-v2" });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("direct CLI cannot claim verified mode, cannot downgrade v2 state, and resolver-owned invocation rejects new legacy plans", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "flowstate-cli-interface-"));
  try {
    const dispatcherCli = path.resolve("scripts", "flowstate-dispatcher.mjs");
    const v2Input = path.join(root, "v2-plan.json");
    const legacyInput = path.join(root, "legacy-plan.json");
    const legacyExtensionInput = path.join(root, "legacy-extension.json");
    await writeFile(v2Input, `${JSON.stringify({
      planSeriesId: "series-cli-v2",
      planVersion: "v1",
      plan: makePlan({
        plan_id: "series-cli-v2-plan-v1",
        risks: [],
        role_contract: { version: "bosscoding-v2" },
        role_assignments: bossRoleAssignments(),
        execution_baseline: bossExecutionBaseline(),
      }),
    })}\n`, "utf8");
    await writeFile(legacyInput, `${JSON.stringify({
      planSeriesId: "series-cli-legacy",
      planVersion: "v1",
      plan: makePlan({ plan_id: "series-cli-legacy-plan-v1", risks: [] }),
    })}\n`, "utf8");
    await writeFile(legacyExtensionInput, `${JSON.stringify({
      planSeriesId: "series-cli-v2",
      planVersion: "v2",
      relation: "extension",
      plan: makePlan({ plan_id: "series-cli-v2-plan-v2-legacy", risks: [] }),
    })}\n`, "utf8");

    const run = (stateName, input, { claimedInterface = null, resolverOwned = false } = {}) => spawnSync(process.execPath, [
      dispatcherCli,
      "--action", "create-plan",
      "--input", input,
      "--root", path.join(root, stateName),
      "--project", "demo",
      "--external-agents", "false",
      ...(claimedInterface ? ["--interface", claimedInterface] : []),
    ], {
      cwd: process.cwd(),
      encoding: "utf8",
      windowsHide: true,
      env: resolverOwned ? {
        ...process.env,
        BOSSCODING_VERIFIED_INVOKE: "1",
        BOSSCODING_VERIFIED_PARENT_PID: String(process.pid),
        BOSSCODING_VERIFIED_STATE_ROOT: path.join(root, stateName),
        BOSSCODING_VERIFIED_PROJECT_KEY: "demo",
        BOSSCODING_VERIFIED_RUNTIME_ROOT: path.resolve("."),
      } : process.env,
    });

    const directV2 = run("direct-v2", v2Input);
    assert.notEqual(directV2.status, 0);
    assert.match(directV2.stderr, /BossCoding v2.*resolver-owned/i);

    const claimedVerified = run("claimed-v2", v2Input, { claimedInterface: "verified-bosscoding" });
    assert.notEqual(claimedVerified.status, 0);
    assert.match(claimedVerified.stderr, /resolver-owned|does not accept --interface/i);

    const verifiedV2 = run("verified-v2", v2Input, { resolverOwned: true });
    assert.equal(verifiedV2.status, 0, verifiedV2.stderr);

    const verifiedLegacy = run("verified-legacy", legacyInput, { resolverOwned: true });
    assert.notEqual(verifiedLegacy.status, 0);
    assert.match(verifiedLegacy.stderr, /verified BossCoding.*bosscoding-v2/i);

    const directLegacy = run("mixed-state", legacyInput);
    assert.equal(directLegacy.status, 0, directLegacy.stderr);
    const mixedVerifiedCreate = run("mixed-state", v2Input, { resolverOwned: true });
    assert.notEqual(mixedVerifiedCreate.status, 0);
    assert.match(mixedVerifiedCreate.stderr, /legacy current plan state|cannot mix|migration/i);

    const legacyDowngrade = run("verified-v2", legacyExtensionInput);
    assert.notEqual(legacyDowngrade.status, 0);
    assert.match(legacyDowngrade.stderr, /BossCoding v2 state actions require|role contract.*cannot change/i);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a plan series cannot change role contract versions across extensions", async () => {
  const { root, dispatcher } = await fixture();
  try {
    await dispatcher.createPlan({
      planSeriesId: "series-contract-continuity",
      planVersion: "v1",
      plan: makePlan({
        plan_id: "series-contract-continuity-v1",
        role_contract: { version: "bosscoding-v2" },
        role_assignments: bossRoleAssignments(),
        execution_baseline: bossExecutionBaseline(),
      }),
    });
    await assert.rejects(() => dispatcher.createPlan({
      planSeriesId: "series-contract-continuity",
      planVersion: "v2",
      relation: "extension",
      plan: makePlan({ plan_id: "series-contract-continuity-v2-legacy" }),
    }), /role contract version cannot change across a plan series/i);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("execution permission mode is closed to the two declared values and read-only cannot carry modification paths", async () => {
  const { root, dispatcher } = await fixture();
  try {
    await assert.rejects(() => dispatcher.createPlan({
      planSeriesId: "series-execution-permission-invalid",
      planVersion: "v1",
      plan: makePlan({
        plan_id: "series-execution-permission-invalid-plan-v1",
        role_contract: { version: "bosscoding-v2" },
        role_assignments: bossRoleAssignments({
          execution: { host_agent_type: "Senior Developer", selection_source: "approved-role-selection:acy", permission_mode: "unbounded-write" },
        }),
      }),
    }), /permission_mode must be read-only or approved-scope-write/);

    await assert.rejects(() => dispatcher.createPlan({
      planSeriesId: "series-execution-read-only-write-path",
      planVersion: "v1",
      plan: makePlan({
        plan_id: "series-execution-read-only-write-path-plan-v1",
        role_contract: { version: "bosscoding-v2" },
        role_assignments: bossRoleAssignments({
          execution: { host_agent_type: "Codebase Archaeologist", selection_source: "approved-role-selection:acy", permission_mode: "read-only" },
        }),
        execution_baseline: bossExecutionBaseline({ allowed_actions: ["read"], forbidden_actions: ["write"] }),
        tasks: [{ task_id: "T01", title: "Inspect", objective: "Inspect only.", allowed_paths: ["src/**"], acceptance_criteria: ["inspection completed"], expected_evidence: ["inspection report"] }],
      }),
    }), /read-only execution cannot have modification allowed_paths/);

    const created = await dispatcher.createPlan({
      planSeriesId: "series-execution-read-only",
      planVersion: "v1",
      plan: makePlan({
        plan_id: "series-execution-read-only-plan-v1",
        role_contract: { version: "bosscoding-v2" },
        role_assignments: bossRoleAssignments({
          execution: { host_agent_type: "Codebase Archaeologist", selection_source: "approved-role-selection:acy", permission_mode: "read-only" },
        }),
        execution_baseline: bossExecutionBaseline({ allowed_actions: ["read"], forbidden_actions: ["write"] }),
        tasks: [{ task_id: "T01", title: "Inspect", objective: "Inspect only.", allowed_paths: [], acceptance_criteria: ["inspection completed"], expected_evidence: ["inspection report"] }],
      }),
    });
    assert.equal(created.plan_id, "series-execution-read-only-plan-v1");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("role assignments reject undeclared authority roles instead of silently ignoring them", async () => {
  const { root, dispatcher } = await fixture();
  try {
    await assert.rejects(() => dispatcher.createPlan({
      planSeriesId: "series-role-leak",
      planVersion: "v1",
      plan: makePlan({
        plan_id: "series-role-leak-plan-v1",
        role_contract: { version: "bosscoding-v2" },
        role_assignments: {
          approver: { host_agent_type: "munger", selection_source: "approved-role-selection:acy", permission_mode: "approve" },
        },
      }),
    }), /unsupported role assignment: approver/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("persona method lenses fail closed on authority and identity leakage", async () => {
  const { root, dispatcher } = await fixture();
  try {
    const invalidLenses = [
      [{ skill_id: "munger", mode: "lens", applies_to: ["review"], authority: "advisory" }, /cannot apply to review/],
      [{ skill_id: "munger", mode: "lens", applies_to: ["review:T01"], authority: "advisory" }, /cannot apply to review/],
      [{ skill_id: "munger", mode: "lens", applies_to: ["reviewer"], authority: "advisory" }, /cannot apply to review/],
      [{ skill_id: "munger", mode: "lens", applies_to: ["task:missing"], authority: "advisory" }, /invalid applies_to target/],
      [{ skill_id: "munger", mode: "lens", applies_to: ["arbitrary-target"], authority: "advisory" }, /invalid applies_to target/],
      [{ skill_id: "munger", mode: "voice", applies_to: ["execution"], authority: "advisory" }, /explicit_opt_in must be true/],
      [{ skill_id: "munger", mode: "lens", applies_to: ["execution"], authority: "approver" }, /authority must be advisory/],
      [{ skill_id: "munger", mode: "lens", applies_to: ["execution"], authority: "advisory", hostAgentType: "Code Reviewer" }, /cannot grant identity, permission, or acceptance authority/],
    ];
    for (const [index, [lens, expectedError]] of invalidLenses.entries()) {
      await assert.rejects(() => dispatcher.createPlan({
        planSeriesId: `series-lens-leak-${index}`,
        planVersion: "v1",
        plan: makePlan({
          plan_id: `series-lens-leak-${index}-plan-v1`,
          method_lenses: [lens],
        }),
      }), expectedError);
    }

    await dispatcher.createPlan({
      planSeriesId: "series-valid-lens-targets",
      planVersion: "v1",
      plan: makePlan({
        plan_id: "series-valid-lens-targets-v1",
        method_lenses: [
          { skill_id: "munger", mode: "lens", applies_to: ["planning", "execution", "T01", "task:T02"], authority: "advisory" },
        ],
      }),
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("only the independent reviewer session can accept an execution report", async () => {
  const { root, dispatcher } = await fixture();
  try {
    await dispatcher.createPlan({ planSeriesId: "series-reviewer", planVersion: "v1", plan: makePlan({ plan_id: "series-reviewer-plan-v1", risks: [] }) });
    await dispatcher.approvePlan({ planSeriesId: "series-reviewer", planVersion: "v1", approval: { approver: "user", plan_id: "series-reviewer-plan-v1", plan_version: "v1", decision: "approved", acknowledged_risks: [] } });
    const dispatched = await dispatcher.dispatchReady({ planSeriesId: "series-reviewer", planVersion: "v1" });
    await dispatcher.ingestExecutionReport({
      report_id: "reviewer-report-1",
      project_id: "demo",
      plan_series_id: "series-reviewer",
      plan_id: "series-reviewer-plan-v1",
      plan_version: "v1",
      task_id: "T01",
      dispatch_id: dispatched.dispatches[0].dispatch_id,
      status: "returned-to-planning",
    });

    const baseReview = {
      review_id: "reviewer-review-1",
      report_id: "reviewer-report-1",
      plan_series_id: "series-reviewer",
      plan_id: "series-reviewer-plan-v1",
      plan_version: "v1",
      task_id: "T01",
      decision: "accepted",
      criteria_results: [{ criterion: "change exists", result: "pass" }],
      evidence_checked: ["diff"],
    };
    await assert.rejects(
      () => dispatcher.ingestPlanningReview(
        { ...baseReview, reviewer_session_id: "review-session-series-reviewer" },
        { observedSessionId: "plan-session-series-reviewer", sourceVerified: true },
      ),
      /independent reviewer session/,
    );
    await assert.rejects(
      () => dispatcher.ingestPlanningReview({
        ...baseReview,
        reviewer_session_id: "review-session-series-reviewer",
      }),
      /observedSessionId/,
    );
    const accepted = await ingestObservedReview(
      dispatcher,
      {
        ...baseReview,
        reviewer_session_id: "review-session-series-reviewer",
      },
    );
    assert.equal(accepted.decision, "accepted");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("host bridge binds real controller and worker ids before accepting reports or review", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "flowstate-host-bind-"));
  const dispatcher = new FlowStateDispatcher({
    store: new FlowStateStore({ root: path.join(root, "state") }),
    adapter: new FileQueueAdapter({ root: path.join(root, "queue") }),
    projectId: "demo",
  });
  try {
    await dispatcher.createPlan({
      planSeriesId: "series-host-bind",
      planVersion: "v1",
      plan: makePlan({ plan_id: "series-host-bind-plan-v1", risks: [] }),
    });
    await dispatcher.bindHostSession({
      planSeriesId: "series-host-bind",
      role: "planning",
      sessionId: "codex-planning-agent-1",
    });
    await dispatcher.bindHostSession({
      planSeriesId: "series-host-bind",
      role: "review",
      sessionId: "codex-review-agent-1",
    });
    assert.equal(
      (await dispatcher.bindHostSession({
        planSeriesId: "series-host-bind",
        role: "review",
        sessionId: "codex-review-agent-1",
      })).idempotent,
      true,
    );
    await assert.rejects(
      () => dispatcher.bindHostSession({
        planSeriesId: "series-host-bind",
        role: "review",
        sessionId: "codex-review-agent-2",
      }),
      /cannot rebind/,
    );
    await dispatcher.approvePlan({
      planSeriesId: "series-host-bind",
      planVersion: "v1",
      approval: {
        approver: "user",
        plan_id: "series-host-bind-plan-v1",
        plan_version: "v1",
        decision: "approved",
        acknowledged_risks: [],
      },
    });
    const pending = await dispatcher.dispatchReady({ planSeriesId: "series-host-bind", planVersion: "v1" });
    await dispatcher.bindHostWorker({
      planSeriesId: "series-host-bind",
      planVersion: "v1",
      taskId: "T01",
      dispatchId: pending.dispatches[0].dispatch_id,
      workerSessionId: "codex-worker-agent-1",
    });
    await assert.rejects(
      () => dispatcher.bindHostWorker({
        planSeriesId: "series-host-bind",
        planVersion: "v1",
        taskId: "T01",
        dispatchId: pending.dispatches[0].dispatch_id,
        workerSessionId: "codex-worker-agent-2",
      }),
      /cannot rebind/,
    );

    const report = {
      report_id: "host-bind-report-1",
      project_id: "demo",
      plan_series_id: "series-host-bind",
      plan_id: "series-host-bind-plan-v1",
      plan_version: "v1",
      task_id: "T01",
      dispatch_id: pending.dispatches[0].dispatch_id,
      session_id: "local-execution-series-host-bind",
      worker_session_id: "codex-worker-agent-1",
      status: "returned-to-planning",
    };
    await assert.rejects(
      () => dispatcher.ingestExecutionReport({ ...report, worker_session_id: "unbound-worker" }),
      /bound worker session/,
    );
    await dispatcher.ingestExecutionReport(report);
    const accepted = await ingestObservedReview(dispatcher, {
      review_id: "host-bind-review-1",
      reviewer_session_id: "codex-review-agent-1",
      report_id: "host-bind-report-1",
      plan_series_id: "series-host-bind",
      plan_id: "series-host-bind-plan-v1",
      plan_version: "v1",
      task_id: "T01",
      decision: "accepted",
      criteria_results: [{ criterion: "change exists", result: "pass" }],
      evidence_checked: ["diff"],
    });
    assert.equal(accepted.decision, "accepted");

    const state = await dispatcher.store.load("demo");
    assert.equal(state.series["series-host-bind"].planning_session_id, "codex-planning-agent-1");
    assert.equal(state.series["series-host-bind"].reviewer_session_id, "codex-review-agent-1");
    assert.equal(state.series["series-host-bind"].dispatches[pending.dispatches[0].dispatch_id].worker_session_id, "codex-worker-agent-1");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("governed host bindings require and persist host-observed role metadata from the approved plan", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "flowstate-governed-host-bind-"));
  const dispatcher = new FlowStateDispatcher({
    store: new FlowStateStore({ root: path.join(root, "state") }),
    adapter: new FileQueueAdapter({ root: path.join(root, "queue") }),
    projectId: "demo",
  });
  try {
    await dispatcher.createPlan({
      planSeriesId: "series-governed-host-bind",
      planVersion: "v1",
      plan: makePlan({
        plan_id: "series-governed-host-bind-plan-v1",
        risks: [],
        role_contract: { version: "bosscoding-v2" },
        role_assignments: bossRoleAssignments(),
        execution_baseline: bossExecutionBaseline(),
      }),
    });

    await assert.rejects(() => dispatcher.bindHostSession({
      planSeriesId: "series-governed-host-bind",
      planVersion: "v1",
      role: "planning",
      sessionId: "real-planning-agent",
      hostAgentType: "Multi-Agent Systems Architect",
      selectionSource: "approved-role-selection:acy",
    }), /current approved plan/);

    await dispatcher.approvePlan({
      planSeriesId: "series-governed-host-bind",
      planVersion: "v1",
      approval: {
        approver: "user",
        plan_id: "series-governed-host-bind-plan-v1",
        plan_version: "v1",
        decision: "approved",
        acknowledged_risks: [],
      },
    });

    await assert.rejects(() => dispatcher.bindHostSession({
      planSeriesId: "series-governed-host-bind",
      planVersion: "v1",
      role: "planning",
      sessionId: "real-planning-agent",
    }), /hostAgentType.*required/);
    await assert.rejects(() => dispatcher.bindHostSession({
      planSeriesId: "series-governed-host-bind",
      planVersion: "v1",
      role: "planning",
      sessionId: "real-planning-agent",
      hostAgentType: "Project Shepherd",
      selectionSource: "approved-role-selection:acy",
    }), /hostAgentType does not match/);
    await assert.rejects(() => dispatcher.bindHostSession({
      planSeriesId: "series-governed-host-bind",
      planVersion: "v1",
      role: "planning",
      sessionId: "real-planning-agent",
      hostAgentType: "Multi-Agent Systems Architect",
      selectionSource: "direct-user",
    }), /selectionSource does not match/);

    await dispatcher.bindHostSession({
      planSeriesId: "series-governed-host-bind",
      planVersion: "v1",
      role: "planning",
      sessionId: "real-planning-agent",
      hostAgentType: "Multi-Agent Systems Architect",
      selectionSource: "approved-role-selection:acy",
    });
    await dispatcher.bindHostSession({
      planSeriesId: "series-governed-host-bind",
      planVersion: "v1",
      role: "review",
      sessionId: "real-review-agent",
      hostAgentType: "Code Reviewer",
      selectionSource: "approved-role-selection:acy",
    });

    const dispatched = await dispatcher.dispatchReady({ planSeriesId: "series-governed-host-bind", planVersion: "v1" });
    const dispatchId = dispatched.dispatches[0].dispatch_id;
    assert.equal(dispatched.dispatches[0].permission_mode, "approved-scope-write");

    await assert.rejects(() => dispatcher.bindHostWorker({
      planSeriesId: "series-governed-host-bind",
      planVersion: "v1",
      taskId: "T01",
      dispatchId,
      workerSessionId: "real-execution-agent",
    }), /hostAgentType.*required/);
    await assert.rejects(() => dispatcher.bindHostWorker({
      planSeriesId: "series-governed-host-bind",
      planVersion: "v1",
      taskId: "T01",
      dispatchId,
      workerSessionId: "real-execution-agent",
      hostAgentType: "Senior Developer",
      selectionSource: "direct-user",
    }), /selectionSource does not match/);

    await dispatcher.bindHostWorker({
      planSeriesId: "series-governed-host-bind",
      planVersion: "v1",
      taskId: "T01",
      dispatchId,
      workerSessionId: "real-execution-agent",
      hostAgentType: "Senior Developer",
      selectionSource: "approved-role-selection:acy",
    });

    const state = await dispatcher.store.load("demo");
    assert.deepEqual(state.series["series-governed-host-bind"].host_bound_role_observations.planning, {
      plan_version: "v1",
      host_agent_type: "Multi-Agent Systems Architect",
      selection_source: "approved-role-selection:acy",
      permission_mode: "read-only",
    });
    assert.equal(state.series["series-governed-host-bind"].dispatches[dispatchId].observed_host_agent_type, "Senior Developer");
    assert.equal(state.series["series-governed-host-bind"].dispatches[dispatchId].observed_selection_source, "approved-role-selection:acy");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("BossCoding v2 rejects execution reports until the exact worker is host-bound", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "flowstate-v2-report-bind-"));
  const dispatcher = new FlowStateDispatcher({
    store: new FlowStateStore({ root: path.join(root, "state") }),
    adapter: new FileQueueAdapter({ root: path.join(root, "queue") }),
    projectId: "demo",
  });
  try {
    await dispatcher.createPlan({
      planSeriesId: "series-v2-report-bind",
      planVersion: "v1",
      plan: makePlan({
        plan_id: "series-v2-report-bind-plan-v1",
        risks: [],
        role_contract: { version: "bosscoding-v2" },
        role_assignments: bossRoleAssignments(),
        execution_baseline: bossExecutionBaseline(),
      }),
    });
    await dispatcher.approvePlan({
      planSeriesId: "series-v2-report-bind",
      planVersion: "v1",
      approval: {
        approver: "user",
        plan_id: "series-v2-report-bind-plan-v1",
        plan_version: "v1",
        decision: "approved",
        acknowledged_risks: [],
      },
    });
    await dispatcher.bindHostSession({
      planSeriesId: "series-v2-report-bind",
      planVersion: "v1",
      role: "planning",
      sessionId: "planning-v2-report-bind",
      hostAgentType: "Multi-Agent Systems Architect",
      selectionSource: "approved-role-selection:acy",
    });
    await dispatcher.bindHostSession({
      planSeriesId: "series-v2-report-bind",
      planVersion: "v1",
      role: "review",
      sessionId: "review-v2-report-bind",
      hostAgentType: "Code Reviewer",
      selectionSource: "approved-role-selection:acy",
    });
    const dispatched = await dispatcher.dispatchReady({ planSeriesId: "series-v2-report-bind", planVersion: "v1" });
    const dispatch = dispatched.dispatches[0];
    await assert.rejects(() => dispatcher.ingestExecutionReport({
      report_id: "unbound-v2-report",
      project_id: "demo",
      plan_series_id: "series-v2-report-bind",
      plan_id: "series-v2-report-bind-plan-v1",
      plan_version: "v1",
      task_id: "T01",
      dispatch_id: dispatch.dispatch_id,
      worker_session_id: dispatch.worker_session_id,
      status: "returned-to-planning",
    }), /BossCoding v2.*host-bound worker/i);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("BossCoding v2 binds a new worker after revision without weakening dispatch identity", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "flowstate-v2-revision-worker-bind-"));
  const dispatcher = new FlowStateDispatcher({
    store: new FlowStateStore({ root: path.join(root, "state") }),
    adapter: new MockAdapter(),
    projectId: "demo",
  });
  try {
    await dispatcher.createPlan({
      planSeriesId: "series-v2-revision-worker-bind",
      planVersion: "v1",
      plan: makePlan({
        plan_id: "series-v2-revision-worker-bind-plan-v1",
        risks: [],
        role_contract: { version: "bosscoding-v2" },
        role_assignments: bossRoleAssignments(),
        execution_baseline: bossExecutionBaseline(),
        tasks: [
          { task_id: "T01", title: "Implement change", objective: "Implement the bounded change.", acceptance_criteria: ["change exists"], expected_evidence: ["diff"] },
        ],
      }),
    });
    await dispatcher.approvePlan({
      planSeriesId: "series-v2-revision-worker-bind",
      planVersion: "v1",
      approval: {
        approver: "user",
        plan_id: "series-v2-revision-worker-bind-plan-v1",
        plan_version: "v1",
        decision: "approved",
        acknowledged_risks: [],
      },
    });
    await dispatcher.bindHostSession({
      planSeriesId: "series-v2-revision-worker-bind",
      planVersion: "v1",
      role: "planning",
      sessionId: "plan-session-series-v2-revision-worker-bind",
      hostAgentType: "Multi-Agent Systems Architect",
      selectionSource: "approved-role-selection:acy",
    });
    await dispatcher.bindHostSession({
      planSeriesId: "series-v2-revision-worker-bind",
      planVersion: "v1",
      role: "review",
      sessionId: "review-session-series-v2-revision-worker-bind",
      hostAgentType: "Code Reviewer",
      selectionSource: "approved-role-selection:acy",
    });

    const first = await dispatcher.dispatchReady({ planSeriesId: "series-v2-revision-worker-bind", planVersion: "v1" });
    const firstDispatchId = first.dispatches[0].dispatch_id;
    await dispatcher.bindHostWorker({
      planSeriesId: "series-v2-revision-worker-bind",
      planVersion: "v1",
      taskId: "T01",
      dispatchId: firstDispatchId,
      workerSessionId: "worker-v2-revision-1",
      hostAgentType: "Senior Developer",
      selectionSource: "approved-role-selection:acy",
    });
    await dispatcher.ingestExecutionReport({
      report_id: "v2-revision-report-1",
      project_id: "demo",
      plan_series_id: "series-v2-revision-worker-bind",
      plan_id: "series-v2-revision-worker-bind-plan-v1",
      plan_version: "v1",
      task_id: "T01",
      dispatch_id: firstDispatchId,
      worker_session_id: "worker-v2-revision-1",
      status: "returned-to-planning",
      evidence: ["first diff"],
    });
    const correction = await ingestObservedReview(dispatcher, {
      review_id: "v2-revision-review-1",
      reviewer_session_id: "review-session-series-v2-revision-worker-bind",
      report_id: "v2-revision-report-1",
      plan_series_id: "series-v2-revision-worker-bind",
      plan_id: "series-v2-revision-worker-bind-plan-v1",
      plan_version: "v1",
      task_id: "T01",
      decision: "revision-required",
      required_changes: ["Add the missing validation."],
      criteria_results: [{ criterion: "change exists", result: "fail" }],
      issue_results: [{ issue_id: "missing-validation", status: "open", progress: "none", evidence: ["validation absent"] }],
    });
    const secondDispatchId = correction.revision_dispatches[0].dispatch_id;

    await assert.rejects(() => dispatcher.bindHostWorker({
      planSeriesId: "series-v2-revision-worker-bind",
      planVersion: "v1",
      taskId: "T01",
      dispatchId: firstDispatchId,
      workerSessionId: "worker-v2-revision-2",
      hostAgentType: "Senior Developer",
      selectionSource: "approved-role-selection:acy",
    }), /active task dispatch/);
    await dispatcher.bindHostWorker({
      planSeriesId: "series-v2-revision-worker-bind",
      planVersion: "v1",
      taskId: "T01",
      dispatchId: secondDispatchId,
      workerSessionId: "worker-v2-revision-2",
      hostAgentType: "Senior Developer",
      selectionSource: "approved-role-selection:acy",
    });
    await assert.rejects(() => dispatcher.ingestExecutionReport({
      report_id: "v2-revision-report-from-old-worker",
      project_id: "demo",
      plan_series_id: "series-v2-revision-worker-bind",
      plan_id: "series-v2-revision-worker-bind-plan-v1",
      plan_version: "v1",
      task_id: "T01",
      dispatch_id: secondDispatchId,
      worker_session_id: "worker-v2-revision-1",
      status: "returned-to-planning",
    }), /exact host-bound worker/);
    await dispatcher.ingestExecutionReport({
      report_id: "v2-revision-report-2",
      project_id: "demo",
      plan_series_id: "series-v2-revision-worker-bind",
      plan_id: "series-v2-revision-worker-bind-plan-v1",
      plan_version: "v1",
      task_id: "T01",
      dispatch_id: secondDispatchId,
      worker_session_id: "worker-v2-revision-2",
      status: "returned-to-planning",
      evidence: ["corrected diff"],
    });

    const state = await dispatcher.store.load("demo");
    assert.equal(state.series["series-v2-revision-worker-bind"].reports["v2-revision-report-1"].dispatch_id, firstDispatchId);
    assert.equal(state.series["series-v2-revision-worker-bind"].reports["v2-revision-report-1"].worker_session_id, "worker-v2-revision-1");
    assert.equal(state.series["series-v2-revision-worker-bind"].reports["v2-revision-report-2"].dispatch_id, secondDispatchId);
    assert.equal(state.series["series-v2-revision-worker-bind"].reports["v2-revision-report-2"].worker_session_id, "worker-v2-revision-2");
    assert.equal(state.series["series-v2-revision-worker-bind"].reports["v2-revision-report-from-old-worker"], undefined);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("state and queue writes reject linked paths inside their governed roots", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "flowstate-linked-writes-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const outsideState = path.join(root, "outside-state");
  const stateRoot = path.join(root, "state");
  await mkdir(outsideState, { recursive: true });
  await mkdir(stateRoot, { recursive: true });
  await symlink(outsideState, path.join(stateRoot, "plan-index.json"), "junction");
  const store = new FlowStateStore({ root: stateRoot });
  await assert.rejects(
    () => store.save({ schema_version: "1.0", project_id: "demo", series: {}, events: [] }),
    /unsafe state write path|symbolic link|reparse|non-canonical/i,
  );

  const outsideQueue = path.join(root, "outside-queue");
  const queueRoot = path.join(root, "queue");
  await mkdir(outsideQueue, { recursive: true });
  await symlink(outsideQueue, queueRoot, "junction");
  const queue = new FileQueueAdapter({ root: queueRoot });
  await assert.rejects(
    () => queue.send({ message_id: "linked-write", target_session_id: "session-a" }),
    /unsafe queue write path|symbolic link|reparse|non-canonical/i,
  );
  assert.deepEqual(await readdir(outsideQueue), []);
});

test("a missing state root below a junction ancestor is rejected before any outside write", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "flowstate-linked-root-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const outside = path.join(root, "outside");
  const linkedAncestor = path.join(root, "linked-ancestor");
  await mkdir(outside, { recursive: true });
  await symlink(outside, linkedAncestor, "junction");
  const store = new FlowStateStore({ root: path.join(linkedAncestor, "must-not-be-created") });
  await assert.rejects(
    () => store.save({ schema_version: "1.0", project_id: "demo", series: {}, events: [] }),
    /symbolic link|junction|reparse|non-canonical/i,
  );
  assert.deepEqual(await readdir(outside), []);
});

test("host_agent_type is immutable for a bound session across BossCoding v2 plan versions", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "flowstate-host-identity-immutable-"));
  const dispatcher = new FlowStateDispatcher({
    store: new FlowStateStore({ root: path.join(root, "state") }),
    adapter: new FileQueueAdapter({ root: path.join(root, "queue") }),
    projectId: "demo",
  });
  try {
    await dispatcher.createPlan({
      planSeriesId: "series-host-identity-immutable",
      planVersion: "v1",
      plan: makePlan({
        plan_id: "series-host-identity-immutable-v1",
        risks: [],
        role_contract: { version: "bosscoding-v2" },
        role_assignments: bossRoleAssignments(),
        execution_baseline: bossExecutionBaseline(),
      }),
    });
    await dispatcher.approvePlan({
      planSeriesId: "series-host-identity-immutable",
      planVersion: "v1",
      approval: { approver: "user", plan_id: "series-host-identity-immutable-v1", plan_version: "v1", decision: "approved", acknowledged_risks: [] },
    });
    await dispatcher.bindHostSession({
      planSeriesId: "series-host-identity-immutable",
      planVersion: "v1",
      role: "planning",
      sessionId: "real-planning-session",
      hostAgentType: "Multi-Agent Systems Architect",
      selectionSource: "approved-role-selection:acy",
    });
    await dispatcher.bindHostSession({
      planSeriesId: "series-host-identity-immutable",
      planVersion: "v1",
      role: "review",
      sessionId: "real-review-session",
      hostAgentType: "Code Reviewer",
      selectionSource: "approved-role-selection:acy",
    });

    await dispatcher.createPlan({
      planSeriesId: "series-host-identity-immutable",
      planVersion: "v2",
      relation: "extension",
      plan: makePlan({
        plan_id: "series-host-identity-immutable-v2",
        risks: [],
        role_contract: { version: "bosscoding-v2" },
        role_assignments: bossRoleAssignments({
          planning: { host_agent_type: "Project Shepherd", selection_source: "approved-role-selection:acy", permission_mode: "read-only" },
        }),
        execution_baseline: bossExecutionBaseline(),
      }),
    });
    await dispatcher.approvePlan({
      planSeriesId: "series-host-identity-immutable",
      planVersion: "v2",
      approval: { approver: "user", plan_id: "series-host-identity-immutable-v2", plan_version: "v2", decision: "approved", acknowledged_risks: [] },
    });

    await assert.rejects(() => dispatcher.bindHostSession({
      planSeriesId: "series-host-identity-immutable",
      planVersion: "v2",
      role: "planning",
      sessionId: "real-planning-session",
      hostAgentType: "Project Shepherd",
      selectionSource: "approved-role-selection:acy",
    }), /host_agent_type is immutable for a bound session/);
    await assert.rejects(() => dispatcher.bindHostSession({
      planSeriesId: "series-host-identity-immutable",
      planVersion: "v2",
      role: "planning",
      sessionId: "replacement-planning-session",
      hostAgentType: "Project Shepherd",
      selectionSource: "approved-role-selection:acy",
    }), /cannot rebind the planning host session/);

    const state = await dispatcher.store.load("demo");
    assert.deepEqual(state.series["series-host-identity-immutable"].host_session_identities["real-planning-session"], {
      session_id: "real-planning-session",
      binding_role: "planning-controller",
      host_agent_type: "Multi-Agent Systems Architect",
      first_plan_version: "v1",
    });
    assert.equal(state.series["series-host-identity-immutable"].host_bound_role_observations.planning.plan_version, "v1");
    assert.equal(state.series["series-host-identity-immutable"].host_bound_role_observations.planning.host_agent_type, "Multi-Agent Systems Architect");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("approval acknowledges every risk and accepted report unlocks the next task automatically", async () => {
  const { root, adapter, dispatcher } = await fixture();
  try {
    await dispatcher.createPlan({ planSeriesId: "series-a", planVersion: "v1", plan: makePlan({ plan_id: "series-a-plan-v1" }) });
    await assert.rejects(() => dispatcher.approvePlan({ planSeriesId: "series-a", planVersion: "v1", approval: { approver: "user", plan_version: "v1", decision: "approved", acknowledged_risks: ["R01"] } }), /plan_id/);
    await assert.rejects(() => dispatcher.approvePlan({ planSeriesId: "series-a", planVersion: "v1", approval: { approver: "user", plan_id: "series-a-plan-v1", plan_version: "v1", decision: "approved", acknowledged_risks: [] } }), /acknowledge every risk/);
    await dispatcher.approvePlan({ planSeriesId: "series-a", planVersion: "v1", approval: { approver: "user", plan_id: "series-a-plan-v1", plan_version: "v1", decision: "approved", acknowledged_risks: ["R01"], resolved_blockers: [] } });
    const firstDispatch = await dispatcher.dispatchReady({ planSeriesId: "series-a", planVersion: "v1" });
    assert.equal(firstDispatch.dispatches.length, 1);
    assert.equal(firstDispatch.dispatches[0].target_session_id, "worker-session-series-a-T01");
    assert.equal(firstDispatch.dispatches[0].reviewer_session_id, "review-session-series-a");
    await dispatcher.ingestExecutionReport({ report_id: "report-1", project_id: "demo", plan_series_id: "series-a", plan_id: "series-a-plan-v1", plan_version: "v1", task_id: "T01", dispatch_id: firstDispatch.dispatches[0].dispatch_id, session_id: "worker-session-series-a-T01", status: "returned-to-planning", evidence: ["diff"] });
    const review = await ingestObservedReview(dispatcher, { review_id: "review-1", reviewer_session_id: "review-session-series-a", report_id: "report-1", plan_series_id: "series-a", plan_version: "v1", task_id: "T01", decision: "accepted", criteria_results: [{ criterion: "change exists", result: "pass" }], evidence_checked: ["diff"] });
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
    await dispatcher.approvePlan({ planSeriesId: "series-a", planVersion: "v1", approval: { approver: "user", plan_id: "series-a-plan-v1", plan_version: "v1", decision: "approved", acknowledged_risks: [] } });
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
    assert.equal(blockerMessage.return_to, "plan-session-series-abnormal-stop");
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
      assert.equal(normal.adapter.messages.at(-1).message_type, "REVIEW_REQUEST");
      assert.equal(normal.adapter.messages.at(-1).target_session_id, "review-session-series-normal-return");
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

    const review = await ingestObservedReview(dispatcher, {
      message_type: "PLANNING_BLOCKER_OPINION",
      review_id: "opinion-internal-blocker",
      report_id: "report-internal-blocker",
      plan_series_id: "series-internal-blocker",
      plan_id: "series-internal-blocker-plan-v1",
      plan_version: "v1",
      task_id: "T01",
      decision: "continue",
      reviewer_session_id: "plan-session-series-internal-blocker",
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

    await assert.rejects(() => ingestObservedReview(dispatcher, {
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

    const review = await ingestObservedReview(dispatcher, {
      message_type: "PLANNING_BLOCKER_OPINION",
      review_id: "opinion-user-blocker",
      report_id: "report-user-blocker",
      plan_series_id: "series-user-blocker",
      plan_id: "series-user-blocker-plan-v1",
      plan_version: "v1",
      task_id: "T01",
      decision: "await-user",
      reviewer_session_id: "plan-session-series-user-blocker",
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
    await assert.rejects(() => ingestObservedReview(dispatcher, {
      review_id: "opinion-notification-failure",
      report_id: "report-notification-failure",
      plan_series_id: "series-notification-failure",
      plan_id: "series-notification-failure-plan-v1",
      plan_version: "v1",
      task_id: "T01",
      decision: "continue",
      reviewer_session_id: "plan-session-series-notification-failure",
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

test("accepted review requires every criterion and evidence item to pass with no unresolved defect", async () => {
  const { root, dispatcher } = await fixture();
  try {
    await dispatcher.createPlan({ planSeriesId: "series-acceptance-gate", planVersion: "v1", plan: makePlan({ plan_id: "series-acceptance-gate-v1", risks: [] }) });
    await dispatcher.approvePlan({ planSeriesId: "series-acceptance-gate", planVersion: "v1", approval: { approver: "user", plan_id: "series-acceptance-gate-v1", plan_version: "v1", decision: "approved", acknowledged_risks: [] } });
    const dispatched = await dispatcher.dispatchReady({ planSeriesId: "series-acceptance-gate", planVersion: "v1" });
    await dispatcher.ingestExecutionReport({ report_id: "acceptance-report", project_id: "demo", plan_series_id: "series-acceptance-gate", plan_id: "series-acceptance-gate-v1", plan_version: "v1", task_id: "T01", dispatch_id: dispatched.dispatches[0].dispatch_id, status: "returned-to-planning", evidence: ["diff"] });
    const base = {
      reviewer_session_id: "review-session-series-acceptance-gate",
      report_id: "acceptance-report",
      plan_series_id: "series-acceptance-gate",
      plan_id: "series-acceptance-gate-v1",
      plan_version: "v1",
      task_id: "T01",
      decision: "accepted",
    };
    const invalid = [
      [{ ...base, review_id: "accept-missing-criteria", evidence_checked: ["diff"] }, /criteria_results.*cover|acceptance criterion/i],
      [{ ...base, review_id: "accept-failed-criterion", criteria_results: [{ criterion: "change exists", result: "fail" }], evidence_checked: ["diff"] }, /criterion.*pass|failed criterion/i],
      [{ ...base, review_id: "accept-required-change", criteria_results: [{ criterion: "change exists", result: "pass" }], evidence_checked: ["diff"], required_changes: ["Fix it."] }, /required_changes.*empty|cannot contain/i],
      [{ ...base, review_id: "accept-defect", criteria_results: [{ criterion: "change exists", result: "pass" }], evidence_checked: ["diff"], defects: ["Broken output."] }, /defects.*empty|cannot contain/i],
      [{ ...base, review_id: "accept-open-issue", criteria_results: [{ criterion: "change exists", result: "pass" }], evidence_checked: ["diff"], issue_results: [{ issue_id: "I01", status: "open", evidence: ["still broken"] }] }, /unresolved issue|issue_results.*resolved/i],
      [{ ...base, review_id: "accept-missing-evidence", criteria_results: [{ criterion: "change exists", result: "pass" }] }, /evidence_checked.*cover|expected evidence/i],
    ];
    for (const [review, pattern] of invalid) await assert.rejects(() => ingestObservedReview(dispatcher, review), pattern);

    const accepted = await ingestObservedReview(dispatcher, {
      ...base,
      review_id: "accept-complete",
      criteria_results: [{ criterion: "change exists", result: "pass" }],
      evidence_checked: ["diff"],
      issue_results: [],
    });
    assert.equal(accepted.decision, "accepted");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("BossCoding v2 cannot complete with empty gates, unchecked evidence, or omitted final baseline criteria", async () => {
  const { root, adapter, dispatcher } = await fixture();
  try {
    await dispatcher.createPlan({
      planSeriesId: "series-v2-acceptance-gate",
      planVersion: "v1",
      plan: makePlan({
        plan_id: "series-v2-acceptance-gate-v1",
        risks: [],
        role_contract: { version: "bosscoding-v2" },
        role_assignments: bossRoleAssignments(),
        execution_baseline: bossExecutionBaseline({ completion_criteria: ["result exists"] }),
        tasks: [{
          task_id: "T01",
          title: "Implement change",
          objective: "Implement the bounded change.",
          acceptance_criteria: ["change exists"],
          expected_evidence: ["diff"],
        }],
      }),
    });
    await dispatcher.approvePlan({
      planSeriesId: "series-v2-acceptance-gate",
      planVersion: "v1",
      approval: { approver: "user", plan_id: "series-v2-acceptance-gate-v1", plan_version: "v1", decision: "approved", acknowledged_risks: [] },
    });
    await dispatcher.bindHostSession({ planSeriesId: "series-v2-acceptance-gate", planVersion: "v1", role: "planning", sessionId: "plan-session-series-v2-acceptance-gate", hostAgentType: "Multi-Agent Systems Architect", selectionSource: "approved-role-selection:acy" });
    await dispatcher.bindHostSession({ planSeriesId: "series-v2-acceptance-gate", planVersion: "v1", role: "review", sessionId: "review-session-series-v2-acceptance-gate", hostAgentType: "Code Reviewer", selectionSource: "approved-role-selection:acy" });
    const dispatched = await dispatcher.dispatchReady({ planSeriesId: "series-v2-acceptance-gate", planVersion: "v1" });
    await dispatcher.bindHostWorker({ planSeriesId: "series-v2-acceptance-gate", planVersion: "v1", taskId: "T01", dispatchId: dispatched.dispatches[0].dispatch_id, workerSessionId: "worker-v2-acceptance", hostAgentType: "Senior Developer", selectionSource: "approved-role-selection:acy" });
    await dispatcher.ingestExecutionReport({
      report_id: "v2-acceptance-report",
      project_id: "demo",
      plan_series_id: "series-v2-acceptance-gate",
      plan_id: "series-v2-acceptance-gate-v1",
      plan_version: "v1",
      task_id: "T01",
      dispatch_id: dispatched.dispatches[0].dispatch_id,
      worker_session_id: "worker-v2-acceptance",
      status: "returned-to-planning",
      evidence: ["diff"],
    });
    const request = adapter.messages.find((message) => message.message_type === "REVIEW_REQUEST" && message.report_id === "v2-acceptance-report");
    assert.equal(request.final_acceptance, true);
    assert.deepEqual(request.acceptance_criteria, ["change exists", "result exists"]);
    assert.deepEqual(request.expected_evidence, ["diff"]);
    const base = {
      reviewer_session_id: "review-session-series-v2-acceptance-gate",
      report_id: "v2-acceptance-report",
      plan_series_id: "series-v2-acceptance-gate",
      plan_id: "series-v2-acceptance-gate-v1",
      plan_version: "v1",
      task_id: "T01",
      decision: "accepted",
    };
    await assert.rejects(() => ingestObservedReview(dispatcher, {
      ...base,
      review_id: "v2-string-only-evidence",
      criteria_results: [
        { criterion: "change exists", result: "pass" },
        { criterion: "result exists", result: "pass" },
      ],
      evidence_checked: ["diff"],
    }), /evidence_checked.*explicit.*pass|checked evidence.*pass/i);
    await assert.rejects(() => ingestObservedReview(dispatcher, {
      ...base,
      review_id: "v2-missing-baseline-criterion",
      criteria_results: [{ criterion: "change exists", result: "pass" }],
      evidence_checked: [{ evidence: "diff", result: "pass" }],
    }), /completion criterion|criteria_results.*cover.*result exists/i);
    const accepted = await ingestObservedReview(dispatcher, {
      ...base,
      review_id: "v2-complete-acceptance",
      criteria_results: request.acceptance_criteria.map((criterion) => ({ criterion, result: "pass" })),
      evidence_checked: request.expected_evidence.map((evidence) => ({ evidence, result: "pass" })),
    });
    assert.equal(accepted.plan_completed, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("parallel BossCoding reviews refresh the last request before final plan acceptance", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "flowstate-authorized-parallel-refresh-"));
  const clock = () => Date.parse("2026-08-11T01:00:00.000Z");
  const adapter = new AttestedAdapter({ clock });
  const dispatcher = new FlowStateDispatcher({ store: new FlowStateStore({ root: path.join(root, "state") }), adapter, projectId: "demo", clock });
  try {
    const seriesId = "series-v2-parallel-final-review";
    await dispatcher.createPlan({
      planSeriesId: seriesId,
      planVersion: "v1",
      plan: makePlan({
        plan_id: `${seriesId}-v1`,
        risks: [],
        role_contract: { version: "bosscoding-v2" },
        role_assignments: bossRoleAssignments(),
        execution_baseline: bossExecutionBaseline({ completion_criteria: ["all outputs exist"] }),
        authorization_policy: { required: true },
        serial_parallel_policy: "parallel",
        max_parallel: 2,
        tasks: [
          { task_id: "T01", title: "Create one", objective: "Create one.", stage_kind: "parallel", acceptance_criteria: ["one exists"], expected_evidence: ["one diff"] },
          { task_id: "T02", title: "Create two", objective: "Create two.", stage_kind: "parallel", acceptance_criteria: ["two exists"], expected_evidence: ["two diff"] },
        ],
      }),
    });
    const approval = await dispatcher.approvePlan({ planSeriesId: seriesId, planVersion: "v1", approval: { approval_id: `approval-${seriesId}`, approver: "user", plan_id: `${seriesId}-v1`, plan_version: "v1", decision: "approved", acknowledged_risks: [] } });
    await dispatcher.bindHostSession({ planSeriesId: seriesId, planVersion: "v1", role: "planning", sessionId: `plan-session-${seriesId}`, hostAgentType: "Multi-Agent Systems Architect", selectionSource: "approved-role-selection:acy" });
    await dispatcher.bindHostSession({ planSeriesId: seriesId, planVersion: "v1", role: "review", sessionId: `review-session-${seriesId}`, hostAgentType: "Code Reviewer", selectionSource: "approved-role-selection:acy" });
    const dispatched = await dispatcher.dispatchReady({ planSeriesId: seriesId, planVersion: "v1" });
    assert.equal(dispatched.dispatches.length, 2);
    for (const dispatch of dispatched.dispatches) {
      const workerSessionId = `worker-${dispatch.task_id}`;
      await dispatcher.bindHostWorker({ planSeriesId: seriesId, planVersion: "v1", taskId: dispatch.task_id, dispatchId: dispatch.dispatch_id, workerSessionId, hostAgentType: "Senior Developer", selectionSource: "approved-role-selection:acy" });
      await dispatcher.ingestExecutionReport({
        report_id: `report-${dispatch.task_id}`,
        project_id: "demo",
        plan_series_id: seriesId,
        plan_id: `${seriesId}-v1`,
        plan_version: "v1",
        task_id: dispatch.task_id,
        dispatch_id: dispatch.dispatch_id,
        worker_session_id: workerSessionId,
        status: "returned-to-planning",
        evidence: [`${dispatch.task_id} diff`],
        authorization_envelope: approval.authorization_envelope,
      });
    }
    const initialRequests = adapter.messages.filter((message) => message.message_type === "REVIEW_REQUEST" && message.plan_series_id === seriesId);
    assert.equal(initialRequests.length, 2);
    assert.equal(initialRequests.every((request) => request.final_acceptance === false), true);

    const firstRequest = initialRequests.find((request) => request.task_id === "T01");
    const firstAccepted = await ingestObservedReview(dispatcher, {
      review_id: "parallel-review-T01",
      reviewer_session_id: `review-session-${seriesId}`,
      report_id: "report-T01",
      plan_series_id: seriesId,
      plan_id: `${seriesId}-v1`,
      plan_version: "v1",
      task_id: "T01",
      decision: "accepted",
      criteria_results: firstRequest.acceptance_criteria.map((criterion) => ({ criterion, result: "pass" })),
      evidence_checked: firstRequest.expected_evidence.map((evidence) => ({ evidence, result: "pass" })),
      authorization_envelope: firstRequest.authorization_envelope,
    });
    assert.equal(firstAccepted.plan_completed, false);

    const staleSecondRequest = initialRequests.find((request) => request.task_id === "T02");
    const refresh = await ingestObservedReview(dispatcher, {
      review_id: "parallel-review-T02-preliminary",
      reviewer_session_id: `review-session-${seriesId}`,
      report_id: "report-T02",
      plan_series_id: seriesId,
      plan_id: `${seriesId}-v1`,
      plan_version: "v1",
      task_id: "T02",
      decision: "accepted",
      criteria_results: staleSecondRequest.acceptance_criteria.map((criterion) => ({ criterion, result: "pass" })),
      evidence_checked: staleSecondRequest.expected_evidence.map((evidence) => ({ evidence, result: "pass" })),
      new_blockers: [{ blocker_id: "B-resolved-observation", status: "resolved", reason: "Observed and already resolved." }],
      authorization_envelope: staleSecondRequest.authorization_envelope,
    });
    assert.equal(refresh.decision, "review-refresh-required");
    assert.equal(refresh.plan_completed, false);

    const refreshedRequest = adapter.messages.filter((message) => message.message_type === "REVIEW_REQUEST" && message.task_id === "T02").at(-1);
    assert.equal(refreshedRequest.final_acceptance, true);
    assert.deepEqual(refreshedRequest.acceptance_criteria, ["two exists", "all outputs exist"]);
    assert.deepEqual(refreshedRequest.authorization_envelope, approval.authorization_envelope);
    const completed = await ingestObservedReview(dispatcher, {
      review_id: "parallel-review-T02-final",
      reviewer_session_id: `review-session-${seriesId}`,
      report_id: "report-T02",
      plan_series_id: seriesId,
      plan_id: `${seriesId}-v1`,
      plan_version: "v1",
      task_id: "T02",
      decision: "accepted",
      criteria_results: refreshedRequest.acceptance_criteria.map((criterion) => ({ criterion, result: "pass" })),
      evidence_checked: refreshedRequest.expected_evidence.map((evidence) => ({ evidence, result: "pass" })),
      authorization_envelope: refreshedRequest.authorization_envelope,
    });
    assert.equal(completed.plan_completed, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("parallel stale acceptance with a new risk waits for reapproval before final review", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "flowstate-authorized-parallel-reapproval-refresh-"));
  const clock = () => Date.parse("2026-08-11T01:00:00.000Z");
  const adapter = new AttestedAdapter({ clock });
  const dispatcher = new FlowStateDispatcher({ store: new FlowStateStore({ root: path.join(root, "state") }), adapter, projectId: "demo", clock });
  try {
    const seriesId = "series-v2-parallel-risk-final-review";
    await dispatcher.createPlan({
      planSeriesId: seriesId,
      planVersion: "v1",
      plan: makePlan({
        plan_id: `${seriesId}-v1`,
        risks: [],
        role_contract: { version: "bosscoding-v2" },
        role_assignments: bossRoleAssignments(),
        execution_baseline: bossExecutionBaseline({ completion_criteria: ["all outputs exist"] }),
        authorization_policy: { required: true },
        serial_parallel_policy: "parallel",
        max_parallel: 2,
        tasks: [
          { task_id: "T01", title: "Create one", objective: "Create one.", stage_kind: "parallel", acceptance_criteria: ["one exists"], expected_evidence: ["one diff"] },
          { task_id: "T02", title: "Create two", objective: "Create two.", stage_kind: "parallel", acceptance_criteria: ["two exists"], expected_evidence: ["two diff"] },
        ],
      }),
    });
    const firstApproval = await dispatcher.approvePlan({ planSeriesId: seriesId, planVersion: "v1", approval: { approval_id: `approval-${seriesId}-initial`, approver: "user", plan_id: `${seriesId}-v1`, plan_version: "v1", decision: "approved", acknowledged_risks: [] } });
    await dispatcher.bindHostSession({ planSeriesId: seriesId, planVersion: "v1", role: "planning", sessionId: `plan-session-${seriesId}`, hostAgentType: "Multi-Agent Systems Architect", selectionSource: "approved-role-selection:acy" });
    await dispatcher.bindHostSession({ planSeriesId: seriesId, planVersion: "v1", role: "review", sessionId: `review-session-${seriesId}`, hostAgentType: "Code Reviewer", selectionSource: "approved-role-selection:acy" });
    const dispatched = await dispatcher.dispatchReady({ planSeriesId: seriesId, planVersion: "v1" });
    for (const dispatch of dispatched.dispatches) {
      const workerSessionId = `risk-worker-${dispatch.task_id}`;
      await dispatcher.bindHostWorker({ planSeriesId: seriesId, planVersion: "v1", taskId: dispatch.task_id, dispatchId: dispatch.dispatch_id, workerSessionId, hostAgentType: "Senior Developer", selectionSource: "approved-role-selection:acy" });
      await dispatcher.ingestExecutionReport({ report_id: `risk-report-${dispatch.task_id}`, project_id: "demo", plan_series_id: seriesId, plan_id: `${seriesId}-v1`, plan_version: "v1", task_id: dispatch.task_id, dispatch_id: dispatch.dispatch_id, worker_session_id: workerSessionId, status: "returned-to-planning", authorization_envelope: firstApproval.authorization_envelope });
    }
    const initialRequests = adapter.messages.filter((message) => message.message_type === "REVIEW_REQUEST" && message.plan_series_id === seriesId);
    const firstRequest = initialRequests.find((request) => request.task_id === "T01");
    await ingestObservedReview(dispatcher, {
      review_id: "risk-parallel-review-T01",
      reviewer_session_id: `review-session-${seriesId}`,
      report_id: "risk-report-T01",
      plan_series_id: seriesId,
      plan_id: `${seriesId}-v1`,
      plan_version: "v1",
      task_id: "T01",
      decision: "accepted",
      criteria_results: firstRequest.acceptance_criteria.map((criterion) => ({ criterion, result: "pass" })),
      evidence_checked: firstRequest.expected_evidence.map((evidence) => ({ evidence, result: "pass" })),
      authorization_envelope: firstRequest.authorization_envelope,
    });
    const staleSecondRequest = initialRequests.find((request) => request.task_id === "T02");
    const pending = await ingestObservedReview(dispatcher, {
      review_id: "risk-parallel-review-T02-preliminary",
      reviewer_session_id: `review-session-${seriesId}`,
      report_id: "risk-report-T02",
      plan_series_id: seriesId,
      plan_id: `${seriesId}-v1`,
      plan_version: "v1",
      task_id: "T02",
      decision: "accepted",
      criteria_results: staleSecondRequest.acceptance_criteria.map((criterion) => ({ criterion, result: "pass" })),
      evidence_checked: staleSecondRequest.expected_evidence.map((evidence) => ({ evidence, result: "pass" })),
      new_risks: [{ risk_id: "R-late", severity: "medium", impact: "Requires explicit acknowledgement." }],
      authorization_envelope: staleSecondRequest.authorization_envelope,
    });
    assert.equal(pending.decision, "review-refresh-required");
    assert.equal(pending.approval_required, true);
    let state = await dispatcher.store.load("demo");
    assert.equal(state.series[seriesId].plans.v1.tasks.find((task) => task.task_id === "T02").status, "report-returned");
    assert.equal(state.series[seriesId].plans.v1.approval, null);
    assert.equal(adapter.messages.filter((message) => message.message_type === "REVIEW_REQUEST" && message.task_id === "T02").length, 1);

    const approved = await dispatcher.approvePlan({ planSeriesId: seriesId, planVersion: "v1", approval: { approval_id: `approval-${seriesId}-refresh`, approver: "user", plan_id: `${seriesId}-v1`, plan_version: "v1", decision: "approved", acknowledged_risks: ["R-late"] } });
    assert.equal(approved.final_review_requests_sent, 1);
    const finalRequest = adapter.messages.filter((message) => message.message_type === "REVIEW_REQUEST" && message.task_id === "T02").at(-1);
    assert.equal(finalRequest.final_acceptance, true);
    assert.deepEqual(finalRequest.authorization_envelope, approved.authorization_envelope);
    assert.notEqual(finalRequest.authorization_envelope.boundary_digest, firstApproval.authorization_envelope.boundary_digest);
    const completed = await ingestObservedReview(dispatcher, {
      review_id: "risk-parallel-review-T02-final",
      reviewer_session_id: `review-session-${seriesId}`,
      report_id: "risk-report-T02",
      plan_series_id: seriesId,
      plan_id: `${seriesId}-v1`,
      plan_version: "v1",
      task_id: "T02",
      decision: "accepted",
      criteria_results: finalRequest.acceptance_criteria.map((criterion) => ({ criterion, result: "pass" })),
      evidence_checked: finalRequest.expected_evidence.map((evidence) => ({ evidence, result: "pass" })),
      authorization_envelope: finalRequest.authorization_envelope,
    });
    assert.equal(completed.plan_completed, true);
    state = await dispatcher.store.load("demo");
    assert.equal(state.series[seriesId].plans.v1.status, "completed");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a newer plan approval never releases a superseded version final review request", async () => {
  const { root, adapter, dispatcher } = await fixture();
  try {
    const seriesId = "series-v2-superseded-final-review";
    const tasks = [
      { task_id: "T01", title: "Create one", objective: "Create one.", stage_kind: "parallel", acceptance_criteria: ["one exists"], expected_evidence: ["one diff"] },
      { task_id: "T02", title: "Create two", objective: "Create two.", stage_kind: "parallel", acceptance_criteria: ["two exists"], expected_evidence: ["two diff"] },
    ];
    const plan = (version) => makePlan({
      plan_id: `${seriesId}-${version}`,
      risks: [],
      role_contract: { version: "bosscoding-v2" },
      role_assignments: bossRoleAssignments(),
      execution_baseline: bossExecutionBaseline({ completion_criteria: ["all outputs exist"] }),
      serial_parallel_policy: "parallel",
      max_parallel: 2,
      tasks,
    });
    await dispatcher.createPlan({ planSeriesId: seriesId, planVersion: "v1", plan: plan("v1") });
    await dispatcher.approvePlan({ planSeriesId: seriesId, planVersion: "v1", approval: { approver: "user", plan_id: `${seriesId}-v1`, plan_version: "v1", decision: "approved", acknowledged_risks: [] } });
    await dispatcher.bindHostSession({ planSeriesId: seriesId, planVersion: "v1", role: "planning", sessionId: `plan-session-${seriesId}`, hostAgentType: "Multi-Agent Systems Architect", selectionSource: "approved-role-selection:acy" });
    await dispatcher.bindHostSession({ planSeriesId: seriesId, planVersion: "v1", role: "review", sessionId: `review-session-${seriesId}`, hostAgentType: "Code Reviewer", selectionSource: "approved-role-selection:acy" });
    const dispatched = await dispatcher.dispatchReady({ planSeriesId: seriesId, planVersion: "v1" });
    for (const dispatch of dispatched.dispatches) {
      const workerSessionId = `supersede-worker-${dispatch.task_id}`;
      await dispatcher.bindHostWorker({ planSeriesId: seriesId, planVersion: "v1", taskId: dispatch.task_id, dispatchId: dispatch.dispatch_id, workerSessionId, hostAgentType: "Senior Developer", selectionSource: "approved-role-selection:acy" });
      await dispatcher.ingestExecutionReport({ report_id: `supersede-report-${dispatch.task_id}`, project_id: "demo", plan_series_id: seriesId, plan_id: `${seriesId}-v1`, plan_version: "v1", task_id: dispatch.task_id, dispatch_id: dispatch.dispatch_id, worker_session_id: workerSessionId, status: "returned-to-planning" });
    }
    const initialRequests = adapter.messages.filter((message) => message.message_type === "REVIEW_REQUEST" && message.plan_series_id === seriesId);
    const firstRequest = initialRequests.find((request) => request.task_id === "T01");
    await ingestObservedReview(dispatcher, { review_id: "supersede-review-T01", reviewer_session_id: `review-session-${seriesId}`, report_id: "supersede-report-T01", plan_series_id: seriesId, plan_id: `${seriesId}-v1`, plan_version: "v1", task_id: "T01", decision: "accepted", criteria_results: firstRequest.acceptance_criteria.map((criterion) => ({ criterion, result: "pass" })), evidence_checked: firstRequest.expected_evidence.map((evidence) => ({ evidence, result: "pass" })) });
    const secondRequest = initialRequests.find((request) => request.task_id === "T02");
    const pending = await ingestObservedReview(dispatcher, { review_id: "supersede-review-T02", reviewer_session_id: `review-session-${seriesId}`, report_id: "supersede-report-T02", plan_series_id: seriesId, plan_id: `${seriesId}-v1`, plan_version: "v1", task_id: "T02", decision: "accepted", criteria_results: secondRequest.acceptance_criteria.map((criterion) => ({ criterion, result: "pass" })), evidence_checked: secondRequest.expected_evidence.map((evidence) => ({ evidence, result: "pass" })), scope_change: true });
    assert.equal(pending.approval_required, true);
    const sentBeforeV2 = adapter.messages.length;

    await dispatcher.createPlan({ planSeriesId: seriesId, planVersion: "v2", relation: "extension", plan: plan("v2") });
    const approved = await dispatcher.approvePlan({ planSeriesId: seriesId, planVersion: "v2", approval: { approver: "user", plan_id: `${seriesId}-v2`, plan_version: "v2", decision: "approved", acknowledged_risks: [] } });
    assert.equal(approved.final_review_requests_sent, 0);
    assert.equal(adapter.messages.length, sentBeforeV2);
    const state = await dispatcher.store.load("demo");
    assert.equal(Object.keys(state.series[seriesId].pending_final_reviews).length, 0);
    assert.equal(Object.values(state.series[seriesId].archived_final_reviews).some((entry) => entry.message.plan_version === "v1" && entry.status === "superseded"), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("file queue safely routes canonical Codex subagent names without changing their identity", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "flowstate-queue-codex-session-"));
  try {
    const adapter = new FileQueueAdapter({ root: path.join(root, "queue"), id: (prefix) => `${prefix}-fixed` });
    const canonicalSessionId = "/root/e2e_reviewer";
    const encodedPayload = Buffer.from(canonicalSessionId, "utf8").toString("base64url");
    const expectedSegment = `__pdgo_session_b64__${encodedPayload}`;
    const sent = await adapter.send({
      message_type: "REVIEW_REQUEST",
      message_id: "review-request-1",
      idempotency_key: "review-request-1",
      target_session_id: canonicalSessionId,
    });
    assert.equal(path.dirname(sent.path), path.join(root, "queue", "outbox", expectedSegment));
    const rawCollisionCandidate = `session-${encodedPayload}`;
    const other = await adapter.send({
      message_type: "REVIEW_REQUEST",
      message_id: "review-request-2",
      idempotency_key: "review-request-2",
      target_session_id: rawCollisionCandidate,
    });
    assert.notEqual(path.dirname(sent.path), path.dirname(other.path));

    await adapter.enqueueReview({
      review_id: "review-1",
      return_to: canonicalSessionId,
      reviewer_session_id: canonicalSessionId,
      message_type: "REVIEW_DECISION",
    });
    const reviews = await adapter.receiveReviews(canonicalSessionId);
    assert.equal(reviews.length, 1);
    assert.equal(reviews[0].reviewer_session_id, canonicalSessionId);
    const archived = await adapter.acknowledgeReview(canonicalSessionId, "review-1");
    assert.equal(archived.acknowledged, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("file queue rejects traversal-shaped report and review ids", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "flowstate-queue-safe-id-"));
  try {
    const adapter = new FileQueueAdapter({ root: path.join(root, "queue") });
    await assert.rejects(
      () => adapter.enqueueReport({
        report_id: "../escape",
        return_to: "planning-1",
        status: "returned-to-planning",
      }),
      /report_id/,
    );
    await assert.rejects(
      () => adapter.enqueueReview({
        review_id: "..\\escape",
        return_to: "review-1",
        message_type: "REVIEW_DECISION",
      }),
      /review_id/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("state transactions serialize concurrent writers without losing updates", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "flowstate-store-lock-"));
  try {
    const store = new FlowStateStore({ root: path.join(root, "state") });
    const increment = () => store.transaction("demo", async (state) => {
      const current = Number(state.counter ?? 0);
      await new Promise((resolve) => setTimeout(resolve, 20));
      state.counter = current + 1;
    });
    await Promise.all([increment(), increment()]);
    assert.equal((await store.load("demo")).counter, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a long state transaction cannot have its lock stolen or deleted by a competing writer", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "flowstate-store-long-lock-"));
  try {
    const firstStore = new FlowStateStore({ root: path.join(root, "state"), lockTimeoutMs: 100, staleLockMs: 120 });
    const secondStore = new FlowStateStore({ root: path.join(root, "state"), lockTimeoutMs: 100, staleLockMs: 120 });
    const first = firstStore.transaction("demo", async (state) => {
      state.owner = "first";
      await new Promise((resolve) => setTimeout(resolve, 220));
      state.first_complete = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 25));
    await assert.rejects(
      () => secondStore.transaction("demo", async (state) => {
        state.owner = "second";
      }),
      /Timed out waiting/,
    );
    await first;
    const state = await firstStore.load("demo");
    assert.equal(state.owner, "first");
    assert.equal(state.first_complete, true);
    await secondStore.transaction("demo", async (next) => {
      next.second_after_release = true;
    });
    assert.equal((await secondStore.load("demo")).second_after_release, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("concurrent restarts reclaim one dead lock without deleting the new live owner", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "flowstate-store-dead-lock-"));
  try {
    const stateRoot = path.join(root, "state");
    await mkdir(stateRoot, { recursive: true });
    const lockRoot = path.join(stateRoot, "flowstate-state.json.lock");
    await mkdir(lockRoot);
    await writeFile(path.join(lockRoot, "owner.json"), `${JSON.stringify({
      token: "abandoned-token",
      pid: 2147483647,
      acquired_at: "2000-01-01T00:00:00.000Z",
    })}\n`, "utf8");
    const firstStore = new FlowStateStore({ root: stateRoot, lockTimeoutMs: 500 });
    const secondStore = new FlowStateStore({ root: stateRoot, lockTimeoutMs: 500 });
    const recover = (store) => store.transaction("demo", async (state) => {
      const current = Number(state.recovery_count ?? 0);
      await new Promise((resolve) => setTimeout(resolve, 30));
      state.recovery_count = current + 1;
    });
    await Promise.all([recover(firstStore), recover(secondStore)]);
    assert.equal((await firstStore.load("demo")).recovery_count, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("loading a connected pre-upgrade state locks its existing controller identities", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "flowstate-state-migration-"));
  try {
    const stateRoot = path.join(root, "state");
    await mkdir(stateRoot, { recursive: true });
    await writeFile(path.join(stateRoot, "flowstate-state.json"), `${JSON.stringify({
      schema_version: "1.0",
      project_id: "demo",
      series: {
        legacy: {
          plan_series_id: "legacy",
          project_id: "demo",
          planning_session_id: "real-planning",
          execution_session_id: "real-execution",
          reviewer_session_id: "real-review",
          delivery_status: "connected",
          review_delivery_status: "connected",
          platform_session_ids: {
            planning: "real-planning",
            execution: "real-execution",
            review: "real-review",
          },
          plans: {},
          dispatches: {},
          reports: {},
          reviews: {},
          blockers: {},
        },
      },
      events: [],
    }, null, 2)}\n`, "utf8");
    const dispatcher = new FlowStateDispatcher({
      store: new FlowStateStore({ root: stateRoot }),
      adapter: new FileQueueAdapter({ root: path.join(root, "queue") }),
      projectId: "demo",
    });
    await assert.rejects(
      () => dispatcher.bindHostSession({
        planSeriesId: "legacy",
        role: "review",
        sessionId: "replacement-review",
      }),
      /cannot rebind/,
    );
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

test("reapproval restores a never-dispatched task after its transport blocker is resolved", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "flowstate-resolved-transport-reapproval-"));
  const seriesId = "series-resolved-transport-reapproval";
  const approval = {
    approver: "user",
    plan_id: `${seriesId}-plan-v1`,
    plan_version: "v1",
    decision: "approved",
    acknowledged_risks: [],
  };
  try {
    const adapter = new SelectiveTransportAdapter({
      root: path.join(root, "queue"),
      unavailableTaskIds: ["T02A"],
    });
    const dispatcher = new FlowStateDispatcher({
      store: new FlowStateStore({ root: path.join(root, "state") }),
      adapter,
      projectId: "demo",
    });
    await dispatcher.createPlan({
      planSeriesId: seriesId,
      planVersion: "v1",
      plan: makePlan({
        plan_id: `${seriesId}-plan-v1`,
        risks: [],
        serial_parallel_policy: "parallel",
        max_parallel: 2,
        tasks: [
          { task_id: "T01A", title: "First A", objective: "Complete first A.", acceptance_criteria: ["first A exists"], expected_evidence: ["first A evidence"] },
          { task_id: "T01B", title: "First B", objective: "Complete first B.", acceptance_criteria: ["first B exists"], expected_evidence: ["first B evidence"] },
          { task_id: "T02A", title: "Second A", objective: "Complete second A.", dependencies: ["T01A"], acceptance_criteria: ["second A exists"], expected_evidence: ["second A evidence"] },
          { task_id: "T02B", title: "Second B", objective: "Complete second B.", dependencies: ["T01B"], acceptance_criteria: ["second B exists"], expected_evidence: ["second B evidence"] },
        ],
      }),
    });
    await dispatcher.approvePlan({ planSeriesId: seriesId, planVersion: "v1", approval });
    const initial = await dispatcher.dispatchReady({ planSeriesId: seriesId, planVersion: "v1" });
    assert.deepEqual(initial.dispatches.map((dispatch) => dispatch.task_id).sort(), ["T01A", "T01B"]);
    for (const dispatch of initial.dispatches) {
      await dispatcher.ingestExecutionReport({
        report_id: `report-${dispatch.task_id}`,
        project_id: "demo",
        plan_series_id: seriesId,
        plan_id: `${seriesId}-plan-v1`,
        plan_version: "v1",
        task_id: dispatch.task_id,
        dispatch_id: dispatch.dispatch_id,
        status: "returned-to-planning",
        evidence: [`first ${dispatch.task_id.at(-1)} evidence`],
      });
    }

    for (const taskId of ["T01A", "T01B"]) {
      await ingestObservedReview(dispatcher, {
        review_id: `review-${taskId}`,
        reviewer_session_id: `connected-review-${seriesId}`,
        report_id: `report-${taskId}`,
        plan_series_id: seriesId,
        plan_id: `${seriesId}-plan-v1`,
        plan_version: "v1",
        task_id: taskId,
        decision: "accepted",
        criteria_results: [{ criterion: `first ${taskId.at(-1)} exists`, result: "pass" }],
        evidence_checked: [`first ${taskId.at(-1)} evidence`],
      });
    }

    let state = await dispatcher.store.load("demo");
    let plan = state.series[seriesId].plans.v1;
    let task = plan.tasks.find((candidate) => candidate.task_id === "T02A");
    assert.equal(task.status, "blocked");
    assert.equal(task.dispatch_id, null);
    assert.equal(plan.approval, null);
    assert.equal(plan.blockers.find((blocker) => blocker.blocker_id === "transport-T02A").status, "blocked");

    await dispatcher.resolveBlocker({
      planSeriesId: seriesId,
      planVersion: "v1",
      blockerId: "transport-T02A",
      resolution: "The live transport is available again.",
    });
    await dispatcher.approvePlan({ planSeriesId: seriesId, planVersion: "v1", approval });

    state = await dispatcher.store.load("demo");
    plan = state.series[seriesId].plans.v1;
    task = plan.tasks.find((candidate) => candidate.task_id === "T02A");
    assert.equal(plan.blockers.find((blocker) => blocker.blocker_id === "transport-T02A").status, "resolved");
    assert.equal(task.dispatch_id, null);
    assert.equal(task.status, "ready");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("reapproval does not unlock a task that was blocked after dispatch", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "flowstate-dispatched-block-reapproval-"));
  const seriesId = "series-dispatched-block-reapproval";
  const approval = {
    approver: "user",
    plan_id: `${seriesId}-plan-v1`,
    plan_version: "v1",
    decision: "approved",
    acknowledged_risks: [],
  };
  try {
    const adapter = new ConnectedQueueAdapter({ root: path.join(root, "queue") });
    const dispatcher = new FlowStateDispatcher({
      store: new FlowStateStore({ root: path.join(root, "state") }),
      adapter,
      projectId: "demo",
    });
    await dispatcher.createPlan({
      planSeriesId: seriesId,
      planVersion: "v1",
      plan: makePlan({
        plan_id: `${seriesId}-plan-v1`,
        risks: [],
        serial_parallel_policy: "parallel",
        max_parallel: 2,
        tasks: [
          { task_id: "T01F", title: "Failing task", objective: "Exercise a real execution blocker.", acceptance_criteria: ["failure resolved"], expected_evidence: ["failure evidence"] },
          { task_id: "T01B", title: "Accepted peer", objective: "Complete the peer task.", acceptance_criteria: ["peer exists"], expected_evidence: ["peer evidence"] },
        ],
      }),
    });
    await dispatcher.approvePlan({ planSeriesId: seriesId, planVersion: "v1", approval });
    const initial = await dispatcher.dispatchReady({ planSeriesId: seriesId, planVersion: "v1" });
    const failedDispatch = initial.dispatches.find((dispatch) => dispatch.task_id === "T01F");
    const peerDispatch = initial.dispatches.find((dispatch) => dispatch.task_id === "T01B");
    await dispatcher.ingestExecutionReport({
      report_id: "report-T01F",
      project_id: "demo",
      plan_series_id: seriesId,
      plan_id: `${seriesId}-plan-v1`,
      plan_version: "v1",
      task_id: "T01F",
      dispatch_id: failedDispatch.dispatch_id,
      status: "blocked",
      new_blockers: [{
        blocker_id: "B-real-execution",
        dependency: "missing execution prerequisite",
        reason: "The dispatched task cannot produce its required output.",
        impact: "The task cannot continue safely.",
        recommended_solution: "Restore the prerequisite before retrying.",
        requires_user: false,
      }],
    });
    await dispatcher.ingestExecutionReport({
      report_id: "report-T01B",
      project_id: "demo",
      plan_series_id: seriesId,
      plan_id: `${seriesId}-plan-v1`,
      plan_version: "v1",
      task_id: "T01B",
      dispatch_id: peerDispatch.dispatch_id,
      status: "returned-to-planning",
      evidence: ["peer evidence"],
    });
    await ingestObservedReview(dispatcher, {
      review_id: "review-T01B",
      reviewer_session_id: `connected-review-${seriesId}`,
      report_id: "report-T01B",
      plan_series_id: seriesId,
      plan_id: `${seriesId}-plan-v1`,
      plan_version: "v1",
      task_id: "T01B",
      decision: "accepted",
      criteria_results: [{ criterion: "peer exists", result: "pass" }],
      evidence_checked: ["peer evidence"],
    });

    let state = await dispatcher.store.load("demo");
    assert.equal(state.series[seriesId].plans.v1.approval, null);
    await dispatcher.resolveBlocker({
      planSeriesId: seriesId,
      planVersion: "v1",
      blockerId: "B-real-execution",
      resolution: "The prerequisite is now available, but the dispatched task still requires an explicit retry path.",
    });
    await dispatcher.approvePlan({ planSeriesId: seriesId, planVersion: "v1", approval });

    state = await dispatcher.store.load("demo");
    const task = state.series[seriesId].plans.v1.tasks.find((candidate) => candidate.task_id === "T01F");
    assert.notEqual(task.dispatch_id, null);
    assert.equal(task.status, "blocked");
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
      return_to: "connected-review-series-runtime",
      reviewer_session_id: "forged-planning-session",
      report_id: "runtime-report-1",
      plan_series_id: "series-runtime",
      plan_id: "series-runtime-plan-v1",
      plan_version: "v1",
      task_id: "T01",
      decision: "accepted",
      criteria_results: [{ criterion: "change exists", result: "pass" }],
      evidence_checked: ["diff"],
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

test("runtime does not accept a review from an unauthenticated file queue", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "flowstate-runtime-untrusted-review-"));
  try {
    const adapter = new FileQueueAdapter({ root: path.join(root, "queue") });
    const dispatcher = new FlowStateDispatcher({
      store: new FlowStateStore({ root: path.join(root, "state") }),
      adapter,
      projectId: "demo",
    });
    const runtime = new FlowStateRuntime({ dispatcher });
    await dispatcher.createPlan({
      planSeriesId: "series-untrusted-review",
      planVersion: "v1",
      plan: makePlan({ plan_id: "series-untrusted-review-plan-v1", risks: [] }),
    });
    await dispatcher.approvePlan({
      planSeriesId: "series-untrusted-review",
      planVersion: "v1",
      approval: {
        approver: "user",
        plan_id: "series-untrusted-review-plan-v1",
        plan_version: "v1",
        decision: "approved",
        acknowledged_risks: [],
      },
    });
    const dispatch = await dispatcher.dispatchReady({ planSeriesId: "series-untrusted-review", planVersion: "v1" });
    await dispatcher.ingestExecutionReport({
      report_id: "untrusted-report-1",
      project_id: "demo",
      plan_series_id: "series-untrusted-review",
      plan_id: "series-untrusted-review-plan-v1",
      plan_version: "v1",
      task_id: "T01",
      dispatch_id: dispatch.dispatches[0].dispatch_id,
      status: "returned-to-planning",
    });
    await adapter.enqueueReview({
      review_id: "untrusted-review-1",
      return_to: "local-review-series-untrusted-review",
      reviewer_session_id: "local-review-series-untrusted-review",
      report_id: "untrusted-report-1",
      plan_series_id: "series-untrusted-review",
      plan_id: "series-untrusted-review-plan-v1",
      plan_version: "v1",
      task_id: "T01",
      decision: "accepted",
      criteria_results: [{ criterion: "change exists", result: "pass" }],
      evidence_checked: ["diff"],
    });
    const cycle = await runtime.runOnce();
    assert.equal(cycle.reviews.length, 0);
    assert.match(cycle.errors[0].error, /authenticated by the host transport/);
    const state = await dispatcher.store.load("demo");
    assert.equal(state.series["series-untrusted-review"].plans.v1.tasks[0].status, "report-returned");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("runtime surfaces legacy reviews routed to the execution controller for requeue", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "flowstate-runtime-legacy-review-"));
  try {
    const adapter = new ConnectedQueueAdapter({ root: path.join(root, "queue") });
    const dispatcher = new FlowStateDispatcher({
      store: new FlowStateStore({ root: path.join(root, "state") }),
      adapter,
      projectId: "demo",
    });
    const runtime = new FlowStateRuntime({ dispatcher });
    await dispatcher.createPlan({
      planSeriesId: "series-legacy-review",
      planVersion: "v1",
      plan: makePlan({ plan_id: "series-legacy-review-plan-v1", risks: [] }),
    });
    await dispatcher.approvePlan({
      planSeriesId: "series-legacy-review",
      planVersion: "v1",
      approval: {
        approver: "user",
        plan_id: "series-legacy-review-plan-v1",
        plan_version: "v1",
        decision: "approved",
        acknowledged_risks: [],
      },
    });
    const dispatch = await dispatcher.dispatchReady({ planSeriesId: "series-legacy-review", planVersion: "v1" });
    await dispatcher.ingestExecutionReport({
      report_id: "legacy-report-1",
      project_id: "demo",
      plan_series_id: "series-legacy-review",
      plan_id: "series-legacy-review-plan-v1",
      plan_version: "v1",
      task_id: "T01",
      dispatch_id: dispatch.dispatches[0].dispatch_id,
      status: "returned-to-planning",
    });
    await adapter.enqueueReview({
      review_id: "legacy-review-1",
      return_to: "connected-execution-series-legacy-review",
      reviewer_session_id: "connected-review-series-legacy-review",
      report_id: "legacy-report-1",
      plan_series_id: "series-legacy-review",
      plan_id: "series-legacy-review-plan-v1",
      plan_version: "v1",
      task_id: "T01",
      decision: "accepted",
      criteria_results: [{ criterion: "change exists", result: "pass" }],
      evidence_checked: ["diff"],
    });
    const cycle = await runtime.runOnce();
    assert.equal(cycle.reviews.length, 0);
    assert.equal(cycle.errors[0].phase, "legacy-review-routing");
    const state = await dispatcher.store.load("demo");
    assert.equal(state.series["series-legacy-review"].plans.v1.tasks[0].status, "report-returned");
    const repeat = await runtime.runOnce();
    assert.equal(repeat.errors.length, 0);
    assert.equal(repeat.reviews.length, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("runtime keeps the series paused when planning waits for the user", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "flowstate-runtime-blocked-"));
  let sequence = 0;
  try {
    const adapter = new ConnectedQueueAdapter({ root: path.join(root, "queue"), id: (prefix) => `${prefix}-${++sequence}` });
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
      return_to: "connected-planning-series-blocked",
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
      return_to: "connected-planning-series-blocked",
      reviewer_session_id: "connected-planning-series-blocked",
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
    const review = await ingestObservedReview(dispatcher, { review_id: "stage-review-1", reviewer_session_id: "review-session-series-stages", report_id: "stage-report-1", plan_series_id: "series-stages", plan_id: "series-stages-plan-v1", plan_version: "v1", task_id: "T01", decision: "accepted", criteria_results: [{ criterion: "foundation exists", result: "pass" }] });
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
    await assert.rejects(
      () => ingestObservedReview(dispatcher, { review_id: "revision-review-missing-issues", reviewer_session_id: "review-session-series-revision", report_id: "revision-report-1", plan_series_id: "series-revision", plan_id: "series-revision-plan-v1", plan_version: "v1", task_id: "T01", decision: "revision-required", required_changes: ["Add the missing validation."], criteria_results: [{ criterion: "change exists", result: "fail" }] }),
      /requires issue_results/,
    );
    await assert.rejects(
      () => ingestObservedReview(dispatcher, { review_id: "revision-review-missing-evidence", reviewer_session_id: "review-session-series-revision", report_id: "revision-report-1", plan_series_id: "series-revision", plan_id: "series-revision-plan-v1", plan_version: "v1", task_id: "T01", decision: "revision-required", required_changes: ["Add the missing validation."], criteria_results: [{ criterion: "change exists", result: "fail" }], issue_results: [{ issue_id: "missing-validation", status: "open", progress: "none", evidence: [] }] }),
      /require evidence/,
    );
    const correction = await ingestObservedReview(dispatcher, { review_id: "revision-review-1", reviewer_session_id: "review-session-series-revision", report_id: "revision-report-1", plan_series_id: "series-revision", plan_id: "series-revision-plan-v1", plan_version: "v1", task_id: "T01", decision: "revision-required", required_changes: ["Add the missing validation."], criteria_results: [{ criterion: "change exists", result: "fail" }], issue_results: [{ issue_id: "missing-validation", status: "open", progress: "none", evidence: ["validation absent"] }] });
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
    const accepted = await ingestObservedReview(dispatcher, { review_id: "revision-review-2", reviewer_session_id: "review-session-series-revision", report_id: "revision-report-2", plan_series_id: "series-revision", plan_id: "series-revision-plan-v1", plan_version: "v1", task_id: "T01", decision: "accepted", criteria_results: [{ criterion: "change exists", result: "pass" }], evidence_checked: ["diff"] });
    assert.equal(accepted.next_dispatches.length, 1);
    assert.equal(accepted.next_dispatches[0].task_id, "T02");
    const finalState = await dispatcher.store.load("demo");
    assert.equal(finalState.series["series-revision"].plans.v1.tasks.find((task) => task.task_id === "T01").revision_history.at(-1).status, "accepted");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("two completed correction rounds with the same unresolved issue and no new evidence stop automatic revision", async () => {
  const { root, dispatcher } = await fixture();
  try {
    await dispatcher.createPlan({
      planSeriesId: "series-no-progress",
      planVersion: "v1",
      plan: makePlan({ plan_id: "series-no-progress-plan-v1", risks: [] }),
    });
    await dispatcher.approvePlan({
      planSeriesId: "series-no-progress",
      planVersion: "v1",
      approval: {
        approver: "user",
        plan_id: "series-no-progress-plan-v1",
        plan_version: "v1",
        decision: "approved",
        acknowledged_risks: [],
      },
    });
    const first = await dispatcher.dispatchReady({ planSeriesId: "series-no-progress", planVersion: "v1" });
    const reviewBase = {
      plan_series_id: "series-no-progress",
      plan_id: "series-no-progress-plan-v1",
      plan_version: "v1",
      task_id: "T01",
      decision: "revision-required",
      reviewer_session_id: "review-session-series-no-progress",
      required_changes: ["Add the missing validation."],
      issue_results: [{
        issue_id: "missing-validation",
        status: "open",
        progress: "none",
        evidence: ["validation still absent"],
      }],
    };

    await dispatcher.ingestExecutionReport({
      report_id: "no-progress-report-1",
      project_id: "demo",
      plan_series_id: "series-no-progress",
      plan_id: "series-no-progress-plan-v1",
      plan_version: "v1",
      task_id: "T01",
      dispatch_id: first.dispatches[0].dispatch_id,
      status: "returned-to-planning",
    });
    const baseline = await ingestObservedReview(dispatcher, {
      ...reviewBase,
      review_id: "no-progress-review-1",
      report_id: "no-progress-report-1",
    });
    assert.equal(baseline.revision_dispatches.length, 1);

    await dispatcher.ingestExecutionReport({
      report_id: "no-progress-report-2",
      project_id: "demo",
      plan_series_id: "series-no-progress",
      plan_id: "series-no-progress-plan-v1",
      plan_version: "v1",
      task_id: "T01",
      dispatch_id: baseline.revision_dispatches[0].dispatch_id,
      status: "returned-to-planning",
    });
    const firstNoProgressRound = await ingestObservedReview(dispatcher, {
      ...reviewBase,
      review_id: "no-progress-review-2",
      report_id: "no-progress-report-2",
    });
    assert.equal(firstNoProgressRound.revision_dispatches.length, 1);
    assert.equal(firstNoProgressRound.no_progress_count, 1);

    await dispatcher.ingestExecutionReport({
      report_id: "no-progress-report-3",
      project_id: "demo",
      plan_series_id: "series-no-progress",
      plan_id: "series-no-progress-plan-v1",
      plan_version: "v1",
      task_id: "T01",
      dispatch_id: firstNoProgressRound.revision_dispatches[0].dispatch_id,
      status: "returned-to-planning",
    });
    const stopped = await ingestObservedReview(dispatcher, {
      ...reviewBase,
      review_id: "no-progress-review-3",
      report_id: "no-progress-report-3",
    });
    assert.equal(stopped.revision_dispatches, undefined);
    assert.equal(stopped.auto_revision_ready, false);
    assert.equal(stopped.no_progress_count, 2);
    assert.equal(stopped.stop_reason, "repeated-no-progress");

    const state = await dispatcher.store.load("demo");
    const task = state.series["series-no-progress"].plans.v1.tasks.find((candidate) => candidate.task_id === "T01");
    assert.equal(task.status, "blocked");
    assert.equal(task.stop_reason, "repeated-no-progress");
    assert.deepEqual(task.stopped_issue_ids, ["missing-validation"]);
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
        next_plan: { role_contract: { version: "legacy-v1", migration: "role-assignments-not-recorded" }, title: "Follow-up", summary: "Continue after approval.", objective: "Continue.", risks: [], tasks: [{ task_id: "T03", title: "Follow-up task", objective: "Continue the work." }] },
      }),
    });
    await dispatcher.approvePlan({ planSeriesId: "series-risk-review", planVersion: "v1", approval: { approver: "user", plan_id: "series-risk-review-plan-v1", plan_version: "v1", decision: "approved", acknowledged_risks: [] } });
    const first = await dispatcher.dispatchReady({ planSeriesId: "series-risk-review", planVersion: "v1" });
    await dispatcher.ingestExecutionReport({ report_id: "risk-review-report-1", project_id: "demo", plan_series_id: "series-risk-review", plan_id: "series-risk-review-plan-v1", plan_version: "v1", task_id: "T01", dispatch_id: first.dispatches[0].dispatch_id, status: "returned-to-planning", new_risks: [{ risk_id: "R99", severity: "low", impact: "requires a planning decision" }] });
    const review = await ingestObservedReview(dispatcher, {
      review_id: "risk-review-1",
      report_id: "risk-review-report-1",
      plan_series_id: "series-risk-review",
      plan_id: "series-risk-review-plan-v1",
      plan_version: "v1",
      task_id: "T01",
      decision: "accepted",
      criteria_results: [{ criterion: "change exists", result: "pass" }],
      evidence_checked: ["diff"],
      reviewer_session_id: "review-session-series-risk-review",
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
        next_plan: { role_contract: { version: "legacy-v1", migration: "role-assignments-not-recorded" }, title: "Second stage", summary: "Continue after the first stage.", objective: "Complete the second stage.", risks: [], tasks: [{ task_id: "T02", title: "Second stage task", objective: "Complete the second stage task." }] },
      }),
    });
    await dispatcher.approvePlan({ planSeriesId: "series-next-plan", planVersion: "v1", approval: { approver: "user", plan_id: "series-next-plan-v1", plan_version: "v1", decision: "approved", acknowledged_risks: [] } });
    const first = await dispatcher.dispatchReady({ planSeriesId: "series-next-plan", planVersion: "v1" });
    await dispatcher.ingestExecutionReport({ report_id: "next-plan-report-1", project_id: "demo", plan_series_id: "series-next-plan", plan_id: "series-next-plan-v1", plan_version: "v1", task_id: "T01", dispatch_id: first.dispatches[0].dispatch_id, status: "returned-to-planning" });
    const completed = await ingestObservedReview(dispatcher, { review_id: "next-plan-review-1", reviewer_session_id: "review-session-series-next-plan", report_id: "next-plan-report-1", plan_series_id: "series-next-plan", plan_id: "series-next-plan-v1", plan_version: "v1", task_id: "T01", decision: "accepted" });
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
    await assert.rejects(
      () => dispatcher.bindHostSession({
        planSeriesId: "series-app",
        role: "planning",
        sessionId: "replacement-planning-thread",
      }),
      /cannot rebind/,
    );
    await dispatcher.createPlan({ planSeriesId: "series-app", planVersion: "v2", relation: "extension", plan: makePlan({ plan_id: "series-app-plan-v2" }) });
    assert.equal(calls.filter((call) => call.method === "thread/start").length, 3);
    await dispatcher.approvePlan({ planSeriesId: "series-app", planVersion: "v2", approval: { approver: "user", plan_id: "series-app-plan-v2", plan_version: "v2", decision: "approved", acknowledged_risks: ["R01"] } });
    await dispatcher.dispatchReady({ planSeriesId: "series-app", planVersion: "v2" });
    assert.equal(calls.filter((call) => call.method === "thread/start").length, 4);
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
    await dispatcher.approvePlan({ planSeriesId: "series-a", planVersion: "v1", approval: { approver: "user", plan_id: "series-a-plan-v1", plan_version: "v1", decision: "approved", acknowledged_risks: ["R01"] } });
    const dispatch = await dispatcher.dispatchReady({ planSeriesId: "series-a", planVersion: "v1" });
    await dispatcher.ingestExecutionReport({ report_id: "report-1", project_id: "demo", plan_series_id: "series-a", plan_id: "series-a-plan-v1", plan_version: "v1", task_id: "T01", dispatch_id: dispatch.dispatches[0].dispatch_id, status: "returned-to-planning" });
    await ingestObservedReview(dispatcher, { review_id: "review-1", reviewer_session_id: "review-session-series-a", plan_series_id: "series-a", plan_version: "v1", task_id: "T01", decision: "accepted" });
    await dispatcher.createPlan({ planSeriesId: "series-a", planVersion: "v2", relation: "extension", plan: makePlan({ plan_id: "series-a-plan-v2", tasks: [{ task_id: "T02", title: "Validate change", objective: "Validate the accepted implementation.", dependencies: ["T01"] }] }) });
    const state = await dispatcher.store.load("demo");
    assert.equal(state.series["series-a"].plans.v2.tasks.find((task) => task.task_id === "T01").status, "accepted");
    const index = JSON.parse(await readFile(path.join(root, "state", "plan-index.json"), "utf8"));
    assert.equal(index.plans.find((plan) => plan.plan_id === "series-a-plan-v2").plan_series_id, "series-a");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
