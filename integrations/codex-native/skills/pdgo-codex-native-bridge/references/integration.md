# Codex native bridge integration

## State and commands

Use `scripts/flowstate-dispatcher.mjs` as the narrow state interface. The main Agent runs commands itself; never instruct the user to do so.

Relevant actions:

- `create-plan`
- `bind-host-session`
- `approve`
- `dispatch`
- `bind-host-worker`
- `report`
- `review`
- `resume`

Every action reads one JSON input file. The approved pair is `plan_id + plan_version`; do not substitute “latest”.

The `review` action requires `observed_session_id`. This value comes from the host tool result, not from reviewer prose.
Plain FileQueue discovery cannot provide this attestation. A legacy review addressed to the execution controller must
be requeued to the bound reviewer; it is not silently accepted.

## Host binding order

1. Create the plan.
2. Bind the planning subagent's returned ID before approval:

```json
{
  "planSeriesId": "SERIES",
  "role": "planning",
  "sessionId": "REAL_PLANNING_AGENT_ID"
}
```

3. Spawn the independent reviewer with a bounded read-only brief.
4. Bind its returned ID with:

```json
{
  "planSeriesId": "SERIES",
  "role": "review",
  "sessionId": "REAL_REVIEW_AGENT_ID"
}
```

5. Approve and dispatch the plan.
6. Spawn the execution worker with the returned dispatch object.
7. Bind its returned ID with:

```json
{
  "planSeriesId": "SERIES",
  "planVersion": "v1",
  "taskId": "T01",
  "dispatchId": "DISPATCH_ID",
  "workerSessionId": "REAL_EXECUTION_AGENT_ID"
}
```

8. Reject an execution report whose `worker_session_id` differs from the bound worker. Schema 1.1 keeps
   `session_id` as the legacy execution-controller field; early bridge reports that duplicated the worker there remain
   readable, but new Codex-native reports must provide `worker_session_id`.
9. Reject a normal review whose observed source differs from the bound reviewer.
10. Blocker opinions remain planning-owned and accept only `continue` or `await-user`.

## Subagent briefs

Planning brief:

- include the user's goal, source-of-truth files, five execution-baseline fields, constraints, and required plan schema;
- forbid writes and execution;
- require explicit unknowns.

Execution brief:

- include the complete immutable dispatch;
- state allowed paths and forbidden actions;
- require changed paths, verification evidence, risks, blockers, and stop reason;
- forbid acceptance claims.

Review brief:

- include the approved baseline, execution report, exact candidate paths, and evidence;
- grant read-only access;
- require stable `issue_id`, `status`, `progress`, and evidence for every failed criterion;
- forbid editing and direction changes.

Use `followup_task` to send the candidate to the already-bound reviewer. Use `wait_agent` for bounded progress snapshots. Do not busy-wait or start a daemon.

## Recovery

On restart:

1. Read project state and PDGO state.
2. Verify the exact plan/version and bound host IDs.
3. Inspect the last event and task status.
4. Resume only the persisted current action.

If a previously bound Codex Agent is no longer reachable, record a transport blocker. Do not silently replace it because that would change the identity evidence.
