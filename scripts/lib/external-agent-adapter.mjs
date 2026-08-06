import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

function tokens(value) {
  return String(value ?? "").toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 1);
}

function required(value, name) {
  if (value === undefined || value === null || value === "") throw new Error(`${name} is required`);
  return value;
}

function resolveWithin(root, value, name) {
  const resolved = path.resolve(root, required(value, name));
  const relative = path.relative(root, resolved);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`${name} must stay within the external Agent catalog root`);
  }
  return resolved;
}

function gitBlobSha(text) {
  const content = Buffer.from(String(text), "utf8");
  return createHash("sha1")
    .update(`blob ${content.length}\0`, "utf8")
    .update(content)
    .digest("hex");
}

function verifyPromptIntegrity(entry, text) {
  if (!entry.source_sha) return;
  if (!/^[0-9a-f]{40}$/i.test(String(entry.source_sha))) {
    throw new Error(`external Agent source_sha is invalid: ${entry.agent_id}`);
  }
  const actual = gitBlobSha(text);
  if (actual.toLowerCase() !== String(entry.source_sha).toLowerCase()) {
    throw new Error(`external Agent prompt integrity mismatch: ${entry.agent_id}`);
  }
}

function validateRemoteSource(entry) {
  const source = new URL(required(entry.source_url, "external Agent source_url"));
  if (source.protocol !== "https:") {
    throw new Error(`external Agent source_url must use HTTPS: ${entry.agent_id}`);
  }
  return source;
}

const REQUIRED_DISPATCH_FIELDS = [
  "trace_id",
  "dispatch_id",
  "project_id",
  "plan_series_id",
  "plan_id",
  "plan_version",
  "task_id",
  "target_session_id",
  "planning_session_id",
  "execution_session_id",
  "return_to",
];

function validateExternalDispatch(message) {
  if (message.message_type !== "PLAN_DISPATCH") {
    throw new Error("external Agent invocation requires a PLAN_DISPATCH message");
  }
  for (const field of REQUIRED_DISPATCH_FIELDS) required(message[field], `dispatch.${field}`);
  if (!Array.isArray(message.acceptance_criteria) || message.acceptance_criteria.length === 0) {
    throw new Error("external Agent dispatch requires acceptance_criteria");
  }
  if (!Array.isArray(message.expected_evidence) || message.expected_evidence.length === 0) {
    throw new Error("external Agent dispatch requires expected_evidence");
  }
}

export class ExternalAgentCatalog {
  constructor({ root, indexPath = "integrations/external-agents/agency-agents/index.json", metadataIndexPath = "integrations/external-agents/agency-agents/metadata-index.json", fetchText = globalThis.fetch } = {}) {
    if (!root) throw new Error("ExternalAgentCatalog root is required");
    this.root = path.resolve(root);
    this.indexPath = resolveWithin(this.root, indexPath, "indexPath");
    this.metadataIndexPath = resolveWithin(this.root, metadataIndexPath, "metadataIndexPath");
    this.fetchText = fetchText;
    this.index = null;
    this.metadataIndex = null;
  }

  async load() {
    if (!this.index) {
      const index = JSON.parse(await readFile(this.indexPath, "utf8"));
      if (!Array.isArray(index.agents)) throw new Error("external Agent index must contain an agents array");
      this.index = index;
    }
    return this.index;
  }

  async loadMetadata() {
    if (!this.metadataIndex) {
      const index = JSON.parse(await readFile(this.metadataIndexPath, "utf8"));
      if (!Array.isArray(index.agents)) throw new Error("external Agent metadata index must contain an agents array");
      this.metadataIndex = index;
    }
    return this.metadataIndex;
  }

  async routingMetadata(agentId) {
    const index = await this.loadMetadata();
    return index.agents.find((entry) => entry.agent_id === agentId) ?? null;
  }

  async search({ query = "", division = null, limit = 10 } = {}) {
    const index = await this.load();
    const metadataIndex = await this.loadMetadata();
    const metadataById = new Map(metadataIndex.agents.map((entry) => [entry.agent_id, entry]));
    const queryTokens = tokens(query);
    return index.agents
      .filter((entry) => !division || entry.division === division)
      .map((entry) => {
        const haystack = tokens([entry.name, entry.description, entry.vibe, entry.division, ...(entry.routing_terms ?? [])].join(" "));
        const score = queryTokens.reduce((sum, token) => sum + (haystack.includes(token) ? 1 : 0), 0);
        return { ...entry, routing_metadata: metadataById.get(entry.agent_id) ?? null, match_score: score };
      })
      .filter((entry) => !queryTokens.length || entry.match_score > 0)
      .sort((left, right) => right.match_score - left.match_score || left.agent_id.localeCompare(right.agent_id))
      .slice(0, limit);
  }

  async resolve({ agentId = null, query = "", division = null, requireAutoRoute = false } = {}) {
    const index = await this.load();
    let resolved;
    if (agentId) {
      const exact = index.agents.find((entry) => entry.agent_id === agentId);
      if (!exact) throw new Error(`external Agent not found: ${agentId}`);
      resolved = exact;
    } else {
      const candidates = await this.search({ query, division, limit: 1 });
      if (!candidates.length) throw new Error(`no external Agent matches query: ${query}`);
      resolved = candidates[0];
    }
    const metadata = await this.routingMetadata(resolved.agent_id);
    if (!metadata) throw new Error(`external Agent metadata is missing: ${resolved.agent_id}`);
    if (requireAutoRoute && metadata.auto_route !== true) throw new Error(`external Agent is not eligible for automatic routing: ${resolved.agent_id}`);
    return { ...resolved, routing_metadata: metadata };
  }

  async prompt(entry) {
    required(entry?.agent_id, "external Agent agent_id");
    const local = entry.prompt_path ? resolveWithin(this.root, entry.prompt_path, "prompt_path") : null;
    if (local) {
      try {
        const text = await readFile(local, "utf8");
        verifyPromptIntegrity(entry, text);
        return text;
      } catch (error) {
        if (error.message.includes("integrity mismatch") || error.message.includes("source_sha is invalid")) throw error;
        /* Fall through to the recorded source URL when an index-only cache is missing. */
      }
    }
    if (typeof this.fetchText !== "function") throw new Error(`external Agent prompt is unavailable: ${entry.agent_id}`);
    const source = validateRemoteSource(entry);
    const response = await this.fetchText(source.toString(), { headers: { "User-Agent": "PDGO-external-agent-adapter" } });
    if (!response.ok) throw new Error(`external Agent prompt request failed (${response.status}): ${entry.source_url}`);
    const text = await response.text();
    verifyPromptIntegrity(entry, text);
    return text;
  }
}

export class AgencyAgentsAdapter {
  constructor({ catalog, baseAdapter } = {}) {
    if (!catalog) throw new Error("AgencyAgentsAdapter catalog is required");
    if (!baseAdapter) throw new Error("AgencyAgentsAdapter baseAdapter is required");
    this.catalog = catalog;
    this.baseAdapter = baseAdapter;
  }

  async ensureSeriesSessions(input) { return this.baseAdapter.ensureSeriesSessions(input); }

  async ensureWorkerSession(input) { return this.baseAdapter.ensureWorkerSession(input); }

  async receiveReports(input) {
    if (typeof this.baseAdapter.receiveReports !== "function") return [];
    return this.baseAdapter.receiveReports(input);
  }

  async receiveReviews(input) {
    if (typeof this.baseAdapter.receiveReviews !== "function") return [];
    return this.baseAdapter.receiveReviews(input);
  }

  async acknowledgeReport(sessionId, reportId) {
    if (typeof this.baseAdapter.acknowledgeReport !== "function") return { acknowledged: false, reason: "adapter-does-not-support-ack" };
    return this.baseAdapter.acknowledgeReport(sessionId, reportId);
  }

  async acknowledgeReview(sessionId, reviewId) {
    if (typeof this.baseAdapter.acknowledgeReview !== "function") return { acknowledged: false, reason: "adapter-does-not-support-ack" };
    return this.baseAdapter.acknowledgeReview(sessionId, reviewId);
  }

  async enqueueReport(input) {
    if (typeof this.baseAdapter.enqueueReport !== "function") throw new Error("base adapter does not support report enqueue");
    return this.baseAdapter.enqueueReport(input);
  }

  async enqueueReview(input) {
    if (typeof this.baseAdapter.enqueueReview !== "function") throw new Error("base adapter does not support review enqueue");
    return this.baseAdapter.enqueueReview(input);
  }

  async searchAgents(input) { return this.catalog.search(input); }

  async send(message) {
    const hasSelector = Boolean(message.external_agent_id || message.external_agent_query || message.external_agent_division);
    if (!hasSelector) return this.baseAdapter.send(message);
    validateExternalDispatch(message);
    const automaticSelection = !message.external_agent_id;
    const entry = await this.catalog.resolve({ agentId: message.external_agent_id, query: message.external_agent_query ?? message.objective ?? message.scenario ?? "", division: message.external_agent_division, requireAutoRoute: automaticSelection });
    const instructions = await this.catalog.prompt(entry);
    const catalog = await this.catalog.load();
    return this.baseAdapter.send({
      ...message,
      external_agent_id: entry.agent_id,
      external_agent_source_commit: catalog.provider?.source_commit ?? null,
      external_agent: {
        provider_id: entry.provider_id,
        agent_id: entry.agent_id,
        name: entry.name,
        division: entry.division,
        description: entry.description,
        source_path: entry.source_path,
        source_url: entry.source_url,
        source_ref: entry.source_ref,
        source_sha: entry.source_sha,
        source_commit: catalog.provider?.source_commit ?? null,
        routing_metadata: entry.routing_metadata,
        routing_mode: automaticSelection ? "automatic" : "explicit-task-selector",
        invocation_status: "dispatched",
        instructions,
      },
    });
  }
}

export function externalAgentSelector({ agentId, query, division } = {}) {
  return {
    external_agent_id: agentId ?? null,
    external_agent_query: query ?? null,
    external_agent_division: division ?? null,
  };
}
