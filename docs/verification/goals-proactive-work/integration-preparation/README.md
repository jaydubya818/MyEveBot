# Goal OS integration-preparation qualification

**Overall: READY_FOR_INTEGRATION. Live design-partner Goal OS: NOT_RUN.**

Supersedes the integration-preparation gaps and readiness wording in the
[first-tranche dossier](../README.md) and [status](../status.md), accepted at
`b9b46c41480f0859d44683346bd24d7ce9f2b7c9`. Its original logs remain unchanged as
historical evidence. Stable baseline: `d64f2f96003818b2f51341b54a2edd6f426a0dae`.
Branch: `codex/goals-proactive-work`. This tranche is committed on that branch;
`git log -1 --format=%H -- docs/verification/goals-proactive-work/integration-preparation`
resolves its commit without a self-referential SHA embedded in the commit.

## Required status

- GOAL OS CORE: LOCALLY QUALIFIED
- PROACTIVE CONTINUATION CORE: LOCALLY QUALIFIED
- CANONICAL WORK/RESULT: INTEGRATION PENDING
- UNIVERSAL INBOX: INTEGRATION PENDING
- SCHEDULER/EVENT SOURCES: INTEGRATION PENDING
- LIVE DESIGN-PARTNER GOAL OS: NOT_RUN

PASS below means local contract/fixture qualification, not live activation.

| Requested field | Result |
| --- | --- |
| Goal OS core | PASS |
| Work adapter | PASS |
| Result adapter | PASS |
| Work/Result Golden Journey | PASS |
| Inbox/Needs You contract | PASS |
| Beta UX crosswalk | PASS |
| Today composition | PASS |
| Daily Brief composition | PASS |
| Scheduler adapter | PASS — callable contract; host integration pending |
| Scheduled continuation | PASS — trusted-clock/dependency/replay fixtures |
| Event adapter | PASS — authenticated resolver contract |
| Event continuation | PASS — exact receipt/generation/replay fixtures |
| Authenticated API | PASS — signed-session Request/Response boundary, unmounted |
| Browser fixture journey | PARTIAL — API/projection journey qualified; Beta browser integration pending |
| Plan evolution | PASS |
| Goal correction / reopen | PASS |
| Goal completion evidence | PASS |
| Long-running Goal | PASS — three sessions without context reconstruction |
| Duplicate Work | 0 |
| False Task completion | 0 |
| False Goal completion | 0 |
| Goal-derived authority | 0 |
| Avoidable coordination debt | 0 |
| Necessary human interventions in golden journey | 2 — instruction and one choice |
| Persistence activation | READY_FOR_INTEGRATION package; shared activation pending |
| README | PASS |
| Overall | READY_FOR_INTEGRATION |

## Evidence

`acceptance.log` records **11 integration scenario groups**, using the actual immutable
canonical schemas, Inbox service with durable SQLite fixture, Beta `projectWork`, signed
sessions and restricted PostgreSQL role. `qualification.json` records counters and
scenario names. `sources.json` records inspected Git object paths and byte hashes.
Fixtures create 25 canonical Work rows across positive and negative cases; the golden
journey creates exactly three. Work producers are controlled fixtures; no external
provider effects, real protected verification or live authority claims are inferred.

`core-recovery.log` records **19 core scenario groups**, including concurrent callers
and seven separate-process SIGKILL checkpoints. `regression.log`: **6 existing Goal/Task
contract tests**. `typecheck.log`: TypeScript, capability/skill checks and executor audit
(593 classified sources, UNKNOWN=0). `build.log`: Next production build.
`migrations.log`: **40 existing ordered migrations**, no new number.

`today.json` contains active Goals, ongoing Work, next eligible Tasks, waiting, a
canonical Needs You choice and recent current completion. Historical legacy completion
remains in audit but is excluded from current completed/eligible UI state. `brief.json`
contains all seven requested change/action categories plus completed Work links.
`interventions.json`, `memory.json`, `learning.json` retain the coordination counts and
advisory/evidence-only integration examples. All data is synthetic fixture data.

The long-running flow is: owner Goal → automatic plan → Task A Work/Result → session
restart → matching partner reply → Task B Work/Result → actual Inbox decision retained
and delivered → Task C Work → restart → Result → evidence-backed Goal completion.
Owner action acceptance and actual Work continuation are separately asserted.

Additional negative cases include narrative PASS, PARTIAL with PASS evidence, FAILED,
BLOCKED, CANCELLED, SUPERSEDED, integrity failure, missing evidence, old Work revision,
superseded Task generation, Goal correction, old plan, changed idempotent payload,
wrong owner/event, duplicated schedule/event, paused Goal, cancelled Task, stale Inbox
choice, stale owner confirmation, and unresolved mandatory work. Read-only follow-up
items never become owner decisions. MYFACTORY hints cannot enlarge canonical routes.

## Integration handoff

[Exact crosswalk](../../../goal-work-integration-crosswalk.md) covers canonical fields,
Result semantics, actual Inbox response/settlement, Beta shapes and fetch paths, API
requests/statuses, scheduler/events, Memory/learning and likely merge conflicts.
[Activation package](../../../../apps/eve/goal-work-activation/README.md) contains
unnumbered schema, constraints/indexes, idempotent backfill, role policies, registration
requirements and reusable acceptance harness instructions.

The new API is not mounted; legacy UI/tools still use their current implementations.
No shared migration number, schema head, execution gate or scheduler release changed.
The baseline routine release remains disabled. Actual Beta browser integration is
unavailable until its owner reconciles Goal Tasks/canonical Inbox with legacy TaskRun/
approval shapes. API/projection boundary qualification is the requested fallback.
Memory retrieval and governed learning are contracts only; no persistence or learning
implementation is duplicated. Automatic evidence invalidation still needs its owned
subscription; explicit owner reopen is qualified.

Before live activation, the integration branch must reconcile the current shared
schema, install the production canonical gateway and source receipt adapters, bind
Inbox delivery and scheduler/event hosts, consume the additive Beta projections, then
rerun acceptance against the integrated implementations and the real authenticated UI.
These are owned integration dependencies, not failures of the local contract suite.
No branch merge, push, deployment or live database change was performed.

## Reproduction

Use the locked repository dependencies (`npm ci --ignore-scripts`) and a disposable
local PostgreSQL instance with role `myeve_goals`, database `postgres`, loopback port
55473 (or `GOAL_TEST_PORT`). This fixture role must be able to create and remove its
random test schema and NOSUPERUSER NOBYPASSRLS runtime role; never use production.

```sh
GOAL_EVIDENCE_DIR=/tmp/goal-evidence node --import tsx apps/eve/test/goal-work-integration-prep.mjs
node --import tsx apps/eve/test/goal-work.integration.mjs
node --import tsx --test apps/eve/test/goal-types.test.mjs apps/eve/test/task-types.test.mjs
npm run typecheck --workspace=eve-agent
npm run build --workspace=eve-agent
npm run db:migrations:check --workspace=eve-agent
```

The test harness reads no `DATABASE_URL`, uses pinned Git objects rather than mutable
sibling files, and removes only its own generated schema/role/Inbox file. The disposable
cluster for this run is `/private/tmp/myeve-goals-postgres`; it is stopped after checks.
Timing observations in the core log are local warm measurements, not a load-test or
production latency promise. Reusable harness ports are documented in the activation
package; proof production and raw fixture SQL must never target production.
