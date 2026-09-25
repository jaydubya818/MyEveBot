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
