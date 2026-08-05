import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const STATE_VERSION = "1.0";
const OPEN_BLOCKER_STATUSES = new Set(["open", "blocked", "needs-user-decision"]);
const TERMINAL_TASK_STATUSES = new Set(["accepted"]);

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
  return OPEN_BLOCKER_STATUSES.has(statusOf(blocker));
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

function normalizeTask(task, index) {
  const taskId = String(task.task_id ?? task.id ?? `T${String(index + 1).padStart(2, "0")}`);
  return {
    task_id: taskId,
    title: required(task.title ?? task.objective, `tasks[${index}].title`),
    objective: String(task.objective ?? task.title),
    status: String(task.status ?? "pending"),
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
    non_goals: asArray(plan.non_goals ?? plan.nonGoals),
    current_state: String(plan.current_state ?? plan.currentState ?? ""),
    inputs: asArray(plan.inputs),
    assumptions: asArray(plan.assumptions),
    dependencies: asArray(plan.dependencies),
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
    status: "awaiting-user-approval",
    approval: null,
    created_at: plan.created_at ?? null,
    updated_at: plan.updated_at ?? null,
  };
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
    const messageId = message.message_id ?? this.id("message");
    const safeStamp = nowIso(this.clock).replace(/[:.]/g, "-");
    const filePath = path.join(directory, `${safeStamp}-${messageId}.json`);
    await writeFile(filePath, `${JSON.stringify({ ...clone(message), message_id: messageId }, null, 2)}\n`, "utf8");
    return { message_id: messageId, path: filePath };
  }

  async enqueueReport(report) {
    const target = safeQueueSegment(report.return_to ?? report.planning_session_id, "return_to");
    const directory = path.join(this.root, "inbox", target);
    await mkdir(directory, { recursive: true });
    const reportId = report.report_id ?? this.id("report");
    const filePath = path.join(directory, `${reportId}.json`);
    await writeFile(filePath, `${JSON.stringify({ ...clone(report), report_id: reportId }, null, 2)}\n`, "utf8");
    return { report_id: reportId, path: filePath };
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
    return Promise.all(names.map(async (name) => JSON.parse(await readFile(path.join(directory, name), "utf8"))));
  }
}

export class CodexAppServerAdapter {
  constructor({ request, id = idFactory } = {}) {
    if (typeof request !== "function") throw new Error("CodexAppServerAdapter requires request(method, params)");
    this.request = request;
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
}

export class FlowStateDispatcher {
  constructor({ store, adapter, projectId, clock = Date.now, id = idFactory, retryLimit = 2, autoDispatch = true } = {}) {
    if (!store) throw new Error("FlowStateDispatcher store is required");
    if (!adapter) throw new Error("FlowStateDispatcher adapter is required");
    this.store = store;
    this.adapter = adapter;
    this.projectId = required(projectId, "projectId");
    this.clock = clock;
    this.id = id;
    this.retryLimit = retryLimit;
    this.autoDispatch = autoDispatch;
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
      if (normalized.serial_parallel_policy === "parallel" && hasOverlappingParallelWrites(normalized.tasks)) {
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
      return clone({ plan_series_id: seriesId, plan_version: version, planning_session_id: series.planning_session_id, execution_session_id: series.execution_session_id });
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

      plan.approval = { ...clone(approval), approved_at: nowIso(this.clock) };
      plan.status = "approved";
      plan.tasks.forEach((task) => {
        if (task.status === "pending" && task.dependencies.length === 0) task.status = "ready";
      });
      series.status = "approved";
      series.updated_at = nowIso(this.clock);
      this.event(state, "USER_PLAN_APPROVED", { plan_series_id: planSeriesId, plan_version: version, decision: approval.decision });
      return clone({ plan_series_id: planSeriesId, plan_version: version, ready_tasks: plan.tasks.filter((task) => task.status === "ready").map((task) => task.task_id) });
    });
  }

  async dispatchReady({ planSeriesId, planVersion, taskId = null } = {}) {
    let result = await this.store.transaction(this.projectId, async (state) => {
      const series = state.series[required(planSeriesId, "planSeriesId")];
      const version = String(planVersion ?? series?.current_plan_version);
      const plan = series?.plans[version];
      if (!series || !plan) throw new Error(`Plan not found: ${planSeriesId}/${version}`);
      if (plan.status !== "approved") throw new Error(`plan is not executable in status ${plan.status}`);
      if (plan.blockers.some(blockerIsOpen)) throw new Error("plan has unresolved blockers");
      const active = plan.tasks.filter((task) => task.status === "dispatched" || task.status === "report-returned").length;
      const capacity = plan.serial_parallel_policy === "parallel" ? Math.max(1, plan.max_parallel) - active : 1 - active;
      if (capacity <= 0) return { dispatches: [], plan_series_id: planSeriesId, plan_version: version };
      const candidates = plan.tasks.filter((task) => {
        if (task.status !== "ready" && task.status !== "pending") return false;
        if (taskId && task.task_id !== taskId) return false;
        return task.dependencies.every((dependency) => plan.tasks.find((item) => item.task_id === dependency)?.status === "accepted");
      }).slice(0, capacity);

      const dispatches = [];
      for (const task of candidates) {
        const worker = await this.adapter.ensureWorkerSession({ seriesId: planSeriesId, taskId: task.task_id, projectId: this.projectId, parentSessionId: series.execution_session_id });
        if (!worker?.worker_session_id) throw new Error(`adapter did not return worker session for ${task.task_id}`);
        const dispatchId = this.id("dispatch");
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
          execution_session_id: series.execution_session_id,
          objective: task.objective,
          scope: task.allowed_paths,
          input_artifacts: [],
          required_skills: task.required_skills,
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
            task.status = task.attempts >= this.retryLimit ? "blocked" : "ready";
            task.last_error = error.message;
          }
          this.event(state, "PLAN_DISPATCH_FAILED", { dispatch_id: dispatch.dispatch_id, error: error.message, retryable: task ? task.status === "ready" : false });
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
      const stored = { ...clone(report), received_at: nowIso(this.clock) };
      series.reports[report.report_id] = stored;
      dispatch.status = "report-received";
      task.report_id = report.report_id;
      task.status = "report-returned";
      const blockers = asArray(report.new_blockers);
      const highRisk = asArray(report.new_risks).some((risk) => ["high", "critical"].includes(String(risk.severity ?? risk.level).toLowerCase()));
      for (const [index, blocker] of blockers.entries()) {
        const normalized = { ...clone(blocker), blocker_id: blockerId(blocker, Object.keys(series.blockers).length + index), status: String(blocker.status ?? "open") };
        series.blockers[normalized.blocker_id] = normalized;
        plan.blockers.push(normalized);
      }
      const reportStatus = String(report.status ?? "returned-to-planning");
      if (blockers.length || highRisk || reportStatus === "blocked") {
        task.status = "blocked";
        plan.status = "paused-needs-review";
        series.status = "waiting-on-planning";
        if (highRisk) plan.approval = null;
      } else if (reportStatus === "failed") {
        task.status = task.attempts >= this.retryLimit ? "blocked" : "ready";
        plan.status = task.status === "blocked" ? "paused-needs-review" : "approved";
        series.status = task.status === "blocked" ? "waiting-on-planning" : "approved";
      }
      reviewMessage = {
        message_type: "EXECUTION_REPORT",
        target_session_id: series.planning_session_id,
        return_to: series.planning_session_id,
        project_id: this.projectId,
        plan_series_id: report.plan_series_id,
        plan_id: plan.plan_id,
        plan_version: report.plan_version,
        task_id: report.task_id,
        dispatch_id: report.dispatch_id,
        execution_session_id: series.execution_session_id,
        report: stored,
        review_required: true,
      };
      this.event(state, "EXECUTION_REPORT_RECEIVED", { plan_series_id: report.plan_series_id, plan_version: report.plan_version, task_id: report.task_id, dispatch_id: report.dispatch_id, blocker_count: blockers.length, high_risk: highRisk });
      return { duplicate: false, report_id: report.report_id, review_required: true, paused: blockers.length > 0 || highRisk };
    });

    if (!result.duplicate && reviewMessage) {
      try {
        await this.adapter.send(reviewMessage);
      } catch (error) {
        await this.store.transaction(this.projectId, async (state) => {
          this.event(state, "PLANNING_REVIEW_SEND_FAILED", { report_id: report.report_id, error: error.message });
        });
      }
    }
    return result;
  }

  async ingestPlanningReview(review) {
    const result = await this.store.transaction(this.projectId, async (state) => {
      const series = state.series[required(review.plan_series_id, "review.plan_series_id")];
      const plan = series?.plans[String(review.plan_version)];
      const task = plan?.tasks.find((item) => item.task_id === review.task_id);
      if (!series || !plan || !task) throw new Error("planning review identifiers do not match a known task");
      if (review.review_id && series.reviews[review.review_id]) return { duplicate: true, review_id: review.review_id };
      const reviewId = required(review.review_id ?? this.id("review"), "review_id");
      const decision = String(review.decision);
      if (!["accepted", "revision-required", "blocked", "failed"].includes(decision)) throw new Error(`unsupported planning review decision: ${decision}`);
      const stored = { ...clone(review), review_id: reviewId, received_at: nowIso(this.clock) };
      series.reviews[reviewId] = stored;
      task.review_id = reviewId;
      if (decision === "accepted") {
        task.status = "accepted";
        task.report_id = task.report_id ?? review.report_id ?? null;
        for (const candidate of plan.tasks) {
          if (candidate.status !== "pending") continue;
          if (candidate.dependencies.every((dependency) => plan.tasks.find((item) => item.task_id === dependency)?.status === "accepted")) candidate.status = "ready";
        }
        const complete = plan.tasks.length > 0 && plan.tasks.every((candidate) => TERMINAL_TASK_STATUSES.has(candidate.status));
        series.status = complete ? "completed" : "approved";
        plan.status = complete ? "completed" : "approved";
      } else if (decision === "blocked") {
        task.status = "blocked";
        plan.status = "paused-needs-review";
        series.status = "waiting-on-planning";
      } else if (decision === "revision-required") {
        task.status = "revision-required";
        plan.status = "revision-required";
        series.status = "planning";
      } else {
        task.status = task.attempts >= this.retryLimit ? "blocked" : "ready";
        plan.status = task.status === "blocked" ? "paused-needs-review" : "approved";
        series.status = task.status === "blocked" ? "waiting-on-planning" : "approved";
      }
      this.event(state, "PLANNING_REVIEW_RECORDED", { plan_series_id: review.plan_series_id, plan_version: review.plan_version, task_id: review.task_id, review_id: reviewId, decision });
      return { duplicate: false, review_id: reviewId, decision, ready_tasks: plan.tasks.filter((item) => item.status === "ready").map((item) => item.task_id), series_status: series.status };
    });

    if (!result.duplicate && result.decision === "accepted" && this.autoDispatch && result.ready_tasks.length) {
      const next = await this.dispatchReady({ planSeriesId: review.plan_series_id, planVersion: review.plan_version });
      return { ...result, next_dispatches: next.dispatches };
    }
    return result;
  }

  async resolveBlocker({ planSeriesId, planVersion, blockerId: targetId, resolution, status = "resolved with evidence" } = {}) {
    return this.store.transaction(this.projectId, async (state) => {
      const series = state.series[required(planSeriesId, "planSeriesId")];
      const plan = series?.plans[String(planVersion ?? series?.current_plan_version)];
      const blocker = plan?.blockers.find((item) => item.blocker_id === targetId);
      if (!series || !plan || !blocker) throw new Error(`blocker not found: ${targetId}`);
      blocker.status = status;
      blocker.resolution = resolution;
      if (series.blockers[targetId]) series.blockers[targetId] = blocker;
      const openBlockers = plan.blockers.some(blockerIsOpen);
      if (!openBlockers && plan.approval) {
        plan.status = "approved";
        series.status = "approved";
        for (const task of plan.tasks) {
          if (task.status === "blocked" && task.dispatch_id) task.status = "ready";
          if (task.status === "pending" && task.dependencies.every((dependency) => plan.tasks.find((item) => item.task_id === dependency)?.status === "accepted")) task.status = "ready";
        }
      }
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

export { blockerIsOpen, normalizePlan, normalizeTask };
