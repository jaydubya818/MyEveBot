# Proactive Goal continuation

This is an isolated, locally qualified candidate; it has no installed production
scheduler, webhook, tool, route or default database. The candidate schema lives in
`apps/eve/test/fixtures/goal-work/schema.sql`, outside the migration runner.

## Durable flow

1. A trusted caller invokes `receive(signal)`, `receiveResult(...)`, or the existing
   scheduler invokes `dispatchGoalPage(service, cursor, now)` after integration.
2. Goal-owned state is updated under an owner-scoped Goal row lock and committed.
3. A bounded tick evaluates current Goal/Task control, generations, all dependencies,
   and existing Work. Dependency resolution alone grants no authority.
4. Eligible intent is committed before contacting Work. Its correlation key hashes
   `[ownerId, goalId, taskId, goalGeneration, taskGeneration]`.
5. `WorkPort.ensure` persistently returns the same Work for the same key and immutable
   payload. It performs current canonical admission/budget checks. No route is selected
   by the Goal layer. The request carries objective, criteria, owner/agent preference,
   required capabilities, target and prior decision references, not grants.
6. Work link and activity are committed. A response loss leaves a prepared intent;
   replay uses the same key. The Goal lock serializes productive admission and pause.
7. A canonical Result is read through `WorkPort.result`, correlated, retained and
   evaluated atomically with Task progress and Goal outcome evidence. The following
   tick admits eligible successors and evaluates Goal completion.

The Work adapter must be bounded because it runs while the Goal lock is held. The
production adapter must impose a timeout and retry transient database deadlocks. The
PostgreSQL fixture uses independent durable Work storage/connections; it is not a
simulation of Factory, protected verification, publication, or external side effects.

## Ambiguous and stale Work

Material edits and plan revisions increment generations. Delayed continuations and
signals carrying old generations are refused. Prepared or linked Work from an older
generation blocks a replacement. `reconcileWork` consumes canonical state and may
attach the previously created Work or record a canonical cancellation. A missing
remote row alone is **not** proof that an in-flight create failed. Unknown intent is
retained for canonical reconciliation, not discarded to make progress appear easy.

`denied` admission retains the same prepared key for a later recheck. Scheduling,
provider recovery and owner decisions still use that canonical admission boundary.
An owner task cancellation does not invoke execution cancellation or writer handoff.

## Dependencies and attention

Waiting categories: `WAITING FOR OWNER`, `WAITING FOR EXTERNAL`, `WAITING FOR SCHEDULE`,
`WAITING FOR WORK`, `WAITING FOR CAPABILITY`. Waiting is distinct from failure.

Signals bind exact owner, Goal/Task generations, dependency identity, kind, source
reference and evidence reference. File upload alone cannot satisfy an unrelated
requirement. `SignalPort.verify` must authenticate the provider and verify actual
semantics, not just a matching string. Duplicate source event IDs are owner-scoped;
changed payload under the same ID is rejected. A second event for an already resolved
dependency cannot cause another transition or consequential Work.

Owner choices come from canonical Inbox response receipts. The attention adapter maps
choices to `myeve.attention.v1` DECISION events with `NECESSARY_JUDGMENT`, not approvals.
Snapshots have monotonic durable Goal revisions. The consumer must apply newer snapshots
atomically and settle missing items, so a delayed snapshot cannot revive an old choice.
Goal/Task generation changes produce new attention identities. No Inbox engine is added.

## Scheduling and reminders

`dispatchGoalPage` evaluates at most ten Goals, each with at most fifty Tasks, returns
an explicit next cursor, and isolates a failing Goal so it cannot block later Goals.
Persist and advance the cursor, then start the next sweep when it reaches the end.
This prevents a high-priority Goal from permanently starving another Goal.

The existing reviewed reminder/routine scheduler remains the only scheduler. The Goal
adapter does not create another minute poller or bypass routine review. The Reminder
port links existing one-time or recurring reminder IDs to Goal/Task/Work with a stable
key. Recurrence, timezone, deduplication and review remain the reminder service's job.
Production schedule, condition-watch, provider webhook and reminder adapter wiring is
not qualified on this baseline. No credentials or external actions were used.

## Recovery qualification

The fixture kills separate Node worker processes with SIGKILL after Goal creation,
Task creation, committed eligibility, canonical Work creation, Result/Task completion,
Goal completion and dependency resolution. Fresh services recover from PostgreSQL,
without session history. Additional races include duplicate dependency events,
12 concurrent admissions, cancellation versus completion, Goal completion versus a
new Task, pause between eligibility and Work dispatch, and scheduler/manual replay.

The golden fixture needs the initial Goal instruction and one genuine owner choice.
There are zero coordination prompts such as “continue” or “what's next.” This is a
service-level measurement, not a claim that the live conversational product is ready.
