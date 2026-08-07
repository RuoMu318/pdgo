import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const STATE_VERSION = "1.0";
const TERMINAL_TASK_STATUSES = new Set(["accepted"]);
const ABNORMAL_EXECUTION_STATUSES = new Set([
  "abnormal-stop",
  "abnormal-stopped",
  "crashed",
  "terminated-unexpectedly",
  "unexpected-stop",
]);

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function nowIso(clock) {
  return new Date(clock()).toISOString();
}

function idFactory(prefix) {
  return `${prefix}-${randomUUID()}`;
}

function required(value, name) {
  if (value === undefined || value === null || value === "") throw new Error(`${name} is required`);
  return value;
}

function asArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function statusOf(item) {
  return String(item?.status ?? "").toLowerCase();
}

function blockerIsOpen(blocker) {
  return statusOf(blocker) !== "resolved";
}

function isAbnormalExecutionStop(report) {
  return report?.abnormal_stop === true
    || report?.message_type === "EXECUTION_STOPPED"
    || ABNORMAL_EXECUTION_STATUSES.has(statusOf(report));
}

function normalizeReportedBlocker(blocker, index, report, fallbackIndex = index) {
  const reason = required(blocker?.reason ?? blocker?.cause, `new_blockers[${index}].reason`);
  const impact = required(blocker?.impact, `new_blockers[${index}].impact`);
  const recommendedSolution = required(
    blocker?.recommended_solution ?? blocker?.resolution_advice ?? blocker?.recommendedSolution,
    `new_blockers[${index}].recommended_solution`,
  );
  const requiresUser = blocker?.requires_user ?? blocker?.requiresUser;
  if (typeof requiresUser !== "boolean") throw new Error(`new_blockers[${index}].requires_user must be boolean`);
  return {
    ...clone(blocker),
    blocker_id: blockerId(blocker, fallbackIndex),
    dependency: String(blocker?.dependency ?? ""),
    reason: String(reason),
    impact: String(impact),
    recommended_solution: String(recommendedSolution),
    requires_user: requiresUser,
    owner: String(blocker?.owner ?? (requiresUser ? "user" : "planning")),
    required_decision: String(blocker?.required_decision ?? blocker?.requiredDecision ?? ""),
    resolution: String(blocker?.resolution ?? ""),
    status: "open",
    report_id: String(report.report_id),
    task_id: String(report.task_id),
    dispatch_id: String(report.dispatch_id),
  };
}

function safeQueueSegment(value, name) {
  const segment = String(required(value, name));
  if (segment === "." || segment === ".." || segment !== path.basename(segment) || segment.includes("..")) {
    throw new Error(`${name} must be a safe queue path segment`);
  }
  return segment;
}

function versionNumber(value) {
  const match = String(value).match(/^v(\d+)$/i);
  return match ? Number(match[1]) : null;
}

function slugify(value, max = 48) {
  const result = String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
  return result.slice(0, max).replace(/-+$/g, "") || "plan";
}

function hasOverlappingParallelWrites(tasks) {
  const paths = new Map();
  for (const task of tasks) {
    for (const item of task.allowed_paths) {
      if (!paths.has(item)) paths.set(item, task.task_id);
      else if (paths.get(item) !== task.task_id) return true;
    }
  }
  return false;
}

function riskId(risk, index) {
  return String(risk?.risk_id ?? risk?.id ?? `R${String(index + 1).padStart(2, "0")}`);
}

function blockerId(blocker, index) {
  return String(blocker?.blocker_id ?? blocker?.id ?? `B${String(index + 1).padStart(2, "0")}`);
}

function stageKind(value) {
  return String(value ?? "serial").toLowerCase() === "parallel" ? "parallel" : "serial";
}

function normalizeStage(stage, index) {
  const order = Math.max(1, Number(stage.order ?? stage.stage_order ?? stage.stageOrder ?? index + 1) || index + 1);
  return {
    stage_id: String(stage.stage_id ?? stage.id ?? `stage-${order}`),
    title: String(stage.title ?? stage.name ?? `Stage ${order}`),
    order,
    kind: stageKind(stage.kind ?? stage.stage_kind ?? stage.stageKind),
    required_skills: asArray(stage.required_skills ?? stage.requiredSkills).map(String),
    agent_selectors: asArray(stage.agent_selectors ?? stage.agentSelectors ?? stage.agents),
    acceptance_criteria: asArray(stage.acceptance_criteria ?? stage.acceptanceCriteria),
    status: String(stage.status ?? "pending"),
  };
}

function normalizeTask(task, index) {
  const taskId = String(task.task_id ?? task.id ?? `T${String(index + 1).padStart(2, "0")}`);
  const stageOrder = Math.max(1, Number(task.stage_order ?? task.stageOrder ?? 1) || 1);
  return {
    task_id: taskId,
    title: required(task.title ?? task.objective, `tasks[${index}].title`),
    objective: String(task.objective ?? task.title),
    status: String(task.status ?? "pending"),
    stage_id: String(task.stage_id ?? task.stageId ?? `stage-${stageOrder}`),
    stage_order: stageOrder,
    stage_kind: stageKind(task.stage_kind ?? task.stageKind),
    dependencies: asArray(task.dependencies ?? task.depends_on).map(String),
    allowed_paths: asArray(task.allowed_paths ?? task.allowedPaths).map(String),
    forbidden_actions: asArray(task.forbidden_actions ?? task.forbiddenActions).map(String),
    required_skills: asArray(task.required_skills ?? task.requiredSkills).map(String),
    external_agent_id: task.external_agent_id ?? task.externalAgentId ?? null,
    external_agent_query: task.external_agent_query ?? task.externalAgentQuery ?? null,
    external_agent_division: task.external_agent_division ?? task.externalAgentDivision ?? null,
    acceptance_criteria: asArray(task.acceptance_criteria ?? task.acceptanceCriteria),
    expected_evidence: asArray(task.expected_evidence ?? task.expectedEvidence),
    risk_profile: asArray(task.risk_profile ?? task.riskProfile),
    stop_conditions: asArray(task.stop_conditions ?? task.stopConditions),
    attempts: Number(task.attempts ?? 0),
    revision_attempts: Number(task.revision_attempts ?? task.revisionAttempts ?? 0),
    revision_feedback: asArray(task.revision_feedback ?? task.revisionFeedback),
    revision_history: asArray(task.revision_history ?? task.revisionHistory),
    dispatch_id: task.dispatch_id ?? null,
    report_id: task.report_id ?? null,
    review_id: task.review_id ?? null,
  };
}

function normalizePlan(input, seriesId, version) {
  const plan = input ?? {};
  const title = required(plan.title, "title");
  const summary = required(plan.summary, "summary");
  const searchTerms = asArray(plan.search_terms ?? plan.searchTerms);
  const knowledgeDomains = asArray(plan.knowledge_domains ?? plan.knowledgeDomains);
  const tasks = asArray(plan.tasks).map(normalizeTask);
  const explicitStages = asArray(plan.stages).map(normalizeStage);
  const derivedStages = new Map();
  for (const task of tasks) {
    if (!derivedStages.has(task.stage_id)) {
      derivedStages.set(task.stage_id, normalizeStage({ stage_id: task.stage_id, order: task.stage_order, kind: task.stage_kind }, task.stage_order - 1));
    }
  }
  const stages = (explicitStages.length ? explicitStages : [...derivedStages.values()]).sort((left, right) => left.order - right.order);
  const risks = asArray(plan.risks).map((risk, index) => ({
    risk_id: riskId(risk, index),
    category: String(risk.category ?? "unknown"),
    cause: String(risk.cause ?? ""),
    impact: String(risk.impact ?? ""),
    severity: String(risk.severity ?? risk.level ?? "medium"),
    mitigation: String(risk.mitigation ?? ""),
    owner: String(risk.owner ?? "planning"),
    status: String(risk.status ?? "open"),
    ...clone(risk),
  }));
  const blockers = asArray(plan.blockers).map((blocker, index) => ({
    blocker_id: blockerId(blocker, index),
    dependency: String(blocker.dependency ?? ""),
    impact: String(blocker.impact ?? ""),
    owner: String(blocker.owner ?? "planning"),
    required_decision: String(blocker.required_decision ?? blocker.requiredDecision ?? ""),
    resolution: String(blocker.resolution ?? ""),
    status: String(blocker.status ?? "open"),
    ...clone(blocker),
  }));

  return {
    schema_version: String(plan.schema_version ?? STATE_VERSION),
    plan_id: String(plan.plan_id ?? `${seriesId}-${slugify(title)}-${version}`),
    plan_series_id: seriesId,
    plan_version: version,
    project_id: required(plan.project_id ?? plan.projectId, "project_id"),
    title,
    summary,
    objective: String(plan.objective ?? ""),
    goal: String(plan.goal ?? plan.objective ?? ""),
    target_outcome: String(plan.target_outcome ?? plan.expected_outcome ?? ""),
    modification_scope: asArray(plan.modification_scope ?? plan.modificationScope ?? plan.allowed_paths ?? plan.allowedPaths),
    excluded_scope: asArray(plan.excluded_scope ?? plan.excludedScope ?? plan.non_goals ?? plan.nonGoals),
    detail_policy: String(plan.detail_policy ?? plan.detailPolicy ?? "do-not-deepen-without-request"),
    brainstorming: clone(plan.brainstorming ?? plan.brainstorming_brief ?? { enabled: false, options: [], decisions: [] }),
    planning_policy: clone(plan.planning_policy ?? plan.planningPolicy ?? { auto_split_long_plan: true, auto_revision_in_scope: true }),
    non_goals: asArray(plan.non_goals ?? plan.nonGoals),
    current_state: String(plan.current_state ?? plan.currentState ?? ""),
    inputs: asArray(plan.inputs),
    assumptions: asArray(plan.assumptions),
    dependencies: asArray(plan.dependencies),
    stages,
    tasks,
    acceptance_criteria: asArray(plan.acceptance_criteria ?? plan.acceptanceCriteria),
    expected_evidence: asArray(plan.expected_evidence ?? plan.expectedEvidence),
    rollback: asArray(plan.rollback),
    allowed_paths: asArray(plan.allowed_paths ?? plan.allowedPaths),
    forbidden_actions: asArray(plan.forbidden_actions ?? plan.forbiddenActions),
    risks,
    blockers,
    questions_decisions: asArray(plan.questions_decisions ?? plan.questionsDecisions),
    residual_risks: asArray(plan.residual_risks ?? plan.residualRisks),
    search_terms: searchTerms.length ? searchTerms : [title, summary],
    knowledge_domains: knowledgeDomains.length ? knowledgeDomains : ["project"],
    serial_parallel_policy: String(plan.serial_parallel_policy ?? plan.serialParallelPolicy ?? "serial"),
    max_parallel: Math.max(1, Number(plan.max_parallel ?? plan.maxParallel ?? 1)),
    next_plan: clone(plan.next_plan ?? plan.nextPlan ?? null),
    status: "awaiting-user-approval",
    approval: null,
    created_at: plan.created_at ?? null,
    updated_at: plan.updated_at ?? null,
  };
}

function currentStageOrder(plan) {
  const incomplete = plan.tasks.filter((task) => task.status !== "accepted");
  if (!incomplete.length) return null;
  return Math.min(...incomplete.map((task) => task.stage_order));
}

function syncStageStatuses(plan) {
  for (const stage of plan.stages ?? []) {
    const stageTasks = plan.tasks.filter((task) => task.stage_id === stage.stage_id || task.stage_order === stage.order);
    if (!stageTasks.length) {
      stage.status = "pending";
    } else if (stageTasks.every((task) => task.status === "accepted")) {
      stage.status = "completed";
    } else if (stageTasks.some((task) => ["ready", "dispatched", "report-returned", "revision-required"].includes(task.status))) {
      stage.status = "active";
    } else {
      stage.status = "pending";
    }
  }
}

function activateReadyTasks(plan) {
  const order = currentStageOrder(plan);
  if (order === null) {
    syncStageStatuses(plan);
    return null;
  }
  for (const task of plan.tasks) {
    if (task.status !== "pending" || task.stage_order !== order) continue;
    if (task.dependencies.every((dependency) => plan.tasks.find((item) => item.task_id === dependency)?.status === "accepted")) {
      task.status = "ready";
    }
  }
  syncStageStatuses(plan);
  return order;
}

function stageForOrder(plan, order) {
  return (plan.stages ?? []).find((stage) => stage.order === order) ?? null;
}

function initialState(projectId) {
  return {
    schema_version: STATE_VERSION,
    project_id: projectId ?? null,
    series: {},
    events: [],
  };
}

export class FlowStateStore {
  constructor({ root, fileName = "flowstate-state.json", clock = Date.now } = {}) {
    if (!root) throw new Error("FlowStateStore root is required");
    this.root = path.resolve(root);
    this.filePath = path.join(this.root, fileName);
    this.clock = clock;
  }

  async load(projectId = null) {
    try {
      const value = JSON.parse(await readFile(this.filePath, "utf8"));
      if (!value || typeof value !== "object") throw new Error("state must be an object");
      value.series ??= {};
      value.events ??= [];
      return value;
    } catch (error) {
      if (error.code === "ENOENT") return initialState(projectId);
      throw new Error(`Unable to read FlowState state: ${error.message}`);
    }
  }

  async save(state) {
    await mkdir(this.root, { recursive: true });
    const tempPath = `${this.filePath}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(tempPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    await rename(tempPath, this.filePath);
    const planIndex = [];
    const sessionIndex = [];
    for (const series of Object.values(state.series ?? {})) {
      for (const plan of Object.values(series.plans ?? {})) {
        planIndex.push({
          project_id: series.project_id,
          plan_series_id: series.plan_series_id,
          plan_version: plan.plan_version,
          plan_id: plan.plan_id,
          title: plan.title,
          summary: plan.summary,
          search_terms: plan.search_terms,
          knowledge_domains: plan.knowledge_domains,
          status: plan.status,
          related_sessions: [series.planning_session_id, series.execution_session_id],
          task_ids: plan.tasks.map((task) => task.task_id),
          parallel_of: series.parallel_of ?? null,
        });
      }
      sessionIndex.push(
        { session_id: series.planning_session_id, project_id: series.project_id, department: "planning", role: "controller", plan_series_id: series.plan_series_id },
        { session_id: series.execution_session_id, project_id: series.project_id, department: "execution", role: "controller", plan_series_id: series.plan_series_id },
      );
      for (const dispatch of Object.values(series.dispatches ?? {})) {
        if (dispatch.worker_session_id) sessionIndex.push({ session_id: dispatch.worker_session_id, project_id: series.project_id, department: "execution", role: "worker", plan_series_id: series.plan_series_id, task_id: dispatch.task_id });
      }
    }
    planIndex.sort((left, right) => `${left.plan_series_id}/${left.plan_version}`.localeCompare(`${right.plan_series_id}/${right.plan_version}`));
    sessionIndex.sort((left, right) => left.session_id.localeCompare(right.session_id));
    await writeFile(path.join(this.root, "plan-index.json"), `${JSON.stringify({ schema_version: STATE_VERSION, plans: planIndex }, null, 2)}\n`, "utf8");
    await writeFile(path.join(this.root, "session-index.json"), `${JSON.stringify({ schema_version: STATE_VERSION, sessions: sessionIndex }, null, 2)}\n`, "utf8");
    return this.filePath;
  }

  async transaction(projectId, mutator) {
    const state = await this.load(projectId);
    const result = await mutator(state);
    await this.save(state);
    return result;
  }
}

export class FileQueueAdapter {
  constructor({ root, clock = Date.now, id = idFactory } = {}) {
    if (!root) throw new Error("FileQueueAdapter root is required");
    this.root = path.resolve(root);
    this.clock = clock;
    this.id = id;
  }

  async ensureSeriesSessions({ seriesId }) {
    return {
      planning_session_id: `local-planning-${seriesId}`,
      execution_session_id: `local-execution-${seriesId}`,
      platform_session_ids: { planning: null, execution: null },
      delivery_status: "adapter-unavailable",
      adapter: "file-queue",
    };
  }

  async ensureWorkerSession({ seriesId, taskId }) {
    return {
      worker_session_id: `local-execution-worker-${seriesId}-${taskId}`,
      platform_session_id: null,
      delivery_status: "adapter-unavailable",
    };
  }

  async send(message) {
    const target = safeQueueSegment(message.target_session_id ?? message.return_to, "target_session_id");
    const directory = path.join(this.root, "outbox", target);
    await mkdir(directory, { recursive: true });
    const messageId = String(message.message_id ?? message.dispatch_id ?? this.id("message"));
    const idempotencyKey = String(message.idempotency_key ?? message.dispatch_id ?? messageId);
    const fileName = `${safeQueueSegment(idempotencyKey, "idempotency_key")}.json`;
    const filePath = path.join(directory, fileName);
    try {
      const existing = JSON.parse(await readFile(filePath, "utf8"));
      return { message_id: existing.message_id ?? messageId, path: filePath, deduplicated: true };
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    await writeFile(filePath, `${JSON.stringify({ ...clone(message), message_id: messageId, idempotency_key: idempotencyKey }, null, 2)}\n`, "utf8");
    return { message_id: messageId, path: filePath, deduplicated: false };
  }

  async enqueueReport(report) {
    const target = safeQueueSegment(report.return_to ?? report.planning_session_id, "return_to");
    const directory = path.join(this.root, "inbox", target);
    await mkdir(directory, { recursive: true });
    const reportId = String(report.report_id ?? this.id("report"));
    const filePath = path.join(directory, `${reportId}.json`);
    try {
      await readFile(filePath, "utf8");
      return { report_id: reportId, path: filePath, deduplicated: true };
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    const blockingReport = statusOf(report) === "blocked" || asArray(report.new_blockers ?? report.blockers).length > 0;
    const messageType = report.message_type ?? (isAbnormalExecutionStop(report) ? "EXECUTION_STOPPED" : (blockingReport ? "BLOCKER_REPORT" : "EXECUTION_REPORT"));
    await writeFile(filePath, `${JSON.stringify({ ...clone(report), message_type: messageType, report_id: reportId }, null, 2)}\n`, "utf8");
    return { report_id: reportId, path: filePath, deduplicated: false };
  }

  async enqueueReview(review) {
    const target = safeQueueSegment(review.return_to ?? review.execution_session_id, "return_to");
    const directory = path.join(this.root, "inbox", target);
    await mkdir(directory, { recursive: true });
    const reviewId = String(review.review_id ?? this.id("review"));
    const filePath = path.join(directory, `${reviewId}.json`);
    try {
      await readFile(filePath, "utf8");
      return { review_id: reviewId, path: filePath, deduplicated: true };
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    await writeFile(filePath, `${JSON.stringify({ ...clone(review), message_type: review.message_type ?? "REVIEW_DECISION", review_id: reviewId }, null, 2)}\n`, "utf8");
    return { review_id: reviewId, path: filePath, deduplicated: false };
  }

  async receiveReports(sessionId) {
    const directory = path.join(this.root, "inbox", safeQueueSegment(sessionId, "sessionId"));
    let names;
    try {
      names = (await readdir(directory)).filter((name) => name.endsWith(".json")).sort();
    } catch (error) {
      if (error.code === "ENOENT") return [];
      throw error;
    }
    const messages = await Promise.all(names.map(async (name) => JSON.parse(await readFile(path.join(directory, name), "utf8"))));
    return messages.filter((message) => !message.message_type || ["EXECUTION_REPORT", "EXECUTION_STOPPED", "BLOCKER_REPORT"].includes(message.message_type));
  }

  async receiveReviews(sessionId) {
    const directory = path.join(this.root, "inbox", safeQueueSegment(sessionId, "sessionId"));
    let names;
    try {
      names = (await readdir(directory)).filter((name) => name.endsWith(".json")).sort();
    } catch (error) {
      if (error.code === "ENOENT") return [];
      throw error;
    }
    const messages = await Promise.all(names.map(async (name) => JSON.parse(await readFile(path.join(directory, name), "utf8"))));
    return messages.filter((message) => ["REVIEW_DECISION", "PLANNING_BLOCKER_OPINION"].includes(message.message_type));
  }

  async acknowledgeMessage(sessionId, messageId) {
    const safeSession = safeQueueSegment(sessionId, "sessionId");
    const safeMessage = safeQueueSegment(messageId, "messageId");
    const directory = path.join(this.root, "inbox", safeSession);
    const directPath = path.join(directory, `${safeMessage}.json`);
    let sourcePath = directPath;
    try {
      await readFile(sourcePath, "utf8");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      let names;
      try {
        names = (await readdir(directory)).filter((name) => name.endsWith(".json"));
      } catch (listError) {
        if (listError.code === "ENOENT") return { acknowledged: false };
        throw listError;
      }
      sourcePath = null;
      for (const name of names) {
        const candidatePath = path.join(directory, name);
        const candidate = JSON.parse(await readFile(candidatePath, "utf8"));
        if ([candidate.report_id, candidate.review_id, candidate.message_id].map((value) => String(value ?? "")).includes(safeMessage)) {
          sourcePath = candidatePath;
          break;
        }
      }
      if (!sourcePath) return { acknowledged: false };
    }
    const archiveDirectory = path.join(this.root, "processed", safeSession);
    await mkdir(archiveDirectory, { recursive: true });
    const archivePath = path.join(archiveDirectory, path.basename(sourcePath));
    try {
      await rename(sourcePath, archivePath);
    } catch (error) {
      if (error.code !== "ENOENT" && error.code !== "EEXIST") throw error;
      return { acknowledged: true, already_processed: true, path: archivePath };
    }
    return { acknowledged: true, already_processed: false, path: archivePath };
  }

  async acknowledgeReport(sessionId, reportId) {
    return this.acknowledgeMessage(sessionId, reportId);
  }

  async acknowledgeReview(sessionId, reviewId) {
    return this.acknowledgeMessage(sessionId, reviewId);
  }
}

export class CodexAppServerAdapter {
  constructor({ request, receive = null, id = idFactory } = {}) {
    if (typeof request !== "function") throw new Error("CodexAppServerAdapter requires request(method, params)");
    this.request = request;
    this.receive = receive;
    this.id = id;
  }

  async ensureSeriesSessions({ seriesId, projectId }) {
    const planning = await this.request("thread/start", {
      metadata: { flowstate_role: "planning-controller", project_id: projectId, plan_series_id: seriesId },
    });
    const execution = await this.request("thread/start", {
      metadata: { flowstate_role: "execution-controller", project_id: projectId, plan_series_id: seriesId },
    });
    return {
      planning_session_id: planning?.thread?.id ?? planning?.id ?? planning?.threadId,
      execution_session_id: execution?.thread?.id ?? execution?.id ?? execution?.threadId,
      platform_session_ids: {
        planning: planning?.thread?.id ?? planning?.id ?? planning?.threadId ?? null,
        execution: execution?.thread?.id ?? execution?.id ?? execution?.threadId ?? null,
      },
      delivery_status: "connected",
      adapter: "codex-app-server",
    };
  }

  async ensureWorkerSession({ seriesId, taskId, projectId }) {
    const response = await this.request("thread/start", {
      metadata: { flowstate_role: "execution-worker", project_id: projectId, plan_series_id: seriesId, task_id: taskId },
    });
    return {
      worker_session_id: response?.thread?.id ?? response?.id ?? response?.threadId,
      platform_session_id: response?.thread?.id ?? response?.id ?? response?.threadId ?? null,
      delivery_status: "connected",
    };
  }

  async send(message) {
    const target = required(message.target_session_id ?? message.return_to, "target_session_id");
    const response = await this.request("turn/start", {
      threadId: target,
      input: [{ type: "text", text: JSON.stringify(message) }],
    });
    return { message_id: message.message_id ?? this.id("message"), response };
  }

  async receiveMessages(sessionId, messageTypes) {
    if (typeof this.receive !== "function") return [];
    const messages = await this.receive({ session_id: sessionId, message_types: messageTypes });
    if (!Array.isArray(messages)) throw new Error("CodexAppServerAdapter receive must return an array");
    return messages.filter((message) => !message.message_type || messageTypes.includes(message.message_type));
  }

  async receiveReports(sessionId) {
    return this.receiveMessages(sessionId, ["EXECUTION_REPORT", "EXECUTION_STOPPED", "BLOCKER_REPORT"]);
  }

  async receiveReviews(sessionId) {
    return this.receiveMessages(sessionId, ["REVIEW_DECISION", "PLANNING_BLOCKER_OPINION"]);
  }
}

export class FlowStateDispatcher {
  constructor({ store, adapter, projectId, clock = Date.now, id = idFactory, retryLimit = 2, autoDispatch = true, autoRevision = true, autoAdvance = true } = {}) {
    if (!store) throw new Error("FlowStateDispatcher store is required");
    if (!adapter) throw new Error("FlowStateDispatcher adapter is required");
    this.store = store;
    this.adapter = adapter;
    this.projectId = required(projectId, "projectId");
    this.clock = clock;
    this.id = id;
    this.retryLimit = retryLimit;
    this.autoDispatch = autoDispatch;
    this.autoRevision = autoRevision;
    this.autoAdvance = autoAdvance;
  }

  event(state, type, payload = {}) {
    state.events.push({ event_id: this.id("event"), type, timestamp: nowIso(this.clock), ...clone(payload) });
  }

  async createPlan({ planSeriesId, planVersion, relation = "new", parallelOf = null, plan } = {}) {
    return this.store.transaction(this.projectId, async (state) => {
      const version = String(planVersion ?? "v1");
      let seriesId = planSeriesId ? String(planSeriesId) : null;
      let series = seriesId ? state.series[seriesId] : null;

      if (relation === "extension") {
        if (!series) throw new Error(`Cannot extend missing plan series: ${seriesId}`);
        if (parallelOf) throw new Error("An extension cannot also be parallel");
        const previousNumber = versionNumber(series.current_plan_version);
        const requestedNumber = versionNumber(version);
        if (previousNumber !== null && requestedNumber !== null && requestedNumber <= previousNumber) {
          throw new Error(`extension plan version must increase beyond ${series.current_plan_version}`);
        }
      } else if (relation === "parallel") {
        if (!parallelOf) throw new Error("parallel plans require parallelOf");
        if (!state.series[String(parallelOf)]) throw new Error(`parallelOf series does not exist: ${parallelOf}`);
        seriesId ??= `parallel-${this.id("plan")}`;
        if (state.series[seriesId]) throw new Error(`Parallel plan series id must be new: ${seriesId}`);
        series = null;
      } else if (series) {
        throw new Error(`Plan series already exists: ${seriesId}; use relation extension or parallel`);
      }

      if (!series) {
        seriesId ??= `series-${this.id("plan")}`;
        const sessions = await this.adapter.ensureSeriesSessions({ seriesId, projectId: this.projectId });
        if (!sessions?.planning_session_id || !sessions?.execution_session_id) {
          throw new Error("adapter did not return planning and execution session ids");
        }
        series = {
          plan_series_id: seriesId,
          project_id: this.projectId,
          relation,
          parallel_of: relation === "parallel" ? String(parallelOf) : null,
          planning_session_id: sessions.planning_session_id,
          execution_session_id: sessions.execution_session_id,
          platform_session_ids: sessions.platform_session_ids ?? { planning: sessions.planning_session_id, execution: sessions.execution_session_id },
          delivery_status: sessions.delivery_status ?? "connected",
          adapter: sessions.adapter ?? "custom",
          current_plan_version: null,
          plans: {},
          dispatches: {},
          reports: {},
          reviews: {},
          blockers: {},
          parallel_branches: {},
          status: "planning",
          created_at: nowIso(this.clock),
          updated_at: nowIso(this.clock),
        };
        state.series[seriesId] = series;
        this.event(state, "SERIES_CREATED", { plan_series_id: seriesId, relation, parallel_of: series.parallel_of });
      }

      if (series.plans[version]) throw new Error(`Plan version already exists: ${seriesId}/${version}`);
      const normalized = normalizePlan({ ...plan, project_id: plan?.project_id ?? this.projectId }, seriesId, version);
      if (relation === "parallel" && normalized.serial_parallel_policy !== "parallel") {
        throw new Error("parallel plan relation requires serial_parallel_policy: parallel");
      }
      const parallelTasks = normalized.tasks.filter((task) => normalized.serial_parallel_policy === "parallel" || task.stage_kind === "parallel" || normalized.stages.some((stage) => stage.order === task.stage_order && stage.kind === "parallel"));
      if (parallelTasks.length > 1 && hasOverlappingParallelWrites(parallelTasks)) {
        throw new Error("parallel tasks have overlapping allowed_paths; isolate workspaces or use serial policy");
      }
      normalized.created_at = nowIso(this.clock);
      normalized.updated_at = normalized.created_at;
      if (relation === "extension") {
        const previous = series.plans[series.current_plan_version];
        if (previous) {
          previous.status = "superseded";
          const accepted = new Map(previous.tasks.filter((task) => task.status === "accepted").map((task) => [task.task_id, task]));
          for (const task of normalized.tasks) {
            if (accepted.has(task.task_id)) accepted.delete(task.task_id);
          }
          normalized.tasks = [...accepted.values().map(clone), ...normalized.tasks];
        }
        series.status = "planning";
      }
      series.plans[version] = normalized;
      series.current_plan_version = version;
      series.updated_at = nowIso(this.clock);
      this.event(state, "PLAN_CREATED", { plan_series_id: seriesId, plan_version: version, relation });
      return clone({ plan_series_id: seriesId, plan_id: normalized.plan_id, plan_version: version, planning_session_id: series.planning_session_id, execution_session_id: series.execution_session_id });
    });
  }

  async approvePlan({ planSeriesId, planVersion, approval } = {}) {
    return this.store.transaction(this.projectId, async (state) => {
      const series = state.series[required(planSeriesId, "planSeriesId")];
      const version = String(planVersion ?? series?.current_plan_version);
      const plan = series?.plans[version];
      if (!series || !plan) throw new Error(`Plan not found: ${planSeriesId}/${version}`);
      if (approval?.approver !== "user") throw new Error("approval.approver must be user");
      if (approval?.plan_version !== version) throw new Error("approval.plan_version must exactly match the plan version");
      if (approval?.plan_id && approval.plan_id !== plan.plan_id) throw new Error("approval.plan_id does not match the plan");
      if (!new Set(["approved", "approved-with-conditions"]).has(approval?.decision)) {
        throw new Error("approval decision must be approved or approved-with-conditions");
      }
      const risks = plan.risks.map((risk) => risk.risk_id);
      const acknowledged = new Set(asArray(approval.acknowledged_risks).map(String));
      const missingRisks = risks.filter((riskIdValue) => !acknowledged.has(riskIdValue));
      if (missingRisks.length) throw new Error(`approval must acknowledge every risk: ${missingRisks.join(", ")}`);
      const openBlockers = plan.blockers.filter(blockerIsOpen);
      if (openBlockers.length) throw new Error(`plan has unresolved blockers: ${openBlockers.map((item) => item.blocker_id).join(", ")}`);
      const conditions = asArray(approval.conditions);
      if (approval.decision === "approved-with-conditions" && !conditions.length) throw new Error("conditional approval requires conditions");
      if (approval.decision === "approved-with-conditions" && approval.conditions_satisfied !== true && !conditions.every((condition) => condition?.status === "satisfied" || condition?.satisfied === true)) {
        throw new Error("all conditional approval conditions must be machine-checkable and satisfied");
      }

      plan.approval = {
        ...clone(approval),
        plan_id: plan.plan_id,
        plan_version: version,
        approved_at: nowIso(this.clock),
      };
      plan.status = "approved";
      activateReadyTasks(plan);
      series.status = "approved";
      series.updated_at = nowIso(this.clock);
      this.event(state, "USER_PLAN_APPROVED", { plan_series_id: planSeriesId, plan_version: version, decision: approval.decision });
      return clone({ plan_series_id: planSeriesId, plan_version: version, ready_tasks: plan.tasks.filter((task) => task.status === "ready").map((task) => task.task_id) });
    });
  }

  async dispatchReady({ planSeriesId, planVersion, taskId = null, automatic = false } = {}) {
    let result = await this.store.transaction(this.projectId, async (state) => {
      const series = state.series[required(planSeriesId, "planSeriesId")];
      const version = String(planVersion ?? series?.current_plan_version);
      const plan = series?.plans[version];
      if (!series || !plan) throw new Error(`Plan not found: ${planSeriesId}/${version}`);
      if (plan.status !== "approved") throw new Error(`plan is not executable in status ${plan.status}`);
      if (!plan.approval || plan.approval.plan_id !== plan.plan_id || plan.approval.plan_version !== version) {
        throw new Error("plan is missing exact user approval for this plan id and version");
      }
      if (plan.blockers.some(blockerIsOpen)) throw new Error("plan has unresolved blockers");
      const activeStageOrder = currentStageOrder(plan);
      if (activeStageOrder === null) return { dispatches: [], plan_series_id: planSeriesId, plan_version: version };
      const activeStage = stageForOrder(plan, activeStageOrder);
      const active = plan.tasks.filter((task) => task.status === "dispatched" || task.status === "report-returned").length;
      const parallelStage = activeStage?.kind === "parallel" || plan.tasks.some((task) => task.stage_order === activeStageOrder && task.stage_kind === "parallel");
      const capacity = plan.serial_parallel_policy === "parallel" || parallelStage ? Math.max(1, plan.max_parallel) - active : 1 - active;
      if (capacity <= 0) return { dispatches: [], plan_series_id: planSeriesId, plan_version: version };
      const candidates = plan.tasks.filter((task) => {
        if (task.status !== "ready" && task.status !== "pending") return false;
        if (taskId && task.task_id !== taskId) return false;
        if (task.stage_order !== activeStageOrder) return false;
        return task.dependencies.every((dependency) => plan.tasks.find((item) => item.task_id === dependency)?.status === "accepted");
      }).slice(0, capacity);

      const workers = [];
      for (const task of candidates) {
        const worker = await this.adapter.ensureWorkerSession({ seriesId: planSeriesId, taskId: task.task_id, projectId: this.projectId, parentSessionId: series.execution_session_id });
        if (!worker?.worker_session_id) throw new Error(`adapter did not return worker session for ${task.task_id}`);
        if (automatic && worker.delivery_status !== "connected") {
          const blockerIdValue = `transport-${task.task_id}`;
          const blocker = plan.blockers.find((item) => item.blocker_id === blockerIdValue) ?? {
            blocker_id: blockerIdValue,
            dependency: "live Agent transport",
            impact: `Automatic dispatch for ${task.task_id} cannot start without a connected worker session.`,
            owner: "coordination",
            required_decision: "Provide a transport that creates a real worker session, then resolve this blocker with evidence.",
            resolution: "",
            status: "blocked",
          };
          if (!plan.blockers.some((item) => item.blocker_id === blockerIdValue)) plan.blockers.push(blocker);
          series.blockers[blockerIdValue] = blocker;
          task.status = "blocked";
          task.last_error = `automatic transport unavailable: ${worker.delivery_status ?? "unknown"}`;
          plan.status = "paused-needs-review";
          series.status = "waiting-on-planning";
          this.event(state, "AUTOMATIC_DISPATCH_BLOCKED", { plan_series_id: planSeriesId, plan_version: version, task_id: task.task_id, blocker_id: blockerIdValue, delivery_status: worker.delivery_status ?? "unknown" });
          return { dispatches: [], plan_series_id: planSeriesId, plan_version: version, blocked: true, reason: "live-agent-transport-unavailable", blocker_id: blockerIdValue };
        }
        workers.push({ task, worker });
      }

      const dispatches = [];
      for (const { task, worker } of workers) {
        const dispatchId = this.id("dispatch");
        const taskStage = stageForOrder(plan, task.stage_order);
        const requiredSkills = [...new Set([...(taskStage?.required_skills ?? []), ...task.required_skills])];
        const dispatch = {
          message_type: "PLAN_DISPATCH",
          trace_id: this.id("trace"),
          dispatch_id: dispatchId,
          project_id: this.projectId,
          plan_series_id: planSeriesId,
          plan_id: plan.plan_id,
          plan_version: version,
          task_id: task.task_id,
          parent_session_id: series.execution_session_id,
          planning_session_id: series.planning_session_id,
          target_session_id: worker.worker_session_id,
          worker_session_id: worker.worker_session_id,
          platform_worker_session_id: Object.prototype.hasOwnProperty.call(worker, "platform_session_id") ? worker.platform_session_id : worker.worker_session_id,
          worker_delivery_status: worker.delivery_status ?? "connected",
          manual_handoff: worker.delivery_status !== "connected",
          transport_blocker_id: null,
          transport_error: null,
          execution_session_id: series.execution_session_id,
          stage_id: task.stage_id,
          stage_order: task.stage_order,
          stage_kind: task.stage_kind,
          objective: task.objective,
          scope: task.allowed_paths,
          input_artifacts: [],
          required_skills: requiredSkills,
          stage_agent_selectors: taskStage?.agent_selectors ?? [],
          external_agent_id: task.external_agent_id,
          external_agent_query: task.external_agent_query,
          external_agent_division: task.external_agent_division,
          allowed_paths: task.allowed_paths,
          forbidden_actions: task.forbidden_actions,
          dependencies: task.dependencies,
          acceptance_criteria: task.acceptance_criteria,
          expected_evidence: task.expected_evidence,
          risk_profile: task.risk_profile,
          stop_conditions: task.stop_conditions,
          return_to: series.planning_session_id,
          execution_return_to: series.execution_session_id,
          planning_return_to: series.planning_session_id,
          status: "created",
          message_id: dispatchId,
          idempotency_key: dispatchId,
          revision: task.revision_attempts > 0 ? {
            attempt: task.revision_attempts,
            feedback: clone(task.revision_feedback),
            history: clone(task.revision_history),
          } : null,
          attempt: task.attempts + 1,
          created_at: nowIso(this.clock),
        };
        series.dispatches[dispatchId] = dispatch;
        task.dispatch_id = dispatchId;
        task.status = "dispatched";
        task.attempts += 1;
        this.event(state, "PLAN_DISPATCH_CREATED", { plan_series_id: planSeriesId, plan_version: version, task_id: task.task_id, dispatch_id: dispatchId, target_session_id: worker.worker_session_id });
        dispatches.push(dispatch);
      }
      series.status = dispatches.length ? "executing" : series.status;
      series.updated_at = nowIso(this.clock);
      return { dispatches: clone(dispatches), plan_series_id: planSeriesId, plan_version: version };
    });

    for (const dispatch of result.dispatches) {
      try {
        const sent = await this.adapter.send(dispatch);
        await this.store.transaction(this.projectId, async (state) => {
          const series = state.series[planSeriesId];
          const current = series?.dispatches[dispatch.dispatch_id];
          if (current) {
            current.status = "sent";
            current.message_id = sent?.message_id ?? null;
            current.sent_at = nowIso(this.clock);
            this.event(state, "PLAN_DISPATCH_SENT", { dispatch_id: dispatch.dispatch_id, message_id: current.message_id });
          }
        });
      } catch (error) {
        await this.store.transaction(this.projectId, async (state) => {
          const series = state.series[planSeriesId];
          const current = series?.dispatches[dispatch.dispatch_id];
          const plan = series?.plans[planVersion];
          const task = plan?.tasks.find((item) => item.task_id === dispatch.task_id);
          if (current) current.status = "send-failed";
          if (task) {
            if (automatic) {
              const blockerIdValue = `transport-send-${task.task_id}`;
              const blocker = plan?.blockers.find((item) => item.blocker_id === blockerIdValue) ?? {
                blocker_id: blockerIdValue,
                dependency: "live Agent transport",
                impact: `Automatic dispatch send failed for ${task.task_id}.`,
                owner: "coordination",
                required_decision: "Restore the transport and resolve this blocker with evidence before resuming.",
                resolution: "",
                status: "blocked",
              };
              if (plan && !plan.blockers.some((item) => item.blocker_id === blockerIdValue)) plan.blockers.push(blocker);
              if (blocker) series.blockers[blockerIdValue] = blocker;
              task.status = "blocked";
              if (current) {
                current.transport_blocker_id = blockerIdValue;
                current.transport_error = error.message;
              }
              if (plan) plan.status = "paused-needs-review";
              series.status = "waiting-on-planning";
            } else {
              task.status = task.attempts >= this.retryLimit ? "blocked" : "ready";
            }
            task.last_error = error.message;
          }
          this.event(state, "PLAN_DISPATCH_FAILED", { dispatch_id: dispatch.dispatch_id, error: error.message, retryable: task ? task.status === "ready" : false, automatic });
        });
      }
    }
    return result;
  }

  async ingestExecutionReport(report) {
    let reviewMessage = null;
    const result = await this.store.transaction(this.projectId, async (state) => {
      required(report.report_id, "report.report_id");
      const series = state.series[required(report.plan_series_id, "report.plan_series_id")];
      const plan = series?.plans[String(report.plan_version)];
      const dispatch = series?.dispatches[report.dispatch_id];
      const task = plan?.tasks.find((item) => item.task_id === report.task_id);
      if (!series || !plan || !dispatch || !task) throw new Error("execution report identifiers do not match a known dispatch");
      if (dispatch.task_id !== report.task_id) throw new Error("execution report task_id does not match the dispatch");
      if (dispatch.plan_version !== String(report.plan_version)) throw new Error("execution report plan_version does not match the dispatch");
      if (dispatch.plan_id !== plan.plan_id) throw new Error("dispatch plan_id does not match the plan");
      if (series.reports[report.report_id]) return { duplicate: true, report_id: report.report_id };
      if (report.plan_id && report.plan_id !== plan.plan_id) throw new Error("execution report plan_id does not match");
      const reportStatus = statusOf(report) || "returned-to-planning";
      const abnormalStop = isAbnormalExecutionStop(report);
      const blockers = asArray(report.new_blockers ?? report.blockers);
      if ((abnormalStop || reportStatus === "blocked") && blockers.length === 0) {
        throw new Error("blocked or abnormal execution report requires at least one new_blockers entry");
      }
      const normalizedBlockers = blockers.map((blocker, index) => normalizeReportedBlocker(
        blocker,
        index,
        report,
        Object.keys(series.blockers).length + index,
      ));
      const stored = {
        ...clone(report),
        message_type: abnormalStop ? "EXECUTION_STOPPED" : String(report.message_type ?? "EXECUTION_REPORT"),
        abnormal_stop: abnormalStop,
        new_blockers: clone(normalizedBlockers),
        received_at: nowIso(this.clock),
      };
      series.reports[report.report_id] = stored;
      dispatch.status = "report-received";
      task.report_id = report.report_id;
      task.status = "report-returned";
      const reportRisks = asArray(report.new_risks);
      const highRisk = reportRisks.some((risk) => ["high", "critical"].includes(String(risk.severity ?? risk.level).toLowerCase()));
      for (const blocker of normalizedBlockers) {
        series.blockers[blocker.blocker_id] = blocker;
        if (!plan.blockers.some((item) => item.blocker_id === blocker.blocker_id)) plan.blockers.push(blocker);
      }
      const normalizedReportRisks = reportRisks.map((risk, index) => ({
        ...clone(risk),
        risk_id: riskId(risk, plan.risks.length + index),
        severity: String(risk.severity ?? risk.level ?? "medium"),
        status: String(risk.status ?? "open"),
      }));
      for (const risk of normalizedReportRisks) {
        if (!plan.risks.some((item) => item.risk_id === risk.risk_id)) plan.risks.push(risk);
      }
      if (normalizedReportRisks.length) stored.new_risks = clone(normalizedReportRisks);
      const blockingReport = normalizedBlockers.length > 0 || abnormalStop || reportStatus === "blocked";
      const requiresUser = normalizedBlockers.some((blocker) => blocker.requires_user);
      if (blockingReport || normalizedReportRisks.length) {
        task.status = "blocked";
        plan.status = "paused-needs-review";
        series.status = "waiting-on-planning";
        if (normalizedReportRisks.length) plan.approval = null;
      } else if (reportStatus === "failed") {
        task.status = task.attempts >= this.retryLimit ? "blocked" : "ready";
        plan.status = task.status === "blocked" ? "paused-needs-review" : "approved";
        series.status = task.status === "blocked" ? "waiting-on-planning" : "approved";
      }
      reviewMessage = {
        message_type: blockingReport ? "BLOCKER_REPORT" : "EXECUTION_REPORT",
        message_id: blockingReport ? `blocker-${report.report_id}` : `review-${report.report_id}`,
        idempotency_key: blockingReport ? `blocker-${report.report_id}` : `review-${report.report_id}`,
        target_session_id: series.planning_session_id,
        return_to: series.execution_session_id,
        project_id: this.projectId,
        plan_series_id: report.plan_series_id,
        plan_id: plan.plan_id,
        plan_version: report.plan_version,
        task_id: report.task_id,
        dispatch_id: report.dispatch_id,
        execution_session_id: series.execution_session_id,
        planning_session_id: series.planning_session_id,
        blocker_report_id: blockingReport ? `blocker-${report.report_id}` : null,
        abnormal_stop: abnormalStop,
        blockers: clone(normalizedBlockers),
        requires_user: requiresUser,
        summary: String(report.summary ?? ""),
        recommended_next_action: blockingReport ? (requiresUser ? "planning-review-then-user-escalation" : "planning-review-then-resume") : String(report.recommended_next_action ?? "independent-review"),
        report: stored,
        review_required: true,
      };
      this.event(state, "EXECUTION_REPORT_RECEIVED", { plan_series_id: report.plan_series_id, plan_version: report.plan_version, task_id: report.task_id, dispatch_id: report.dispatch_id, blocker_count: normalizedBlockers.length, high_risk: highRisk, abnormal_stop: abnormalStop });
      if (blockingReport) {
        this.event(state, "EXECUTION_BLOCKER_REPORTED", { plan_series_id: report.plan_series_id, plan_version: report.plan_version, task_id: report.task_id, dispatch_id: report.dispatch_id, report_id: report.report_id, blocker_ids: normalizedBlockers.map((blocker) => blocker.blocker_id), requires_user: requiresUser, abnormal_stop: abnormalStop });
        const delivery = await this.adapter.send(reviewMessage);
        const messageId = delivery?.message_id ?? reviewMessage.message_id;
        this.event(state, "PLANNING_BLOCKER_NOTIFICATION_SENT", { report_id: report.report_id, blocker_report_id: reviewMessage.blocker_report_id, target_session_id: reviewMessage.target_session_id, message_id: messageId });
        return {
          duplicate: false,
          report_id: report.report_id,
          review_required: true,
          paused: true,
          abnormal_stop: abnormalStop,
          requires_user: requiresUser,
          blocker_report_sent: true,
          planning_notification: { message_id: messageId, target_session_id: reviewMessage.target_session_id },
        };
      }
      return {
        duplicate: false,
        report_id: report.report_id,
        review_required: true,
        paused: blockingReport || highRisk,
        abnormal_stop: abnormalStop,
        requires_user: requiresUser,
        blocker_report_sent: false,
      };
    });

    if (!result.duplicate && reviewMessage?.message_type === "EXECUTION_REPORT") {
      try {
        await this.adapter.send(reviewMessage);
      } catch (error) {
        await this.store.transaction(this.projectId, async (state) => {
          this.event(state, "PLANNING_REVIEW_SEND_FAILED", { report_id: report.report_id, error: error.message });
        });
        return { ...result, notification_error: error.message };
      }
    }
    return result;
  }

  async ingestPlanningReview(review) {
    let planningOpinionMessage = null;
    let userActionMessage = null;
    const result = await this.store.transaction(this.projectId, async (state) => {
      const series = state.series[required(review.plan_series_id, "review.plan_series_id")];
      const plan = series?.plans[String(review.plan_version)];
      const task = plan?.tasks.find((item) => item.task_id === review.task_id);
      if (!series || !plan || !task) throw new Error("planning review identifiers do not match a known task");
      if (review.plan_id && review.plan_id !== plan.plan_id) throw new Error("planning review plan_id does not match");
      if (review.report_id && task.report_id && review.report_id !== task.report_id) throw new Error("planning review report_id does not match the task report");
      if (review.review_id && series.reviews[review.review_id]) return { duplicate: true, review_id: review.review_id };
      const reviewId = required(review.review_id ?? this.id("review"), "review_id");
      const decision = String(review.decision);
      if (!["accepted", "revision-required", "blocked", "failed", "continue", "await-user"].includes(decision)) throw new Error(`unsupported planning review decision: ${decision}`);
      const taskReport = series.reports[review.report_id ?? task.report_id];
      const formalBlockerReport = asArray(taskReport?.new_blockers ?? taskReport?.blockers).length > 0;
      if (decision === "blocked" && formalBlockerReport) throw new Error("formal blocker report requires continue or await-user");
      const blockerDecision = ["continue", "await-user"].includes(decision);
      const opinion = blockerDecision ? String(required(review.opinion, "review.opinion")) : String(review.opinion ?? "");
      const requiresUser = review.requires_user ?? review.requiresUser;
      if (blockerDecision && typeof requiresUser !== "boolean") throw new Error("review.requires_user must be boolean for a blocker decision");
      if (decision === "continue" && requiresUser) throw new Error("continue cannot require user action");
      if (decision === "await-user" && !requiresUser) throw new Error("await-user requires user action");
      const stored = { ...clone(review), review_id: reviewId, received_at: nowIso(this.clock) };
      series.reviews[reviewId] = stored;
      task.review_id = reviewId;

      const reviewBlockers = asArray(review.new_blockers);
      for (const [index, blocker] of reviewBlockers.entries()) {
        const normalized = {
          ...clone(blocker),
          blocker_id: blockerId(blocker, Object.keys(series.blockers).length + index),
          status: String(blocker.status ?? "open"),
        };
        series.blockers[normalized.blocker_id] = normalized;
        if (!plan.blockers.some((item) => item.blocker_id === normalized.blocker_id)) plan.blockers.push(normalized);
      }
      const reviewRisks = asArray(review.new_risks);
      for (const [index, risk] of reviewRisks.entries()) {
        const normalized = {
          ...clone(risk),
          risk_id: riskId(risk, plan.risks.length + index),
          severity: String(risk.severity ?? risk.level ?? "medium"),
          status: String(risk.status ?? "open"),
        };
        if (!plan.risks.some((item) => item.risk_id === normalized.risk_id)) plan.risks.push(normalized);
      }
      const highRisk = reviewRisks.some((risk) => ["high", "critical"].includes(String(risk.severity ?? risk.level).toLowerCase()));
      const materialChange = Boolean(review.scope_change || review.material_change || review.requires_reapproval);
      const hasReviewBlockers = reviewBlockers.some(blockerIsOpen);
      const feedback = [
        ...asArray(review.required_changes),
        ...asArray(review.defects),
        ...asArray(review.criteria_results).filter((item) => ["fail", "failed", "revision-required"].includes(String(item?.result ?? item?.status).toLowerCase())),
      ];
      let autoRevisionReady = false;
      const approvalStillValid = Boolean(plan.approval && plan.approval.plan_id === plan.plan_id && plan.approval.plan_version === plan.plan_version);
      let requiresReapproval = materialChange || highRisk || reviewRisks.length > 0 || hasReviewBlockers || !approvalStillValid;
      let planCompleted = false;
      const openBlockersBeforeDecision = plan.blockers.filter(blockerIsOpen);
      if (blockerDecision && openBlockersBeforeDecision.length === 0) throw new Error("planning blocker opinion requires at least one open blocker");
      if (decision === "continue") {
        if (!approvalStillValid || materialChange || highRisk || reviewRisks.length > 0) {
          throw new Error("continue requires the original approval to remain valid with no new risk or material change");
        }
        const resolutions = new Map(asArray(review.blocker_resolutions).map((resolution) => [String(resolution?.blocker_id ?? ""), resolution]));
        for (const blocker of openBlockersBeforeDecision) {
          const resolution = resolutions.get(blocker.blocker_id);
          if (!resolution) throw new Error(`continue requires a resolution for open blocker ${blocker.blocker_id}`);
          if (statusOf(resolution) !== "resolved") throw new Error(`blocker resolution ${blocker.blocker_id} must use status resolved`);
          blocker.resolution = String(required(resolution.resolution, `blocker_resolutions.${blocker.blocker_id}.resolution`));
          blocker.status = "resolved";
          blocker.resolved_by = "planning";
          blocker.resolution_review_id = reviewId;
          if (series.blockers[blocker.blocker_id]) series.blockers[blocker.blocker_id] = blocker;
        }
      }

      if (blockerDecision) {
        planningOpinionMessage = {
          message_type: "PLANNING_BLOCKER_OPINION",
          message_id: `opinion-${reviewId}`,
          idempotency_key: `opinion-${reviewId}`,
          opinion_id: reviewId,
          review_id: reviewId,
          report_id: review.report_id ?? task.report_id ?? null,
          target_session_id: series.execution_session_id,
          return_to: series.execution_session_id,
          project_id: this.projectId,
          plan_series_id: review.plan_series_id,
          plan_id: plan.plan_id,
          plan_version: review.plan_version,
          task_id: review.task_id,
          dispatch_id: series.reports[review.report_id ?? task.report_id]?.dispatch_id ?? task.dispatch_id,
          decision,
          requires_user: Boolean(requiresUser),
          opinion,
          blockers: clone(plan.blockers.filter((blocker) => openBlockersBeforeDecision.some((candidate) => candidate.blocker_id === blocker.blocker_id))),
          blocker_resolutions: clone(asArray(review.blocker_resolutions)),
          next_action: decision === "continue" ? "dispatch" : (requiresUser ? "wait-for-user" : String(review.next_action ?? "wait")),
        };
        if (requiresUser) {
          userActionMessage = {
            message_type: "USER_ACTION_REQUIRED",
            message_id: `user-action-${reviewId}`,
            idempotency_key: `user-action-${reviewId}`,
            target_session_id: series.planning_session_id,
            return_to: series.planning_session_id,
            project_id: this.projectId,
            plan_series_id: review.plan_series_id,
            plan_id: plan.plan_id,
            plan_version: review.plan_version,
            task_id: review.task_id,
            report_id: review.report_id ?? task.report_id ?? null,
            opinion_id: reviewId,
            reason: opinion,
            blockers: clone(openBlockersBeforeDecision),
            recommended_next_action: "Resolve every listed blocker, then record an explicit resolution before execution resumes.",
          };
        }
      }

      if (decision === "accepted") {
        task.status = "accepted";
        task.report_id = task.report_id ?? review.report_id ?? null;
        task.revision_history ??= [];
        const latestRevision = task.revision_history.at(-1);
        if (latestRevision && latestRevision.status === "dispatched") latestRevision.status = "accepted";
        const hasOpenBlockers = plan.blockers.some(blockerIsOpen);
        const requiresPlanningGate = requiresReapproval || hasOpenBlockers;
        if (requiresPlanningGate) {
          // The task evidence may be accepted, but new risk, blockers, or material
          // change invalidate the approval before any dependent work can unlock.
          plan.approval = null;
          planCompleted = false;
          series.status = "waiting-on-planning";
          plan.status = "awaiting-user-approval";
        } else {
          activateReadyTasks(plan);
          const complete = plan.tasks.length > 0 && plan.tasks.every((candidate) => TERMINAL_TASK_STATUSES.has(candidate.status));
          planCompleted = complete;
          series.status = planCompleted ? "completed" : "approved";
          plan.status = planCompleted ? "completed" : "approved";
        }
      } else if (decision === "continue") {
        task.status = "ready";
        plan.status = "approved";
        series.status = "approved";
        requiresReapproval = false;
      } else if (decision === "await-user" || decision === "blocked") {
        task.status = "blocked";
        plan.status = requiresUser ? "awaiting-user-action" : "paused-needs-review";
        series.status = "waiting-on-planning";
      } else if (decision === "revision-required") {
        const maxRevisionCycles = Math.max(1, Number(plan.planning_policy?.max_revision_cycles ?? this.retryLimit) || this.retryLimit);
        const inScopeCorrection = this.autoRevision
          && plan.planning_policy?.auto_revision_in_scope !== false
          && !requiresReapproval
          && !plan.blockers.some(blockerIsOpen)
          && task.revision_attempts < maxRevisionCycles;
        if (inScopeCorrection && plan.approval) {
          task.revision_history ??= [];
          task.revision_attempts += 1;
          task.revision_feedback = feedback.length ? clone(feedback) : ["Rework the task against the accepted criteria and returned evidence."];
          task.revision_history.push({ revision_attempt: task.revision_attempts, review_id: reviewId, feedback: clone(task.revision_feedback), status: "dispatched", created_at: nowIso(this.clock) });
          task.status = "ready";
          plan.status = "approved";
          series.status = "approved";
          autoRevisionReady = true;
        } else {
          task.status = "revision-required";
          plan.status = requiresReapproval ? "awaiting-user-approval" : "revision-required";
          series.status = "planning";
          if (requiresReapproval) plan.approval = null;
        }
      } else {
        task.status = task.attempts >= this.retryLimit ? "blocked" : "ready";
        plan.status = task.status === "blocked" ? "paused-needs-review" : "approved";
        series.status = task.status === "blocked" ? "waiting-on-planning" : "approved";
      }
      syncStageStatuses(plan);
      this.event(state, "PLANNING_REVIEW_RECORDED", {
        plan_series_id: review.plan_series_id,
        plan_version: review.plan_version,
        task_id: review.task_id,
        review_id: reviewId,
        decision,
        requires_user: Boolean(requiresUser),
        revision_attempt: task.revision_attempts,
        auto_revision_ready: autoRevisionReady,
        requires_reapproval: requiresReapproval,
        plan_completed: planCompleted,
      });
      let opinionDelivery = null;
      let userNotification = null;
      if (blockerDecision && planningOpinionMessage) {
        const delivery = await this.adapter.send(planningOpinionMessage);
        opinionDelivery = { delivery: "sent", message_id: delivery?.message_id ?? planningOpinionMessage.message_id, target_session_id: planningOpinionMessage.target_session_id };
        this.event(state, "PLANNING_BLOCKER_OPINION_SENT", { review_id: reviewId, report_id: planningOpinionMessage.report_id, decision, target_session_id: planningOpinionMessage.target_session_id, message_id: opinionDelivery.message_id });
      }
      if (userActionMessage) {
        const delivery = await this.adapter.send(userActionMessage);
        userNotification = { delivery: "sent", message_id: delivery?.message_id ?? userActionMessage.message_id, target_session_id: userActionMessage.target_session_id };
        this.event(state, "PLANNING_USER_ACTION_REQUIRED", { review_id: reviewId, report_id: userActionMessage.report_id, target_session_id: userActionMessage.target_session_id, message_id: userNotification.message_id });
      }
      return {
        duplicate: false,
        review_id: reviewId,
        decision,
        ready_tasks: plan.tasks.filter((item) => item.status === "ready").map((item) => item.task_id),
        series_status: series.status,
        auto_dispatch_ready: plan.status === "approved" && Boolean(plan.approval) && !plan.blockers.some(blockerIsOpen),
        auto_revision_ready: autoRevisionReady,
        revision_attempt: task.revision_attempts,
        plan_completed: planCompleted,
        planning_opinion_required: blockerDecision,
        user_action_required: Boolean(userActionMessage),
        opinion_delivery: opinionDelivery,
        user_notification: userNotification,
        next_plan_template: planCompleted ? clone(plan.next_plan) : null,
      };
    });

    if (!result.duplicate && result.decision === "continue" && this.autoDispatch && result.auto_dispatch_ready && result.ready_tasks.length) {
      const resumed = await this.dispatchReady({ planSeriesId: review.plan_series_id, planVersion: review.plan_version, automatic: true });
      return { ...result, next_dispatches: resumed.dispatches };
    }
    if (!result.duplicate && result.decision === "revision-required" && this.autoDispatch && result.auto_revision_ready) {
      const revision = await this.dispatchReady({ planSeriesId: review.plan_series_id, planVersion: review.plan_version, automatic: true });
      return { ...result, revision_dispatches: revision.dispatches };
    }
    if (!result.duplicate && result.decision === "accepted" && this.autoDispatch && result.auto_dispatch_ready && result.ready_tasks.length) {
      const next = await this.dispatchReady({ planSeriesId: review.plan_series_id, planVersion: review.plan_version, automatic: true });
      const advanced = result.plan_completed && this.autoAdvance && result.next_plan_template
        ? await this.prepareNextPlan({ planSeriesId: review.plan_series_id, planVersion: review.plan_version })
        : null;
      return { ...result, next_dispatches: next.dispatches, next_plan: advanced };
    }
    if (!result.duplicate && result.plan_completed && this.autoAdvance && result.next_plan_template) {
      const advanced = await this.prepareNextPlan({ planSeriesId: review.plan_series_id, planVersion: review.plan_version });
      return { ...result, next_plan: advanced };
    }
    return result;
  }

  async prepareNextPlan({ planSeriesId, planVersion } = {}) {
    const snapshot = await this.store.load(this.projectId);
    const series = snapshot.series[required(planSeriesId, "planSeriesId")];
    const version = String(planVersion ?? series?.current_plan_version);
    const plan = series?.plans[version];
    if (!series || !plan) throw new Error(`Plan not found: ${planSeriesId}/${version}`);
    if (plan.status !== "completed") return { created: false, reason: "current-plan-not-completed" };
    if (!plan.next_plan) return { created: false, reason: "no-next-plan-template" };
    const requestedVersion = plan.next_plan.plan_version ?? plan.next_plan.planVersion;
    const currentNumber = versionNumber(version);
    const nextVersion = String(requestedVersion ?? (currentNumber === null ? `${version}-next` : `v${currentNumber + 1}`));
    if (series.plans[nextVersion]) {
      return { created: true, idempotent: true, plan_series_id: planSeriesId, plan_version: nextVersion, plan_id: series.plans[nextVersion].plan_id };
    }
    const nextPlan = { ...clone(plan.next_plan), project_id: plan.next_plan.project_id ?? this.projectId };
    delete nextPlan.plan_version;
    delete nextPlan.planVersion;
    const created = await this.createPlan({ planSeriesId, planVersion: nextVersion, relation: "extension", plan: nextPlan });
    const message = {
      message_type: "NEXT_PLAN_READY",
      message_id: `next-plan-${planSeriesId}-${nextVersion}`,
      idempotency_key: `next-plan-${planSeriesId}-${nextVersion}`,
      target_session_id: series.planning_session_id,
      return_to: series.planning_session_id,
      project_id: this.projectId,
      plan_series_id: planSeriesId,
      previous_plan_id: plan.plan_id,
      previous_plan_version: version,
      plan_id: created.plan_id,
      plan_version: nextVersion,
      status: "awaiting-user-approval",
      approval_required: true,
    };
    try {
      await this.adapter.send(message);
    } catch (error) {
      await this.store.transaction(this.projectId, async (state) => {
        this.event(state, "NEXT_PLAN_READY_SEND_FAILED", { plan_series_id: planSeriesId, plan_version: nextVersion, error: error.message });
      });
      return { created: true, ...created, message_delivery: "send-failed", error: error.message };
    }
    await this.store.transaction(this.projectId, async (state) => {
      this.event(state, "NEXT_PLAN_PREPARED", { plan_series_id: planSeriesId, previous_plan_version: version, plan_version: nextVersion });
    });
    return { created: true, ...created, message_delivery: "sent", approval_required: true };
  }

  async advanceCompletedPlans() {
    const snapshot = await this.store.load(this.projectId);
    const advanced = [];
    for (const series of Object.values(snapshot.series ?? {})) {
      const plan = series.plans?.[series.current_plan_version];
      if (!plan?.next_plan || plan.status !== "completed") continue;
      advanced.push(await this.prepareNextPlan({ planSeriesId: series.plan_series_id, planVersion: plan.plan_version }));
    }
    return advanced;
  }

  async resolveBlocker({ planSeriesId, planVersion, blockerId: targetId, resolution, status = "resolved" } = {}) {
    return this.store.transaction(this.projectId, async (state) => {
      const series = state.series[required(planSeriesId, "planSeriesId")];
      const plan = series?.plans[String(planVersion ?? series?.current_plan_version)];
      const blocker = plan?.blockers.find((item) => item.blocker_id === targetId);
      if (!series || !plan || !blocker) throw new Error(`blocker not found: ${targetId}`);
      if (statusOf({ status }) !== "resolved") throw new Error("a blocker can close only with status resolved");
      required(resolution, "resolution");
      blocker.status = status;
      blocker.resolution = resolution;
      if (series.blockers[targetId]) series.blockers[targetId] = blocker;
      const openBlockers = plan.blockers.some(blockerIsOpen);
      if (!openBlockers && plan.approval) {
        plan.status = "approved";
        series.status = "approved";
        for (const task of plan.tasks) if (task.status === "blocked" && task.dispatch_id) task.status = "ready";
        activateReadyTasks(plan);
      }
      syncStageStatuses(plan);
      this.event(state, "BLOCKER_RESOLVED", { plan_series_id: planSeriesId, plan_version: plan.plan_version, blocker_id: targetId, status });
      return { blocker_id: targetId, status, open_blockers: openBlockers, plan_status: plan.status };
    });
  }

  async syncParallelResult({ planSeriesId } = {}) {
    const snapshot = await this.store.load(this.projectId);
    const child = snapshot.series[required(planSeriesId, "planSeriesId")];
    if (!child) throw new Error(`plan series not found: ${planSeriesId}`);
    if (!child.parallel_of) return { synchronized: false, reason: "series-is-not-parallel" };
    const plan = child.plans[child.current_plan_version];
    const complete = plan?.status === "completed";
    if (!complete) return { synchronized: false, reason: "parallel-series-not-complete" };
    const parent = snapshot.series[child.parallel_of];
    if (!parent) throw new Error(`parallel parent series not found: ${child.parallel_of}`);
    const previousSync = parent.parallel_branches?.[child.plan_series_id];
    if (previousSync?.status === "sent") return { synchronized: true, idempotent: true, parent_plan_series_id: child.parallel_of, message_id: previousSync.message_id ?? null };
    const message = {
      message_type: "PARALLEL_PLAN_SYNC",
      target_session_id: parent.planning_session_id,
      return_to: parent.planning_session_id,
      project_id: this.projectId,
      parent_plan_series_id: parent.plan_series_id,
      parallel_plan_series_id: child.plan_series_id,
      parallel_plan_version: child.current_plan_version,
      summary: plan.summary,
      accepted_tasks: plan.tasks.filter((task) => task.status === "accepted").map((task) => task.task_id),
      evidence: Object.values(child.reports).flatMap((report) => asArray(report.evidence)),
    };
    let sent;
    try {
      sent = await this.adapter.send(message);
    } catch (error) {
      await this.store.transaction(this.projectId, async (state) => {
        const currentParent = state.series[child.parallel_of];
        currentParent.parallel_branches ??= {};
        currentParent.parallel_branches[child.plan_series_id] = { status: "send-failed", error: error.message, child_plan_series_id: child.plan_series_id, updated_at: nowIso(this.clock) };
        this.event(state, "PARALLEL_PLAN_SYNC_FAILED", { plan_series_id: planSeriesId, parent_plan_series_id: child.parallel_of, error: error.message });
      });
      throw error;
    }
    await this.store.transaction(this.projectId, async (state) => {
      const current = state.series[planSeriesId];
      current.parallel_sync = { sent_at: nowIso(this.clock), message_id: sent?.message_id ?? null, parent_plan_series_id: child.parallel_of };
      const currentParent = state.series[child.parallel_of];
      currentParent.parallel_branches ??= {};
      currentParent.parallel_branches[child.plan_series_id] = { status: "sent", child_plan_series_id: child.plan_series_id, message_id: sent?.message_id ?? null, sent_at: nowIso(this.clock) };
      this.event(state, "PARALLEL_PLAN_SYNCHRONIZED", { plan_series_id: planSeriesId, parent_plan_series_id: child.parallel_of, message_id: sent?.message_id ?? null });
    });
    return { synchronized: true, parent_plan_series_id: child.parallel_of, message_id: sent?.message_id ?? null };
  }
}

function uniqueValues(values) {
  return [...new Set(values.filter((value) => value !== undefined && value !== null && value !== "").map(String))];
}

function waitForNextCycle(intervalMs, signal) {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      if (signal) signal.removeEventListener("abort", onAbort);
      resolve();
    }, intervalMs);
    function onAbort() {
      clearTimeout(timeout);
      signal.removeEventListener("abort", onAbort);
      resolve();
    }
    if (signal) {
      if (signal.aborted) onAbort();
      else signal.addEventListener("abort", onAbort, { once: true });
    }
  });
}

/**
 * Drives the dispatcher from persisted queue/state events. The runtime is deliberately
 * explicit: runOnce is safe for restart hooks and watch is the opt-in long-running loop.
 */
export class FlowStateRuntime {
  constructor({ dispatcher, store = dispatcher?.store, adapter = dispatcher?.adapter, projectId = dispatcher?.projectId, clock = Date.now, id = idFactory, pollIntervalMs = 1000 } = {}) {
    if (!dispatcher) throw new Error("FlowStateRuntime dispatcher is required");
    if (!store) throw new Error("FlowStateRuntime store is required");
    if (!adapter) throw new Error("FlowStateRuntime adapter is required");
    this.dispatcher = dispatcher;
    this.store = store;
    this.adapter = adapter;
    this.projectId = required(projectId, "projectId");
    this.clock = clock;
    this.id = id;
    this.pollIntervalMs = Math.max(10, Number(pollIntervalMs) || 1000);
  }

  async processReports(state, result) {
    if (typeof this.adapter.receiveReports !== "function") return;
    const sessions = uniqueValues(Object.values(state.series ?? {}).map((series) => series.planning_session_id));
    for (const sessionId of sessions) {
      let reports;
      try {
        reports = await this.adapter.receiveReports(sessionId);
      } catch (error) {
        result.errors.push({ phase: "receive-report", session_id: sessionId, error: error.message });
        continue;
      }
      for (const report of reports) {
        try {
          const ingested = await this.dispatcher.ingestExecutionReport(report);
          if (typeof this.adapter.acknowledgeReport === "function" && report.report_id) {
            await this.adapter.acknowledgeReport(sessionId, report.report_id);
          }
          result.reports.push({ report_id: report.report_id ?? null, session_id: sessionId, duplicate: Boolean(ingested.duplicate) });
        } catch (error) {
          result.errors.push({ phase: "ingest-report", session_id: sessionId, report_id: report.report_id ?? null, error: error.message });
        }
      }
    }
  }

  async processReviews(state, result) {
    if (typeof this.adapter.receiveReviews !== "function") return;
    const sessions = uniqueValues(Object.values(state.series ?? {}).map((series) => series.execution_session_id));
    for (const sessionId of sessions) {
      let reviews;
      try {
        reviews = await this.adapter.receiveReviews(sessionId);
      } catch (error) {
        result.errors.push({ phase: "receive-review", session_id: sessionId, error: error.message });
        continue;
      }
      for (const review of reviews) {
        try {
          const ingested = await this.dispatcher.ingestPlanningReview(review);
          if (typeof this.adapter.acknowledgeReview === "function" && review.review_id) {
            await this.adapter.acknowledgeReview(sessionId, review.review_id);
          }
          result.reviews.push({ review_id: review.review_id ?? null, session_id: sessionId, duplicate: Boolean(ingested.duplicate), next_dispatches: ingested.next_dispatches ?? [] });
        } catch (error) {
          result.errors.push({ phase: "ingest-review", session_id: sessionId, review_id: review.review_id ?? null, error: error.message });
        }
      }
    }
  }

  async resumeReadyPlans(result) {
    const state = await this.store.load(this.projectId);
    for (const series of Object.values(state.series ?? {})) {
      const plan = series.plans?.[series.current_plan_version];
      if (!plan || plan.status !== "approved" || !plan.approval || plan.blockers.some(blockerIsOpen)) continue;
      try {
        const resumed = await this.dispatcher.dispatchReady({ planSeriesId: series.plan_series_id, planVersion: plan.plan_version, automatic: true });
        if (resumed.dispatches.length) result.dispatches.push(...resumed.dispatches.map((dispatch) => ({ dispatch_id: dispatch.dispatch_id, task_id: dispatch.task_id, plan_series_id: series.plan_series_id, resumed: true })));
      } catch (error) {
        result.errors.push({ phase: "resume-dispatch", plan_series_id: series.plan_series_id, plan_version: plan.plan_version, error: error.message });
      }
    }
  }

  async runOnce({ resume = true } = {}) {
    const result = {
      cycle_id: this.id("cycle"),
      project_id: this.projectId,
      started_at: nowIso(this.clock),
      reports: [],
      reviews: [],
      dispatches: [],
      next_plans: [],
      errors: [],
    };
    const initialState = await this.store.load(this.projectId);
    await this.processReports(initialState, result);
    await this.processReviews(await this.store.load(this.projectId), result);
    if (this.dispatcher.autoAdvance) {
      try {
        result.next_plans.push(...await this.dispatcher.advanceCompletedPlans());
      } catch (error) {
        result.errors.push({ phase: "advance-next-plan", error: error.message });
      }
    }
    if (resume) await this.resumeReadyPlans(result);
    result.completed_at = nowIso(this.clock);
    result.status = result.errors.length ? "completed-with-errors" : "completed";
    return result;
  }

  async watch({ intervalMs = this.pollIntervalMs, maxCycles = null, signal = null } = {}) {
    const delay = Math.max(10, Number(intervalMs) || this.pollIntervalMs);
    const limit = maxCycles === null || maxCycles === undefined ? null : Math.max(1, Number(maxCycles) || 1);
    let cycles = 0;
    let last = null;
    while (!signal?.aborted && (limit === null || cycles < limit)) {
      last = await this.runOnce({ resume: true });
      cycles += 1;
      if (limit !== null && cycles >= limit) break;
      await waitForNextCycle(delay, signal);
    }
    return { project_id: this.projectId, cycles, stopped: Boolean(signal?.aborted), last };
  }
}

export { blockerIsOpen, normalizePlan, normalizeTask };
