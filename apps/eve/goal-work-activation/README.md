# Goal OS persistence and service activation candidate

**READY_FOR_INTEGRATION package; canonical activation pending. No migration number.**
The independent qualification and exact pinned contracts are in
[the integration dossier](../../../docs/verification/goals-proactive-work/integration-preparation/README.md).
This directory is not discovered by the migration runner. Importing any Goal module
neither opens a connection nor applies schema, registers a route or enables execution.

## Database cutover

The integration owner must reconcile these files against the then-current canonical
migration head. Local tests extend existing `0003_goal_operating_system.sql`; they
are not an upgrade test against unmerged Digital Worker migrations. The existing
40-file migration manifest is unchanged. Do not run this package on production as-is.

1. Inventory existing Goal writers, roles, plans and task dependencies, including
   legacy completed rows without retained canonical evidence. Review the backfill
   counts and cut over legacy writers in the same release. Keep the candidate API
   unmounted until all ports and schema are qualified together.
2. Assign a migration number only in the canonical integration branch. In one
   transaction apply `schema.sql`, then `backfill.sql`, then `access.sql`, using a
   separate migration owner. Substitute the quoted integration-assigned runtime role
   for `__GOAL_RUNTIME_ROLE__`; provision it as NOSUPERUSER NOBYPASSRLS, not a table
   owner, with schema USAGE only. No runtime DDL or canonical execution-table grants.
3. Reconcile RLS policies for other legitimate legacy roles before cutover. Enabling
   RLS without policies for those roles denies their reads/writes; never compensate
   by making the Goal runtime a superuser or table owner. Verify connection pool
   role selection, transaction owner scoping, trigger function search path and
   grants in the deployment environment. These functions are security invoker.
4. Before committing, verify row counts, retained completion timestamps/events,
   generation constraints, composite foreign keys, uniqueness, indexes, and role
   isolation against representative owner data. Run the acceptance suite below on
   a disposable copy of the integrated schema and real adapter implementations.
5. Activate registration only after the same database and adapter versions pass.
   On failed migration, rollback the transaction. After release, disable registration
   and repair forward; do not drop retained Work/evidence/history as a rollback.

`schema.sql` adds Goal revisions/generations and confirmation policy, Task generations
and provenance, plus dependencies, immutable Work correlation, source signal receipts
and outcome evidence. Unique owner/Task/generation keys prevent duplicate intent;
composite owner/Goal/Task keys prevent invalid links. Triggers serialize material
edits and fence current Task/Goal completion. Indexes cover owner Goal scans, Goal
and reverse Task dependencies, due schedules, Work history and human interventions.

`backfill.sql` is replayable. Legacy completed Tasks without linked canonical Work
become verification-blocked; completed Goals without outcome evidence become paused.
Their completion timestamps and pre-cutover status are retained as historical events.
Legacy provenance stays explicit. The backfill never manufactures Results, infers
completion from narrative text or automatically dispatches old tasks.

`access.sql` grants scoped Goal state writes, append-only event/evidence/signal writes,
and dependency maintenance. Runtime cannot delete Work links/history or write schema
or canonical execution. Owner scope comes from authentication and is applied with
transaction-local `app.owner_id`; the adapter owns BEGIN/COMMIT/ROLLBACK and release,
with a 5-second lock timeout and 15-second statement timeout.

## Service registration contract

Canonical registration supplies these dependencies; there is deliberately no singleton
using ambient `DATABASE_URL` and no new public route in this branch.

| Dependency | Required binding |
| --- | --- |
| `goalDatabase(pool, principal.id)` | Existing qualified pool connected as dedicated restricted role; no client-supplied owner |
| `CanonicalGoalWorkAdapter(gateway, validators)` | Canonical create schema, v2 Work/Proof schemas and `proofLinkProblems`; durable exact-intent gateway described in the crosswalk |
| `GoalWorkService(owner, actor, db, work, signals, attention)` | Owner actor only for authenticated commands; agent actor for qualified plan/Result/event flows |
| `GoalWorkQueries(owner, db)` | Same authenticated owner; bounded projection reads |
| `createGoalApi({authenticate, service, queries, respond})` | `signedGoalAuthenticator` and canonical `Inbox.respond`; bind only after runtime readiness |
| `GoalInboxConsumer(service, responses)` | Authoritative response reader and registered action-to-Goal lookup; deliver through canonical Inbox acknowledgment/retry |
| `GoalEventAdapter(resolver, service)` | Existing authenticated provider receipt resolver and independent `SignalPort.verify` |
| `GoalScheduleAdapter(service, clock)` | Existing reviewed scheduler wake; trusted host clock; original schedule reference and generations |
| `dispatchGoalPage(service, afterGoalId, now)` | Existing bounded dispatcher/sweep, with the host persisting its fair cursor; no new timer |

If canonical adapters, role configuration or migrations are unavailable, do not mount
writes. The existing `unavailableWork` fails closed for Work admission. All gateways
must bound I/O: Work ensure runs while a Goal row lock is held. Creation records intent;
canonical routing, admission, protected verification and provider effects remain owned
by Work. Follow-up visibility does not authorize scheduler execution.

## Reusable integration acceptance

Run from repository root with locked dependencies and disposable loopback PostgreSQL
(default port 55473, role `myeve_goals`, database `postgres`):

```sh
node --import tsx apps/eve/test/goal-work.integration.mjs
node --import tsx apps/eve/test/goal-work-integration-prep.mjs
```

`goal-work.acceptance.mjs` exports `runGoalWorkAcceptance(h)`. The included
`fixtures/goal-work/integration-runtime.mjs` is the reference harness: it uses actual
pinned Work/Result schemas, actual pinned Inbox service/repository, Beta projection,
signed sessions, Postgres RLS, and controlled proof/event producers. Sibling source is
read from immutable Git objects and evaluated in memory; none is copied or modified.
The pinned objects must be present locally. It never reads `DATABASE_URL`.

For integration, replace harness ports with disposable integrated services. Its `call`,
`api`, `service`, `queries`, `inbox`, `consumer`, `events`, `schedule`, `work`, `db`
methods exercise public boundaries; `produce`, `registerEvent`, `crashCreation`,
`setBudget`, `restart` and `raw` are fixture controls. Fixture-only canonical tables
also expose immutable binding/receipt counts for assertions. Preserve these probes or
adapt them explicitly to the integrated test store; this is not a production test
runner. Rerun against the merged Work/Inbox schemas, not only these pins.

Coverage includes Goal→Task→Work→Result, next Task, Inbox delivery, schedule/event
continuation, reply/webhook/file/provider/capability sources, pause/cancel, stale and
duplicate delivery, changed Task/Goal/plan, restart, completion policy and reopen.
The original suite adds concurrent processes and seven SIGKILL recovery boundaries.
