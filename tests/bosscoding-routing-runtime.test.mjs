import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
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

const SAFE_PERMISSION = {
  applications: ["Microsoft Excel"],
  location: "local",
  duration: "current-session",
  reversible: true,
  explicit_current_request: true,
  administrator: false,
  account: false,
  network: false,
  secrets: false,
  wildcard: false,
  third_party: false,
  long_lived: false,
  irreversible: false,
};

function permissionFromToml(text) {
  const values = Object.fromEntries(text.trim().split(/\r?\n/).map((line) => {
    const [key, ...parts] = line.split("=");
    const value = parts.join("=").trim();
    if (value === "true" || value === "false") return [key.trim(), value === "true"];
    return [key.trim(), JSON.parse(value)];
  }));
  return values;
}

test("high-assurance risk gates run before lightweight workload routing", () => {
  for (const risk of Object.keys(SAFE_RISK_PROFILE)) {
    const result = classifyBossCodingRoute({
      risk: { ...SAFE_RISK_PROFILE, [risk]: true },
      permission_change: false,
      workload: "lightweight",
    });

    assert.equal(result.mode, "high_assurance", risk);
    assert.equal(result.decision_stage, "risk-gate", risk);
  }
});

test("an exact temporary local current-session single-app permission routes to standard without PDGO side effects", async () => {
  const temporaryCodexHome = await mkdtemp(path.join(os.tmpdir(), "bosscoding-routing-"));
  const threadId = "thread-safe-single-app";
  const sessionDirectory = path.join(temporaryCodexHome, "computer-use", "sessions");
  const sessionPath = path.join(sessionDirectory, `${threadId}.toml`);
  try {
    await mkdir(sessionDirectory, { recursive: true });
    await writeFile(sessionPath, [
      'applications = ["Microsoft Excel"]',
      'location = "local"',
      'duration = "current-session"',
      "reversible = true",
      "explicit_current_request = true",
      "administrator = false",
      "account = false",
      "network = false",
      "secrets = false",
      "wildcard = false",
      "third_party = false",
      "long_lived = false",
      "irreversible = false",
    ].join("\n"), "utf8");

    const text = await readFile(sessionPath, "utf8");
    assert.match(sessionPath, /computer-use[\\/]sessions[\\/]thread-safe-single-app\.toml$/);
    assert.match(text, /applications = \["Microsoft Excel"\]/);
    const result = classifyBossCodingRoute({
      risk: SAFE_RISK_PROFILE,
      permission_change: true,
      permission: permissionFromToml(text),
      workload: "lightweight",
    });

    assert.deepEqual(result, {
      mode: "standard",
      decision_stage: "permission-gate",
      reason: "bounded-current-session-single-app-permission",
      execution: "current-agent-with-proportionate-self-check",
      extra_model_calls: 0,
      subagents: 0,
      state_writes: 0,
      pdgo_new_approval_rounds: 0,
      formal_plan_generations: 0,
      governance_prompt_loads: 0,
      role_process_loads: 0,
    });
  } finally {
    await rm(temporaryCodexHome, { recursive: true, force: true });
  }
});

test("missing or unsafe temporary-permission fields fail closed to high assurance", () => {
  const cases = [
    ["missing permission", undefined],
    ["missing applications", { ...SAFE_PERMISSION, applications: undefined }],
    ["zero applications", { ...SAFE_PERMISSION, applications: [] }],
    ["two applications", { ...SAFE_PERMISSION, applications: ["Microsoft Excel", "Notepad"] }],
    ["blank application", { ...SAFE_PERMISSION, applications: [""] }],
    ["missing location", { ...SAFE_PERMISSION, location: undefined }],
    ["global location", { ...SAFE_PERMISSION, location: "global" }],
    ["missing duration", { ...SAFE_PERMISSION, duration: undefined }],
    ["persistent duration", { ...SAFE_PERMISSION, duration: "persistent" }],
    ["missing reversible", { ...SAFE_PERMISSION, reversible: undefined }],
    ["not reversible", { ...SAFE_PERMISSION, reversible: false }],
    ["missing explicit request", { ...SAFE_PERMISSION, explicit_current_request: undefined }],
    ["not explicitly requested", { ...SAFE_PERMISSION, explicit_current_request: false }],
  ];
  for (const field of ["administrator", "account", "network", "secrets", "wildcard", "third_party", "long_lived", "irreversible"]) {
    cases.push([`missing ${field}`, { ...SAFE_PERMISSION, [field]: undefined }]);
    cases.push([`${field} risk`, { ...SAFE_PERMISSION, [field]: true }]);
  }

  for (const [name, permission] of cases) {
    const result = classifyBossCodingRoute({
      risk: SAFE_RISK_PROFILE,
      permission_change: true,
      permission,
      workload: "lightweight",
    });
    assert.equal(result.mode, "high_assurance", name);
    assert.equal(result.decision_stage, "permission-gate", name);
  }
});

test("permission routing requires an explicit boolean and an exact literal application target", () => {
  const cases = [
    ["missing permission_change", { permission_change: undefined }],
    ["string permission_change", { permission_change: "false" }],
    ["numeric permission_change", { permission_change: 0 }],
    ["permission object contradicts false", { permission_change: false, permission: SAFE_PERMISSION }],
    ["all-applications wildcard", { permission_change: true, permission: { ...SAFE_PERMISSION, applications: ["*"] } }],
    ["suffix wildcard", { permission_change: true, permission: { ...SAFE_PERMISSION, applications: ["Microsoft *"] } }],
    ["single-character wildcard", { permission_change: true, permission: { ...SAFE_PERMISSION, applications: ["Excel?"] } }],
    ["character-class wildcard", { permission_change: true, permission: { ...SAFE_PERMISSION, applications: ["[Ee]xcel"] } }],
  ];

  for (const [name, input] of cases) {
    const result = classifyBossCodingRoute({
      risk: SAFE_RISK_PROFILE,
      workload: "lightweight",
      ...input,
    });
    assert.equal(result.mode, "high_assurance", name);
    assert.equal(result.decision_stage, "permission-gate", name);
  }
});

test("missing risk evidence and explicit secretary entry fail closed before workload routing", () => {
  for (const [name, input] of [
    ["missing risk profile", { permission_change: false, workload: "lightweight" }],
    ["incomplete risk profile", { risk: { ...SAFE_RISK_PROFILE, production: undefined }, permission_change: false, workload: "lightweight" }],
    ["explicit secretary", { risk: SAFE_RISK_PROFILE, explicit_secretary: true, permission_change: false, workload: "lightweight" }],
  ]) {
    const result = classifyBossCodingRoute(input);
    assert.equal(result.mode, "high_assurance", name);
    assert.equal(result.decision_stage, "risk-gate", name);
  }
});

test("lightweight and standard differ only in work depth, not PDGO approval count", () => {
  const lightweight = classifyBossCodingRoute({
    risk: SAFE_RISK_PROFILE,
    permission_change: false,
    workload: "lightweight",
  });
  const standard = classifyBossCodingRoute({
    risk: SAFE_RISK_PROFILE,
    permission_change: false,
    workload: "standard",
  });

  assert.deepEqual(lightweight, {
    mode: "lightweight",
    decision_stage: "workload",
    execution: "current-agent-direct",
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
    permission_change: false,
    workload: "unknown",
  });
  assert.equal(result.mode, "high_assurance");
  assert.equal(result.decision_stage, "workload");
});
