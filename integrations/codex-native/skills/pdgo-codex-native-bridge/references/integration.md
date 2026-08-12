# Codex native bridge integration

Copy `resource_policy` unchanged from plan to dispatch: clean context; `user-approved-or-host-default` reasoning at
effort `medium`; planning 1/0, execution 2/1, and review 2/1 `max_agents/followup_tasks`; compact evidence;
`stop-and-report`; `host_enforced: false`; `savings_proven: false`. Validate report `new_risks` before any state or
message change. 181.9 万仅表示本批处理 Token 量，不是账单 Token，也不证明已经节省。

## State and commands

Resolve `<CodexHome>/runtime/bosscoding/runtime.json` and require descriptor schema-1.1. Verify `integration_id`, `runtime_root`, `manifest.path + manifest.sha256`, `dispatcher.path + dispatcher.sha256`, and mandatory `runtime_tree` with algorithm `sha256-tree-v1`. The SHA-256-verified manifest is the single source for `runtime_tree.paths`; it must cover the dispatcher, imported libraries, cold-start resolver, configured specialist index, metadata index, and prompt tree. Every path stays inside `runtime_root` and every hash matches.

BossCoding state actions use the installed resolver's `invoke` action, not a direct dispatcher call. That resolver-owned entry revalidates the descriptor, rejects a linked/non-canonical project, recomputes `<CodexHome>/state/bosscoding/projects/<name>-<hash16>`, and forbids caller-supplied interfaces, state roots, legacy cwd defaults, or external catalog/root overrides. It accepts only new `bosscoding-v2` plans; the direct legacy CLI refuses caller-supplied interface claims and current BossCoding v2 state. State and queue writers reject links and non-canonical paths inside the isolated state subtree. Revalidate again after the action; if local runtime drift is detected, stop future work and report the blocker. This reduces accidental TOCTOU but does not claim OS-level isolation from a malicious process running as the same user.

A missing, incomplete, or invalid descriptor is a blocker; never search the disk, fall back to the current working directory, or instruct the user to run commands.

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

If the plan enables the optional authorization envelope, approval must call the injected trusted host transport or
adapter's attestation boundary. Parent-Agent prose, caller JSON, and self-reported `verified` fields are ignored. The
dispatcher computes one stable JSON + SHA-256 digest over the immutable approved boundary and requires the same digest
on plan, approval, dispatch, execution report, and review decision. Missing, mismatched, expired, plan-version,
scope, or role drift fails closed. FileQueue cannot attest this policy. Reusing the envelope avoids another PDGO
approval inside the same immutable batch but does not suppress host or OS permission prompts.

The `review` action requires `observed_session_id`. This value comes from the host tool result, not from reviewer prose.
Plain FileQueue discovery cannot provide this attestation. A legacy review addressed to the execution controller must
be requeued to the bound reviewer; it is not silently accepted.

## Host binding order

1. Inspect the runtime descriptor and hashes without creating project state. Draft the exact baseline, `plan_id + plan_version`, roles, paths, tests, and resolved state root in memory.
2. Obtain one user approval covering state-root creation, exact plan persistence and approval, the declared planning/execution/review roles, implementation, and validation. Only then ensure the state root, call `create-plan` with the exact draft, and record the matching approval. No PDGO plan or state prerequisite may be written before this approval.
3. Start the approved planning subagent, let it validate or refine the approved plan, and bind its returned ID together with the main Agent's observation of the actual `spawn_agent` arguments:

```json
{
  "planSeriesId": "SERIES",
  "planVersion": "v1",
  "role": "planning",
  "sessionId": "REAL_PLANNING_AGENT_ID",
  "hostAgentType": "Multi-Agent Systems Architect",
  "selectionSource": "approved-role-selection:acy"
}
```

4. If planning changes the goal, scope, permissions, accepter, external actions, material risks, role assignments, or Persona modes, stop and create a higher plan version for reapproval. Otherwise spawn the independent reviewer with a bounded read-only brief.
5. Bind its returned ID with:

```json
{
  "planSeriesId": "SERIES",
  "planVersion": "v1",
  "role": "review",
  "sessionId": "REAL_REVIEW_AGENT_ID",
  "hostAgentType": "Code Reviewer",
  "selectionSource": "approved-role-selection:acy"
}
```

6. Dispatch only after the planning and review bindings match the current approved role assignments.
7. Spawn the execution worker with the returned dispatch object. Its `permission_mode` is exactly `read-only` or `approved-scope-write`; a read-only execution dispatch has no modification `allowed_paths`.
8. Bind its returned ID with the actual spawn arguments:

```json
{
  "planSeriesId": "SERIES",
  "planVersion": "v1",
  "taskId": "T01",
  "dispatchId": "DISPATCH_ID",
  "workerSessionId": "REAL_EXECUTION_AGENT_ID",
  "hostAgentType": "Senior Developer",
  "selectionSource": "approved-role-selection:acy"
}
```

9. Reject an execution report whose `worker_session_id` differs from the bound worker. Schema 1.1 keeps
   `session_id` as the legacy execution-controller field; early bridge reports that duplicated the worker there remain
   readable, but new Codex-native reports must provide `worker_session_id`.
10. Reject a normal review whose observed source differs from the bound reviewer.
11. Blocker opinions remain planning-owned and accept only `continue` or `await-user`.

`hostAgentType` is recorded by the main Agent from the actual `spawn_agent.agent_type` argument. `selectionSource` is the approved role-selection provenance from the plan; it is not a `spawn_agent` argument. Neither is a cryptographic or host-independent proof. Never copy either from child prose. Every new BossCoding plan uses `role_contract.version: bosscoding-v2` and complete role assignments; only explicitly migrated `legacy-v1` plans retain identity-only compatibility. Missing or mismatched bindings fail closed, and a bound session's `host_agent_type` is immutable.

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
- declare the read-only governance boundary and use the actual read-only constraint available from current Codex and project permissions;
- require stable `issue_id`, `status`, `progress`, and evidence for every failed criterion;
- forbid editing and direction changes.

## Specialist and Persona inputs

- `acy` may propose `role_assignments`, but cannot approve them or start a subagent.
- A Codex `host_agent_type` is not a PDGO `external_agent_id`. Preserve the selected namespace and reject ambiguous conversion.
- Pass only execution-applicable `method_lenses` in `PLAN_DISPATCH`. Preserve optional `purpose` and `evidence_cutoff`. Lens is the default; Voice and Rehearsal require explicit opt-in.
- A method lens is advisory. It cannot apply to the review controller or grant identity, permission, fact, or acceptance authority.

User invocation example: `秘书，用 acy 选合适专家完成这项任务，并用 $munger 的 Lens 检查可避免的失败。` This selects a real functional role and a separate advisory lens in one approval batch. `$nuwa-skill` is used only to create, update, or audit a Persona Skill; ordinary execution names the already-installed Persona Skill directly.

Use `followup_task` to send the candidate to the already-bound reviewer. Use `wait_agent` for bounded progress snapshots. Do not busy-wait or start a daemon.

## Recovery

On restart:

1. Read project state and PDGO state.
2. Verify the exact plan/version, bound host IDs, and immutable `host_session_identities`.
3. Inspect the last event and task status.
4. Resume only the persisted current action.

If a previously bound Codex Agent is no longer reachable, or its recorded type no longer matches the approved role, record a transport blocker. Do not overwrite or silently replace the old identity; start a new session or plan series under the approved contract.
