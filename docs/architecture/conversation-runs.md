# Conversations and bounded Runs

Eve sessions preserve conversational history. Runs provide bounded execution authority. A session may have multiple sequential Runs; historical Actions and approvals always belong to their originating Run.

Migration 0034 retains all `task_run_sessions` rows and adds `is_current`. A partial unique index enforces at most one current association per session. Existing unique session bindings backfill as current. Historical lookups use durable Run IDs; execution/accounting lookups explicitly require `is_current`.

The canonical owner-chat initializer now executes as `owner_chat_run` in one database transaction. A session advisory lock covers both empty and existing bindings. Fresh initialization uses current Agent limits, independent counters, a fresh ID/deadline, and a lifecycle transition. Switching the current flag never alters the old Run. Ordinary new owner input can renew an existing expired/terminal owner-chat context; viewing a conversation and bare confirmations cannot. Sessions without any Run still initialize lazily when tools need authority. Tools and retries cannot renew expired authority themselves. Existing model-step accounting remains Run scoped.

Delegated work, goals, scheduled occurrences, role authority, and intentional exhausted budgets cannot renew through this owner-chat initializer. Their existing recovery policy remains authoritative. Tool call replays resolve their original Action/Run before consulting current authority. Neither history nor conversational confirmation grants execution authority.

Action Gateway validates the Run before preparation and again inside admission SQL, then preserves its execution/provider rechecks. Approval insertion and decisions recheck parent eligibility. Expired historical pending decisions are projected as non-actionable with an explicit reason; they are not rewritten. Federation preserves safe Run reasons in native denial reasons instead of attributing them to Relay.

## Query audit

- `action-context`: exact historical call first; current initializer for new calls.
- `task-runs`: current session resolution, model-step accounting, and budget checks; explicit task/session specialist and evidence queries remain bound to their original Run.
- `federation-tool`: approval resolution binds exact Action/Run/session and requires the association still current.
- `context-assembly`, `skill-manager`: current execution context; explicit Run references remain historical.
- `execution-authority`: occurrence-bound insertion retains the original Run; conflicting current sessions fail via the index.
- `control-center`: historical Run navigation remains intact; actionable counts exclude expired/terminal/historical authority.
- Owner-data export includes all session–Run links and current flags. Run and approval exports remain non-restorable authority under the existing contract. Thread deletion removes the thread view; it does not delete execution evidence. Existing Run foreign-key restrictions/cascades are unchanged.

## Deployment

Production requires separately authorized migration 0034 before deploying this source. Automatic main/qualification-branch deployments remain disabled. Apply locally only after isolated migration qualification and writer coordination, preserving model credentials in the existing engine process.

## Explicit owner task creation (migration 0078)

A session is conversation history; a task Run is bounded authority. A terminal or expired association remains current until a legitimate new owner message replaces it transactionally. This retains an unambiguous historical pointer without requiring a background cleanup job. Expiry alone never grants replacement authority.

The former `start_task` path inserted a second current association directly, bypassing `owner_chat_run`. Migration 0078 adds `start_owner_task` under the same session advisory lock. Fresh owner input first recovers an eligible expired/completed standalone Run. The tool may then replace an action-free live owner-chat context with a `task_` work contract. The previous context becomes cancelled with an explicit transition; its binding becomes historical. Model usage, budget ceilings and the earlier deadline constrain the new task. An existing Action, pending approval, active task, delegated/goal/role/scheduled Work or exhausted budget prevents this conversion.

`owner_run_recoverable` classifies completed standalone tasks and expired running/awaiting-approval standalone Runs as eligible only when their budgets are not exhausted and no delegation, goal, role, scheduled occurrence or external owner-channel authority applies. Failed, cancelled and paused workflows cannot silently restart. Recovery preserves prior Runs, Actions and decisions; no approval or writer claim is copied.

The authenticated root owner tool supplies its durable call ID outside the model input schema. Replays return the original task ID and state, even after completion and later rollover. A different concurrent task request is denied while that task remains current. The unique index remains intact. PostgreSQL locks and rollback protect retirement plus creation from concurrent requests and process death.

Qualification: `MYEVE_TASK_LIFECYCLE_TESTS=1 npm exec --workspace=eve-agent -- vitest run lib/owner-task-lifecycle.integration.test.ts`, using a disposable PostgreSQL 17 database on loopback port 55439. This exercises the real creator and partial unique constraint, including the pre-repair duplicate failure, concurrent messages/retries, historical evidence, expired/completed recovery, protected Work and backend termination mid-transition. No live Factory effects are permitted in this suite.
