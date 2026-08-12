import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { classifyBossCodingRoute } from "../scripts/lib/flowstate-dispatcher.mjs";

const SAFE_RISK_PROFILE = {
  external_action: false,
  production: false,
  sensitive_data: false,
  destructive: false,
  difficult_to_reverse: false,
  cross_session: false,
  independent_review: false,
  critical_ambiguity: false,
};

const SAFE_LOCAL_ACTION = {
  action: "edit",
  targets: ["README.md"],
  location: "local",
  reversible: true,
  wildcard: false,
  administrator: false,
  account: false,
  global: false,
  network: false,
  secrets: false,
  production: false,
  third_party: false,
  destructive: false,
  irreversible: false,
  sensitive_data: false,
};

const SAFE_CURRENT_REQUEST_BOUNDARY = {
  source: "current-user-request",
  action: "edit",
  targets: ["README.md"],
  approved_local_root: path.resolve("fixture-workspace"),
};

test("high-assurance risk gates run before lightweight workload routing", () => {
  for (const risk of Object.keys(SAFE_RISK_PROFILE)) {
    const result = classifyBossCodingRoute({
      risk: { ...SAFE_RISK_PROFILE, [risk]: true },
      local_action: SAFE_LOCAL_ACTION,
      current_request_boundary: SAFE_CURRENT_REQUEST_BOUNDARY,
      workload: "lightweight",
    });

    assert.equal(result.mode, "high_assurance", risk);
    assert.equal(result.decision_stage, "risk-gate", risk);
  }
});

test("an exact reversible local action uses the current request as authorization without a new PDGO approval", () => {
  const result = classifyBossCodingRoute({
    risk: SAFE_RISK_PROFILE,
    local_action: SAFE_LOCAL_ACTION,
    current_request_boundary: SAFE_CURRENT_REQUEST_BOUNDARY,
    workload: "standard",
  });

  assert.deepEqual(result, {
    mode: "standard",
    decision_stage: "workload",
    execution: "current-agent-with-proportionate-self-check",
    authorization_source: "explicit-current-user-request",
    extra_model_calls: 0,
    subagents: 0,
    state_writes: 0,
    pdgo_new_approval_rounds: 0,
    formal_plan_generations: 0,
    governance_prompt_loads: 0,
    role_process_loads: 0,
  });
});

test("ordinary routing rejects unbound, out-of-root, broad, and forbidden current-request actions", () => {
  const cases = [
    ["boolean self-report without a source boundary", SAFE_LOCAL_ACTION, undefined],
    ["parent traversal", { ...SAFE_LOCAL_ACTION, targets: ["..\\outside"] }, { ...SAFE_CURRENT_REQUEST_BOUNDARY, targets: ["..\\outside"] }],
    ["absolute path outside the approved root", { ...SAFE_LOCAL_ACTION, targets: ["C:\\Users\\Public"] }, { ...SAFE_CURRENT_REQUEST_BOUNDARY, targets: ["C:\\Users\\Public"] }],
    ["broad all-files target", { ...SAFE_LOCAL_ACTION, targets: ["all files"] }, { ...SAFE_CURRENT_REQUEST_BOUNDARY, targets: ["all files"] }],
    ["delete all", { ...SAFE_LOCAL_ACTION, action: "delete", targets: ["all"] }, { ...SAFE_CURRENT_REQUEST_BOUNDARY, action: "delete", targets: ["all"] }],
    ["publish GitHub", { ...SAFE_LOCAL_ACTION, action: "publish", targets: ["GitHub"] }, { ...SAFE_CURRENT_REQUEST_BOUNDARY, action: "publish", targets: ["GitHub"] }],
    ["format drive", { ...SAFE_LOCAL_ACTION, action: "format", targets: ["C:\\"] }, { ...SAFE_CURRENT_REQUEST_BOUNDARY, action: "format", targets: ["C:\\"] }],
    ["action contradicts source boundary", SAFE_LOCAL_ACTION, { ...SAFE_CURRENT_REQUEST_BOUNDARY, action: "read" }],
    ["target contradicts source boundary", SAFE_LOCAL_ACTION, { ...SAFE_CURRENT_REQUEST_BOUNDARY, targets: ["README.zh-CN.md"] }],
  ];

  for (const [name, localAction, currentRequestBoundary] of cases) {
    const result = classifyBossCodingRoute({
      risk: SAFE_RISK_PROFILE,
      local_action: localAction,
      current_request_boundary: currentRequestBoundary,
      workload: "standard",
    });
    assert.equal(result.mode, "high_assurance", name);
    assert.equal(result.decision_stage, "authorization-gate", name);
  }
});

test("POSIX containment rejects a differently-cased absolute target outside the approved root", () => {
  const target = "/tmp/repo/outside.txt";
  const result = classifyBossCodingRoute({
    risk: SAFE_RISK_PROFILE,
    local_action: { ...SAFE_LOCAL_ACTION, targets: [target] },
    current_request_boundary: { ...SAFE_CURRENT_REQUEST_BOUNDARY, targets: [target], approved_local_root: "/tmp/Repo" },
    workload: "standard",
  });

  assert.equal(result.mode, "high_assurance");
  assert.equal(result.decision_stage, "authorization-gate");
});

test("missing or unsafe bounded-local-action fields fail closed to high assurance", () => {
  const cases = [
    ["missing local action", undefined],
    ["missing action", { ...SAFE_LOCAL_ACTION, action: undefined }],
    ["non-string action", { ...SAFE_LOCAL_ACTION, action: 7 }],
    ["blank action", { ...SAFE_LOCAL_ACTION, action: "" }],
    ["wildcard action", { ...SAFE_LOCAL_ACTION, action: "edit*" }],
    ["missing targets", { ...SAFE_LOCAL_ACTION, targets: undefined }],
    ["zero targets", { ...SAFE_LOCAL_ACTION, targets: [] }],
    ["blank target", { ...SAFE_LOCAL_ACTION, targets: [""] }],
    ["wildcard target", { ...SAFE_LOCAL_ACTION, targets: ["docs/*.md"] }],
    ["missing location", { ...SAFE_LOCAL_ACTION, location: undefined }],
    ["global location", { ...SAFE_LOCAL_ACTION, location: "global" }],
    ["missing reversible", { ...SAFE_LOCAL_ACTION, reversible: undefined }],
    ["not reversible", { ...SAFE_LOCAL_ACTION, reversible: false }],
    ["contradictory legacy explicit request", { ...SAFE_LOCAL_ACTION, explicit_current_request: false }],
  ];
  for (const field of ["wildcard", "administrator", "account", "global", "network", "secrets", "production", "third_party", "destructive", "irreversible", "sensitive_data"]) {
    cases.push([`missing ${field}`, { ...SAFE_LOCAL_ACTION, [field]: undefined }]);
    cases.push([`${field} risk`, { ...SAFE_LOCAL_ACTION, [field]: true }]);
  }

  for (const [name, localAction] of cases) {
    const result = classifyBossCodingRoute({
      risk: SAFE_RISK_PROFILE,
      local_action: localAction,
      current_request_boundary: SAFE_CURRENT_REQUEST_BOUNDARY,
      workload: "lightweight",
    });
    assert.equal(result.mode, "high_assurance", name);
    assert.equal(result.decision_stage, "authorization-gate", name);
  }
});

test("missing risk evidence and explicit secretary entry fail closed before workload routing", () => {
  for (const [name, input] of [
    ["missing risk profile", { local_action: SAFE_LOCAL_ACTION, current_request_boundary: SAFE_CURRENT_REQUEST_BOUNDARY, workload: "lightweight" }],
    ["incomplete risk profile", { risk: { ...SAFE_RISK_PROFILE, production: undefined }, local_action: SAFE_LOCAL_ACTION, current_request_boundary: SAFE_CURRENT_REQUEST_BOUNDARY, workload: "lightweight" }],
    ["explicit secretary", { risk: SAFE_RISK_PROFILE, explicit_secretary: true, local_action: SAFE_LOCAL_ACTION, current_request_boundary: SAFE_CURRENT_REQUEST_BOUNDARY, workload: "lightweight" }],
  ]) {
    const result = classifyBossCodingRoute(input);
    assert.equal(result.mode, "high_assurance", name);
    assert.equal(result.decision_stage, "risk-gate", name);
  }
});

test("lightweight and standard differ only in work depth, not PDGO approval count", () => {
  const lightweight = classifyBossCodingRoute({
    risk: SAFE_RISK_PROFILE,
    local_action: { ...SAFE_LOCAL_ACTION, action: "explain", targets: ["provided text"] },
    current_request_boundary: { ...SAFE_CURRENT_REQUEST_BOUNDARY, action: "explain", targets: ["provided text"] },
    workload: "lightweight",
  });
  const standard = classifyBossCodingRoute({
    risk: SAFE_RISK_PROFILE,
    local_action: SAFE_LOCAL_ACTION,
    current_request_boundary: SAFE_CURRENT_REQUEST_BOUNDARY,
    workload: "standard",
  });

  assert.deepEqual(lightweight, {
    mode: "lightweight",
    decision_stage: "workload",
    execution: "current-agent-direct",
    authorization_source: "explicit-current-user-request",
    extra_model_calls: 0,
    subagents: 0,
    state_writes: 0,
    pdgo_new_approval_rounds: 0,
    formal_plan_generations: 0,
    governance_prompt_loads: 0,
    role_process_loads: 0,
  });
  assert.deepEqual(standard, {
    mode: "standard",
    decision_stage: "workload",
    execution: "current-agent-with-proportionate-self-check",
    authorization_source: "explicit-current-user-request",
    extra_model_calls: 0,
    subagents: 0,
    state_writes: 0,
    pdgo_new_approval_rounds: 0,
    formal_plan_generations: 0,
    governance_prompt_loads: 0,
    role_process_loads: 0,
  });
});

test("unknown workload depth fails closed instead of defaulting to standard", () => {
  const result = classifyBossCodingRoute({
    risk: SAFE_RISK_PROFILE,
    local_action: SAFE_LOCAL_ACTION,
    current_request_boundary: SAFE_CURRENT_REQUEST_BOUNDARY,
    workload: "unknown",
  });
  assert.equal(result.mode, "high_assurance");
  assert.equal(result.decision_stage, "workload");
});
