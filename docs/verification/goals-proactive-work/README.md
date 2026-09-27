> **Superseded-by:** [canonical beta integration dossier](../beta-integration/README.md). Historical evidence below is pinned to frozen source `838af27722a500e4e02ae980d71e7541e5575f54`; it does not qualify the integrated candidate.

# Goals and proactive work evidence dossier

> **Historical first-tranche evidence. Superseded-by:** [integration-preparation qualification](integration-preparation/README.md). Core accepted at `b9b46c41480f0859d44683346bd24d7ce9f2b7c9`; the original logs below remain preserved. Current overall status is READY_FOR_INTEGRATION; live activation is NOT_RUN.

**Design partner Goal OS: NOT READY.** The isolated orchestration service passes local
qualification; production persistence rollout and canonical runtime adapters remain
blocked by shared migration ownership / unmerged integrations. No merge or deployment
was performed.

## Baseline and ownership

- Branch: `codex/goals-proactive-work`
- Worktree: `/Users/jaywest/.codex/worktrees/goals-proactive-work/Myeve`
- Stable baseline: fetched `origin/main`, `d64f2f96003818b2f51341b54a2edd6f426a0dae`
- Local canonical `main`: `a7936898c77d157aa66c222b86aedce07e265e16`, dirty before work.
- Canonical dirt included README, Composio, computer-runtime instructions, executor
  inventory and untracked engineering/verification artifacts. All left untouched.
- Digital Worker: `be090db93b35c8edb9f38a3cac1344a2289c49bc`, dirty Factory/Gate B/C,
  routing/projection and schema-head work. Not used as a baseline; no edits there.
- Beta Product Experience and Universal Inbox initially based on `d64f2f9`; observed
  owner presentation and Inbox contracts independently under construction.
- Memory/learning: `be090db`, dirty memory store/consolidation work. Left untouched.
- Other inspected worktrees: knowledge-production (`47aa6ff`), Factory merge
  (`f6c6458`), common ledger (`f3a5de8`), projections (`55544fb`), qualification
  (`a00e8f4`), capsules (`a793689`, untracked verification), q37 (`96ae446`),
  chat mainline (`6ed3137`), thread owner conflict (`fc31671`), hosted routing
  (`cab819b`). No mutations outside this dedicated worktree and disposable fixtures.

Ownership is Goal-owned services, candidate persistence, product contracts and local
qualification. Work execution, Factory, writer custody, protected verification, Memory,
Inbox internals and final Beta UI remain with their workstreams. Governance inventory
changes add only the six new Goal source paths; no existing entry/check is changed.

## Results

See `qualification.log`, `typecheck.log`, `regression.log`, `build.log` and
`inbox-contract.log` alongside this file. The suite has 19 scenario groups including
real PostgreSQL transactions, independent durable canonical Work fixture storage,
concurrent workers and seven separate-process SIGKILL checkpoints.

Measured **within the local fixtures**:

| Invariant | Observed |
| --- | --- |
| Duplicate consequential Work | 0 |
| False Task completions | 0 |
| False Goal completions | 0 |
| Goal-derived authority grants | 0 |
| Cross-owner Goal/Task disclosure or continuation | 0 |
| Necessary owner decisions | 1 (plus initial Goal instruction) |
| Avoidable coordination prompts | 0 |

These are assertions/counts over fixtures, not production telemetry. The golden Work
producer is a durable local adapter; no Factory execution or authenticated real-provider
reply/file/decision receipt is claimed. Needs You snapshot storage is test-only.

Representative warm local measurements (50-task detail, bounded ten-Goal Today) are
recorded in the qualification log. They are single-run observations, not production
p95 targets or a load test. Brief pagination was specifically tested for microsecond
cursor replay, which initially exposed and then fixed duplicate-page entries.

## Reproduce

Use a disposable local PostgreSQL instance (default loopback port 55473, user
`myeve_goals`, database `postgres`) and the repository's locked dependencies:

```sh
npm ci --ignore-scripts
node --import tsx apps/eve/test/goal-work.integration.mjs
node --import tsx --test apps/eve/test/goal-types.test.mjs apps/eve/test/task-types.test.mjs
npm run typecheck --workspace=eve-agent
npm run build --workspace=eve-agent
```

The integration harness never reads `DATABASE_URL`, binds only loopback, creates a
random private schema, applies existing Goal migration 0003 plus the candidate
extension, and drops only that generated schema. `GOAL_TEST_PORT` can select another
local fixture port. It starts/kills only its own child workers. The cluster used for
this run was created under `/private/tmp/myeve-goals-postgres` and stopped afterward.

## Requirement coverage and remaining work

| Request sections | Qualified here | Boundary / remaining work |
| --- | --- | --- |
| 1–6, 17–19, 30–32 | Inventory, Goal/Task/Plan semantics, generations, exact Work and Result correlation | Existing public tools/UI still use legacy repository; candidate rollout required |
| 7–8, 12–13, 20–21, 37–43 | Event/dependency continuation, waiting, duplicates, file/reply/choice/schedule cases | Authenticated live provider adapters not merged |
| 9, 48 | Needs You projection, monotonic reconciliation and attention schema mapping | Canonical Inbox response delivery not wired |
| 10–11, 40 | Existing reminder reference port, schedule eligibility and authority refusal | Reminder/scheduler host integration not qualified |
| 14–16, 58 | Existing focus inventory, explicit dispatch priority/deadline and fair paging; meaningful progress | Unified UI focus scoring including dependency impact remains integration work |
| 22–23, 33–36 | Owner controls, plan history, bounded Result provenance and correction | Active execution cancellation remains Work-owned |
| 24–26, 73–74 | Multi-session golden/negative service journeys, one owner choice, no coordination prompt | Browser/conversational product journey not run |
| 27–29, 49–53, 63–65 | Today/Brief/detail contracts, bounded queries, activity and owner/operator separation | Product UI/notification integration remains with Beta team |
| 44–47, 59, 66 | No direct executor, Memory or learning implementation; no budget/access grants | Canonical Work/Relay/Memory adapters consumed after merge |
| 54–57 | Criteria-backed completion, reopen/history, archive, retained Work deletion fence | Automatic invalidation event wiring and full retention review pending |
| 60–62 | Bounded follow-up provenance/depth, task/continuation caps, 50-task fixture | Production capacity tuning deferred |
| 67–70 | Two-owner isolation, concurrent races, SIGKILL recovery, representative query timings | Live Work idempotency and production load qualification pending |
| 71–78 | Worktree/migration ownership inspection, docs, required checks, clean coherent commit | Numbered migration intentionally blocked; no merge/deploy |

## Integration dependencies

1. Shared migration ownership: reconcile Digital Worker 0041–0057 and promote candidate
   schema with an assigned number. Qualify upgrade from the integrated schema before
   any database application. `database-schema.ts` is untouched.
2. A production `GoalDatabase` interactive transaction adapter and authenticated
   existing Goal route/tool cutover. Candidate completion fences intentionally reject
   legacy narrative completion; cutover must be coordinated.
3. Canonical Work ensure/find/Result adapter, including terminal-state normalization,
   immutable request hashing, timeouts, protected evidence and admission at execution.
4. Universal Inbox snapshot/response delivery and server-verified source Signal
   adapters. Validate integration against the merged contract again.
5. Existing scheduler/reminder/event host hooks and durable fair-sweep cursor.
6. Beta UI contract consumption and browser golden journey. Existing UI cannot consume
   these projections yet, so no parallel UI/design system was invented.

Additional limitations: no automatic Result invalidation listener; plan callers must supply a stable command ID for replay deduplication; detail history is a bounded recent
window; old/current dependency representations need cutover reconciliation. This
candidate must not be described as a fully integrated no-babysitting product.
