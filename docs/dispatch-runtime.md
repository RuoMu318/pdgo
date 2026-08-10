# Runtime dispatch and series continuity

The runtime is an explicit state machine. It is not a background promise hidden inside a conversation.

## State flow

```text
create series/plan
  -> awaiting-user-approval
  -> approved
  -> ready task
  -> PLAN_DISPATCH to task worker
  -> EXECUTION_REPORT from bound task worker
  -> REVIEW_REQUEST to fixed independent reviewer
      accepted       -> unlock dependent task -> dispatch next task
      revision       -> in-scope correction dispatch -> repeat review
      new risk/scope change -> pause -> new plan version and approval
      blocker/abnormal stop -> BLOCKER_REPORT -> planning opinion
          resolvable -> PLANNING_BLOCKER_OPINION(continue) -> re-dispatch stopped task
          user-owned -> USER_ACTION_REQUIRED -> keep execution paused
      failed         -> retry within profile limit or block
```

The dispatcher records every execution report and sends a normal result to the bound reviewer. Planning receives only
blocker disposition work. A worker cannot unlock a dependent task by reporting success, and planning cannot accept its
own plan. A correction may stay in the same version only when it redoes omitted approved
work, repairs a defect, or uses another method without changing the approved contract. New risks, blockers,
permissions, acceptance, architecture, rollback, or scope changes invalidate approval until planning and the user
review the change.

Any new risk or blocker prevents automatic correction, dependent-task unlock, plan completion, and `next_plan`
preparation. High or critical risk also clears the current approval immediately. A blocker can restore dispatch only
after an explicit resolution with evidence; if approval was cleared, the user must approve the matching plan version
again.

## Abnormal-stop escalation

An abnormal execution stop is a worker crash, unexpected termination, or explicit `abnormal_stop: true`; a normal
completion or ordinary `returned-to-planning` report is not an abnormal stop. On abnormal stop, execution must send a
formal `BLOCKER_REPORT` to the fixed planning conversation immediately. Every blocker must include `reason`, `impact`,
`recommended_solution`, and a Boolean `requires_user` value. A blocked report without those fields is rejected and
remains unacknowledged for correction.

Planning must answer with `PLANNING_BLOCKER_OPINION`. `decision: continue` is valid only when planning supplies a
`resolved` record for every open blocker without changing the approved plan; after the opinion is delivered, the
runtime re-dispatches the stopped task. If planning cannot resolve the blocker, it uses `decision: await-user`, sends
`USER_ACTION_REQUIRED` in the planning conversation, changes the plan to `awaiting-user-action`, and does not dispatch.
Silent state changes, silent retries, and treating a normal completion as an abnormal stop are forbidden.

Stage scheduling follows the same gate:

```text
serial stage 1 -> accepted fan-in -> parallel stage 2 (A + B) -> both accepted -> serial stage 3
```

Each stage declares `stage_id`, `order`, `kind`, `required_skills`, and optional `agent_selectors`; each task carries
the matching stage fields. Only the earliest unfinished stage is active. Parallel capacity is bounded by
`max_parallel`, and shared mutable paths are rejected before dispatch.

## Conversation policy

The dispatcher stores these identifiers on every series:

| Field | Continuity rule |
|---|---|
| `planning_session_id` | One planning-controller conversation for the series |
| `execution_session_id` | One execution-controller conversation for the series |
| `reviewer_session_id` | One independent review-controller conversation for the series |
| `worker_session_id` | New task-scoped worker conversation per dispatched task |
| `parallel_of` | Parent series used only by a parallel branch |

Calling `createPlan({ relation: "extension" })` with an existing series only adds a new immutable plan version; it
must return the existing controller IDs. Calling `createPlan({ relation: "parallel" })` requires a new series ID and
creates a new controller trio. When the branch reaches `completed`, `syncParallelResult` sends `PARALLEL_PLAN_SYNC`
to the parent planning session.

Connected controller IDs are locked when the series is created. Loading a pre-upgrade connected state backfills the
same lock, so `bind-host-session` cannot replace an already-real planning, execution, or review identity. Logical
FileQueue placeholders remain bindable once, before the first dispatch.

State transactions use a fail-closed ownership-lock directory acquired by atomic rename. A contender checks the
recorded process ID and never expires a lock merely because it looks old: a live long-running writer keeps ownership.
When the owner process is confirmed dead, the exact lock directory is atomically moved into a token-derived recovery
quarantine. That permanent quarantine prevents two simultaneous restarts from moving or deleting a newer live
owner's lock. Invalid or unverifiable owner metadata still fails closed; an operator must verify no writer is alive
before moving that one exact `.lock` directory.

## Adapters

`FileQueueAdapter` is the safe local handoff mode. It writes dispatch messages to `outbox/<session-id>/` and accepts
reports in `inbox/<session-id>/`. Its logical IDs support tests and manual handoff but do not authenticate an author
or prove an independent reviewer. The runtime therefore records but does not accept a review found only in a plain
file queue; a host transport must attest the observed source before that review can change task state. Automatic
dispatch treats `adapter-unavailable` as a transport blocker and waits.

Host session IDs that are not safe path segments, including canonical Codex subagent names such as
`/root/reviewer`, are deterministically encoded inside a reserved namespace for queue directory names. Safe raw IDs
that begin with that namespace are encoded too, preventing a raw name from colliding with an encoded name. The
original session ID remains unchanged inside messages and persisted state, so filesystem safety does not weaken
identity checks.

`CodexAppServerAdapter` requires an injected transport. It creates planning, execution, and review controller threads
for a new series, then calls `thread/start` only when a task worker
needs a session, and calls `turn/start` with a structured JSON message. The adapter must return the server's actual
thread ID. A transport error becomes a recorded dispatch failure and never a fabricated completion.

### Host transport contract

`AgencyAgentsAdapter` can be connected to the host Agent runtime through an injected `hostTransport`. The bridge is
deliberately small so a consumer can adapt the local `spawn_agent`/thread API without changing the PDGO state machine:

```js
const hostTransport = {
  async startWorker({ projectId, seriesId, taskId, task, stage, agent, instructions }) {
    // Start one task-scoped host worker and return its real runtime identifier.
    return { worker_session_id: "host-worker-id", platform_session_id: "host-worker-id" };
  },
  async send({ message, agent, instructions, audit }) {
    // Deliver the PLAN_DISPATCH to the worker created above.
    return { message_id: "host-message-id", runtime_agent_id: "host-worker-id" };
  },
  async receiveReports(sessionId) { return []; },
  async receiveReviews(sessionId) { return []; },
};
```

`startWorker` receives the resolved catalog entry and its integrity-checked role prompt. `send` receives the enriched
`PLAN_DISPATCH` plus the same prompt and audit record. Both methods must return a real host/runtime ID; an omitted ID
is a transport blocker and the dispatch is not considered started. `receiveReports` and `receiveReviews` are optional
polling methods; when absent, the wrapped adapter's queue or App Server polling methods are used. The role prompt is
advisory and the PDGO dispatch contract remains authoritative.

### External Agent adapter

`AgencyAgentsAdapter` wraps either runtime adapter and adds the external Agent catalog without changing the PDGO
state machine. The provider is configured in `profiles/external-agent-sources.json`; the imported index and prompt
cache are under `integrations/external-agents/<provider>/`. Refresh the catalog with:

```powershell
node scripts/import-external-agents.mjs --root . --provider <provider-id> --repo <owner/repository> --ref <ref> --download
```

Use the catalog by scenario, not by a display name alone. Search by query and optional division; results include the
evidence metadata and routing mode:

```powershell
node scripts/flowstate-dispatcher.mjs --action search-agents --query "backend API reliability" --division engineering
```

After selecting a result, put the exact `external_agent_id` on the task (or use an explicit query and division for
planning-time resolution). The planning controller still performs classification, risk and blocker review, and the
user approval check for the exact `plan_id + plan_version`. Only then does the execution controller create the
task-scoped worker and send a `PLAN_DISPATCH`.

An external dispatch must retain the normal trace and session identifiers plus non-empty acceptance criteria and
expected evidence. `AgencyAgentsAdapter` resolves the selected Agent, verifies the cached or fetched prompt against
the recorded source SHA when available, and attaches the following audit metadata to the dispatch:

- exact `external_agent_id` and provider/division;
- provider source commit, source ref, file SHA, source path, and source URL;
- the cached upstream role prompt as `external_agent.instructions`.

The role prompt is advisory. The PDGO dispatch fields remain authoritative: the external Agent cannot approve a
plan, expand `allowed_paths`, override `forbidden_actions`, clear a blocker, change acceptance criteria, commit, or
push remote state. A selector on any non-`PLAN_DISPATCH` message is rejected so external roles cannot be invoked
outside the governed execution path.

The external worker returns the same report contracts as a local worker: `EXECUTION_REPORT` for a normal return and
`BLOCKER_REPORT` for an abnormal stop or explicit blocker. The dispatcher records a normal report and sends a
`REVIEW_REQUEST` to the fixed reviewer; an accepted, source-verified review is the only event that
can unlock a dependent task. Prompt-cache misses, metadata failures, source integrity failures,
catalog lookup errors, or transport failures are recorded as dispatch failures. In file-queue mode the message remains
auditable in the queue, but automatic dispatch creates a transport blocker and pauses; an unavailable external Agent
is never reported as started or completed. A consuming profile may explicitly select a local PDGO Skill as a fallback,
but no fallback is inferred.

Pass `--external-agents false` to use the base file-queue adapter without external Agent resolution. This disables
selection; it does not disable approval, scope, evidence, report, or review gates.

## CLI

```powershell
node scripts/flowstate-dispatcher.mjs --action create-plan --input plan.json --root .flowstate --project demo
node scripts/flowstate-dispatcher.mjs --action bind-host-session --input reviewer-binding.json --root .flowstate --project demo
node scripts/flowstate-dispatcher.mjs --action approve --input approval.json --root .flowstate --project demo
node scripts/flowstate-dispatcher.mjs --action dispatch --input dispatch.json --root .flowstate --project demo
node scripts/flowstate-dispatcher.mjs --action bind-host-worker --input worker-binding.json --root .flowstate --project demo
node scripts/flowstate-dispatcher.mjs --action report --input report.json --root .flowstate --project demo
node scripts/flowstate-dispatcher.mjs --action review --input review.json --root .flowstate --project demo
```

The CLI uses the file queue and is intentionally explicit. The `review` input must include the host-observed
`observed_session_id`. The Codex-native Skill calls the built-in subagent tools itself, then binds their actual returned
IDs; the Node CLI never fabricates or launches a Codex subagent.

Execution-report schema 1.1 preserves `session_id` as the legacy execution-controller field and adds
`worker_session_id` for the task-scoped worker. A host-bound dispatch requires the latter to match the exact worker.
Early bridge reports that duplicated the worker in `session_id` remain readable; they are stored with an explicit
identity-format marker rather than silently changing the old field's meaning.

## Continuous runtime

The dispatcher already performs the next-task transition after a source-verified accepted review. FlowStateRuntime adds
the missing process boundary around that state machine:

1. Read queued `EXECUTION_REPORT`, `EXECUTION_STOPPED`, and `BLOCKER_REPORT` messages for each planning controller session.
2. Ingest each report; formal blockers are forwarded to the fixed planning conversation as `BLOCKER_REPORT`.
3. Read `REVIEW_DECISION` from each reviewer session and `PLANNING_BLOCKER_OPINION` from each planning session.
   A legacy review found in an execution-controller inbox is moved to processed storage, reported for requeue, and
   never accepted in place.
4. Record the transport-observed source; only the bound reviewer may accept or require revision.
5. For `continue`, deliver the planning opinion before re-dispatching the stopped task; for `await-user`, notify the user and remain paused.
6. For an in-scope `revision-required` decision, dispatch the correction task again. Stop after two completed
   correction rounds repeat the same issue without new evidence.
7. Resume every approved current plan whose dependencies and blocker conditions are satisfied.
8. Acknowledge successful queue messages by moving them to processed/<session-id>/.

The runtime is deliberately explicit rather than a hidden promise:

~~~powershell
node scripts/flowstate-dispatcher.mjs --action resume --root .flowstate --project demo
node scripts/flowstate-dispatcher.mjs --action watch --root .flowstate --project demo --interval-ms 1000
~~~

resume is a one-cycle restart hook. watch repeats the same cycle until interrupted; --max-cycles can bound it for
CI or a smoke test. Both modes preserve the user approval, exact plan-version, evidence, blocker, correction, and
review gates. An open blocker or new risk prevents correction, dependent-task unlock, plan completion, and
`next_plan` preparation until it has a resolution and evidence.

## Queue recovery and idempotency

PLAN_DISPATCH messages carry a stable idempotency_key derived from the dispatch ID. Re-sending the same dispatch
returns the existing queue file instead of creating another command. Reports and review decisions use their
report/review IDs as stable inbox names. A runtime acknowledges a message only after the corresponding state
transition succeeds; failed messages remain in inbox/ for inspection or retry.

The runtime may be started again after a process or machine restart. Persisted state determines whether a task is
already dispatched, report-returned, accepted, ready, blocked, or complete. It never treats a worker's self-reported
success as reviewer acceptance.

## No-project same-window mode

When a host has no repository or project profile, it may use an explicit unscoped project ID for read-only planning.
One visible Codex window cannot prove independent review. Acceptance remains unavailable until a concrete scope,
approval, and distinct bound reviewer exist.
