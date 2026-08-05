# Runtime dispatch and series continuity

The runtime is an explicit state machine. It is not a background promise hidden inside a conversation.

## State flow

```text
create series/plan
  -> awaiting-user-approval
  -> approved
  -> ready task
  -> PLAN_DISPATCH to task worker
  -> EXECUTION_REPORT to fixed execution controller
  -> planning review
      accepted       -> unlock dependent task -> dispatch next task
      revision       -> new plan version and approval
      blocked        -> planning waits for blocker resolution
      failed         -> retry within profile limit or block
```

The planning controller receives every execution report and records the review decision. A worker cannot unlock a
dependent task by reporting success. A new high or critical risk pauses the plan and invalidates approval until the
user reviews the new risk.

## Conversation policy

The dispatcher stores these identifiers on every series:

| Field | Continuity rule |
|---|---|
| `planning_session_id` | One planning-controller conversation for the series |
| `execution_session_id` | One execution-controller conversation for the series |
| `worker_session_id` | New task-scoped worker conversation per dispatched task |
| `parallel_of` | Parent series used only by a parallel branch |

Calling `createPlan({ relation: "extension" })` with an existing series only adds a new immutable plan version; it
must return the existing controller IDs. Calling `createPlan({ relation: "parallel" })` requires a new series ID and
creates a new controller pair. When the branch reaches `completed`, `syncParallelResult` sends `PARALLEL_PLAN_SYNC`
to the parent planning session.

## Adapters

`FileQueueAdapter` is the safe local mode. It writes dispatch messages to `outbox/<session-id>/` and accepts reports
in `inbox/<session-id>/`. It is useful for manual handoff, CI, audit review, and environments where Codex App Server
is not reachable.

`CodexAppServerAdapter` requires an injected transport. It calls `thread/start` only when a new series or task worker
needs a session, and calls `turn/start` with a structured JSON message. The adapter must return the server's actual
thread ID. A transport error becomes a recorded dispatch failure and never a fabricated completion.

### External Agent adapter

`AgencyAgentsAdapter` wraps either runtime adapter and adds the external Agent catalog without changing the FlowState
state machine. The provider is configured in `profiles/external-agent-sources.json`; the imported index and prompt
cache are under `integrations/external-agents/<provider>/`. Refresh the catalog with:

```powershell
node scripts/import-external-agents.mjs --root . --provider agency-agents --repo msitarzewski/agency-agents --ref main --download
```

Use the catalog by scenario, not by a display name alone. Search by query and optional division:

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

The role prompt is advisory. The FlowState dispatch fields remain authoritative: the external Agent cannot approve a
plan, expand `allowed_paths`, override `forbidden_actions`, clear a blocker, change acceptance criteria, commit, or
push remote state. A selector on any non-`PLAN_DISPATCH` message is rejected so external roles cannot be invoked
outside the governed execution path.

The external worker returns the same `EXECUTION_REPORT` contract as a local worker. The execution controller records
the report and sends it to the fixed planning session for acceptance, revision, block, or retry; an accepted report is
the only event that can unlock a dependent task. Prompt-cache misses, source integrity failures, catalog lookup
errors, or transport failures are recorded as dispatch failures. In file-queue mode the message remains auditable in
the queue and the delivery status is `adapter-unavailable`; the dispatcher waits or retries within the profile limit.
A consuming profile may explicitly select a local FlowState Skill as a fallback, but no fallback is inferred and no
unavailable external Agent is reported as completed.

Pass `--external-agents false` to use the base file-queue adapter without external Agent resolution. This disables
selection; it does not disable approval, scope, evidence, report, or review gates.

## CLI

```powershell
node scripts/flowstate-dispatcher.mjs --action create-plan --input plan.json --root .flowstate --project demo
node scripts/flowstate-dispatcher.mjs --action approve --input approval.json --root .flowstate --project demo
node scripts/flowstate-dispatcher.mjs --action dispatch --input dispatch.json --root .flowstate --project demo
node scripts/flowstate-dispatcher.mjs --action report --input report.json --root .flowstate --project demo
node scripts/flowstate-dispatcher.mjs --action review --input review.json --root .flowstate --project demo
```

The CLI uses the file queue and is intentionally explicit. A project profile can wrap these calls with a real App
Server adapter after checking platform availability and user approval.
