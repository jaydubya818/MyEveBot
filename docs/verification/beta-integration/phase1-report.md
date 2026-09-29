> Historical Phase 1 report. Current status is [the canonical dossier](README.md).

# Canonical beta integration candidate

**OVERALL: PARTIAL — local persisted-data qualification, not a live design-partner release.**

Branch: `codex/myeve-beta-integration`
Worktree: `/Users/jaywest/.codex/worktrees/myeve-beta-integration/Myeve`
Base: fetched `origin/main` at `d64f2f96003818b2f51341b54a2edd6f426a0dae`
Integration SHA: the commit containing this dossier (`git log -1 --format=%H -- docs/verification/beta-integration/README.md`). The final delivery report records its literal SHA; no self-referential commit hash is embedded here.

Supersedes the four feature dossiers for **integrated candidate status**. Their original reports, logs and artifacts remain historical evidence with Superseded-by markers. A source branch's READY_FOR_INTEGRATION does not mean this candidate is ready for production.

## Sources and reconciliation

| Frozen source | Exact SHA | Adopted |
| --- | --- | --- |
| Beta Product Experience | `105aeb75aeb8b01a3bcba09395f32dc1ac0c7c0d` | Owner shell, styles, preview, projections and UX conventions; live views adapted to persisted beta contracts |
| Total Recall + Learning | `b5b3179e8f7ec61d9a30eb7c24e8bce760bfdcdf` | Durable memory changes, Work Knowledge, provenance/correction, bounded retrieval, Sofie context contract, governed learning and minimum Work/Result type/store prerequisites |
| Universal Inbox | `cf199431588d7bc0e95dd24a7d06b63d3b3cd2bb` | Domain/API, PostgreSQL repository, owner/action binding, durable responses, feeds and Goal consumer |
| Goals + Proactive Work | `838af27722a500e4e02ae980d71e7541e5575f54` | Goal/Plan/Task state machine, dependencies, canonical Work/Result adapter, signals, projections, Inbox adapter and persistence proposal |

All four source worktrees were clean at entry and remained at the exact frozen SHA at final audit. No sibling worktree was edited. [Preflight](preflight.json), [final source audit](final-source-audit.json), [per-file adoption map](source-adoption.json), [migration hashes](migrations.json).

| Conflict / shared surface | Classification | Resolution |
| --- | --- | --- |
| Published main infrastructure, authentication, approval/action executor, Relay | KEEP CANONICAL | Retain published baseline; signed owner session and same-origin checks precede beta access. No approval bypass or provider activation. |
| Four qualified feature modules | ADOPT FEATURE | Keep domain contracts and tests; hashes identify exact imports. No wholesale branch merge. |
| Work/Knowledge/Result prerequisite code absent from origin/main | ADAPT | Select frozen stores/types, Knowledge linking, v2 contracts and routing metadata. Extract only principal validation from the larger engineering API. No Factory execution routes or supervisor imported. |
| Feature schema proposals | ADAPT | Allocate combined 0058 after the highest observed shared head 0057; retain baseline migrations byte-for-byte. Add forward hardening only after local application. |
| Work unknown/prepared-effect checks | KEEP CANONICAL | Preserve WorkStore control guard; import frozen execution-state table DDL as 0060 instead of removing the guard when adversarial cancellation exposed the missing table. No executor is enabled. |
| Completion versus changed Work / newer Result | ADAPT | 0059 and 0061 serialize verification and invalidate stale completion while retaining history. |
| Beta fixture projections | ADAPT | Live owner routes use `/api/beta/*` and real local PostgreSQL. Explicit `/beta-preview` remains a sample. Result provenance states LOCAL_FIXTURE. |
| Old feature dossiers and mocked live-UI journey evidence | SUPERSEDED | Preserve pinned reports; canonical browser evidence below uses authenticated persisted data. Historical intercepted-API specs are not claimed as current integrated E2E. |
| Conflicting Digital Worker deployment lineage | ADAPT, future reconciliation pending | This candidate preserves origin/main. It does not claim direct migration compatibility with the active Digital Worker branch. No applied deployment ledger was available or changed. |
| MyFactory/Q37 and Capsules | KEEP CANONICAL; import deferred | No active implementation import, merge, route, grant, spend or deployment. Final frozen candidates must be supplied explicitly. |
| Safety contract requiring owner choice | OWNER DECISION REQUIRED: none taken | Unsupported execution/source paths fail closed. No permissions were expanded to obtain a pass. |

## Migration lineage

The published baseline has 40 migrations ending at `0040_relay_message_delegations.sql`. The active Digital Worker candidate `39874790aad1280792cc8e1b7aa8a349c31ae54d` has a different lineage: its `0039_engineering_work.sql` / `0040_app_settings.sql` differ from published main's `0039_app_settings.sql` / `0040_relay_message_delegations.sql`, and it extends through 0057. Those differences cannot be treated as an already-applied common chain.

This candidate keeps all 0001–0040 published bytes unchanged, reserves 0041–0057 to the existing workstreams, then adds:

- **0058_beta_integration.sql**: combined minimum Work intent, immutable Result, Knowledge link, Recall/Learning, Goal and Inbox schema; conservative legacy backfill; restricted NOLOGIN Goal/Inbox roles; durable bindings, response snapshots, context receipts and Result provenance.
- **0059_beta_result_fencing.sql**: database serialization of Result-to-Task verification against Work changes; stale completion invalidation and retained history.
- **0060_beta_work_control_prerequisite.sql**: exact bytes of frozen Recall candidate's `0041_engineering_execution.sql`, retaining the existing Work control safety check. Tables only; no execution admission or dispatch.
- **0061_beta_result_supersession.sql**: a newly retained immutable Result invalidates prior completion; concurrent Result ingestion and supersession serialize on Work.

All numbers were unclaimed by sibling worktrees when allocated. The 0061 check is [retained](migration-0061-allocation.json); the initial all-worktree migration inventory is in preflight. Number gaps are allowed by the canonical migration runner. Combined chain application and no-op replay passed on the disposable local database. Previously applied local 0058/0059/0060 bytes were not rewritten during hardening. Restricted roles cannot cross owners, create/alter/drop schema, delete or truncate Inbox history, or mutate execution authority. Security-definer hardening functions have a fixed search path and PUBLIC execute revoked.

**Deployment limit:** do not apply this branch's chain to a database from the alternate Digital Worker lineage. Reconcile both ledgers and their checksums before any future merge/deployment; never rename or overwrite applied bytes. No production ledger was inspected, migration run, main merged, branch pushed or deployment attempted.

## Integrated behavior

`lib/beta-integration/runtime.ts` composes the unchanged feature services. Task→Work creation and its binding commit atomically under a correlation lock. Work is explicitly **AWAITING_ADMISSION**; an intent grants no execution, spend or approval authority. Goal and Inbox writes use separate restricted transaction roles. Inbox response delivery uses the retained owner/action hash and Goal/Task generations; a forged or stale signal cannot resume a new task generation.

Immutable Results must match the exact owner, Work/version/generation, criteria, objective, current revision and proof hash. The v2 proof validator and database fences guard Task/Goal completion. Cancellation/revision and newer Result arrival remove current completion projections while preserving evidence and events. No narrative PASS or partial/blocked result counts as completion.

Work memory retains source provenance, Current Truth, superseded history and correction. Bounded Work retrieval produces retained context receipts with zero authority grants. Governed learning stores Result-bound owner feedback, evaluates registered presentation behavior, and requires an explicit hash/revision-bound owner promotion. Promotion is not live model improvement. Cross-Work selection remains denied by default; the comparable-Work test uses an explicit trusted selection fixture.

Owner pages show persisted Today, Goals/Tasks, Work, Needs You, Results/Proof, feedback, Memory/learning and Daily Brief. Goal/Inbox/Brief pages use bounded cursors. Work/Result/Knowledge lists are capped at 100; deeper archival pagination remains a limitation. Work-only and repository learning scope are visible before action. Loading, empty, service failure, session loss and mutation confirmation have explicit states. Session loss prevents later parallel reads from restoring cleared private data.

## Qualification and evidence

All new local runs used PostgreSQL 17 on loopback port 55489 with a disposable `myeve_beta_qualification` database. No deployment DATABASE_URL or external provider credential was used. A local administrative harness installs schema/roles; runtime Goal/Inbox transactions switch to their restricted roles. A test-only Neon fetch shim exercises durable owner Memory against this local database during process recovery.

| Check | Result | Evidence / boundary |
| --- | --- | --- |
| Application tests | PASS | 150 files, 1,267 tests passed; 3 files / 40 existing skips. `regressions/application.log` |
| Root tests | PASS | 135 passed. `regressions/root.log` |
| Typecheck / capabilities / skills / governance | PASS | Both workspaces; 145 capability definitions, 123 authored tools; 638 classified sources, UNKNOWN=0. Routing retains 50/57 rank-one, 93 checks. `regressions/governance.log` |
| Migration validation | PASS | 44 ordered files; apply and no-op replay. `regressions/migrations.log`, `golden.json` |
| Production build | PASS | Both workspaces built; no deployment. `regressions/build.log` |
| Recall core / integration preparation | PASS | 23 checks in each retained PostgreSQL script; correction, isolation, races, feedback/evaluation/promotion/rollback and bounded fixture consumption. `regressions/recall-core.log`, `regressions/recall-integration.log` |
| Goal core | PASS | 19 scenarios and 7 process-kill boundaries; `regressions/goal-core.log` |
| Goal integration preparation | PASS | 11 pinned-contract fixture scenarios; `regressions/goal-preparation.log`. This separate fixture is not the integrated database golden journey. |
| Inbox PostgreSQL / retained adapters | PASS | 11 PostgreSQL checks, 16-way dedupe/response races, RLS, immutability, feeds, crosswalk and fixture/performance scripts. `regressions/inbox/` and logs |
| Cross-system golden journey | PASS LOCAL; PARTIAL LIVE | [golden.json](golden.json); real feature services/database, explicit LOCAL_FIXTURE Result producer, no live model/provider |
| Restart / recovery | PASS LOCAL | [recovery.json](recovery.json); eight actual SIGKILL/fresh-process replay checkpoints, including delivery after owner decision |
| Completion races / isolation | PASS | [adversarial.json](adversarial.json); eight Work-change races plus eight Result-supersession races, stale/foreign Result and forged owner signal denials |
| Authenticated browser | PASS LOCAL | Real login form, onboarding, Goal creation, owner decision, Result feedback, evaluation, promotion, correction and persisted Goal completion. [browser fixture](browser-fixture.json), [browser record](browser.json) |
| Desktop / 390px | PASS | Final persisted-data pages at 1440×1000 and 390×844. Goal/Work exact detail included. [Screenshots](../../../output/playwright/beta-integration) |
| Automated accessibility | PASS | 18 axe scans, WCAG 2 A/AA and 2.1 AA tags, zero violations and no horizontal overflow. [accessibility.json](accessibility.json). Not a formal certification. |
| Keyboard / request boundary | PASS | First Tab reaches skip link; Enter focuses main at both widths; cross-origin mutation rejected 403. [keyboard.json](keyboard.json) |
| Browser failure states | PASS | Explicit 503 alert; simulated 401 clears private state despite a late successful read; refresh restores real data. [browser-states.json](browser-states.json) |
| Live provider ingestion / model behavior | NOT_RUN / NOT_PROVEN | No external source host, provider admission, model run, spend or production acceptance was exercised. |

The Golden Journey counts **2 necessary judgments** (initial instruction and channel choice), **0 avoidable coordination**. Restart replay retains **4 necessary judgments**, **0 avoidable coordination**, **0 duplicate Work**. These are observed fixture-run counts, not a production reliability or no-babysitting claim. Prompt-recovery automation is not enabled.

Observed safety invariants in the executed suites: duplicate consequential Work **0**; false Task/Goal completions **0**; Memory/Goal authority grants **0**; learning authority expansions **0**; secret promotions **0**; cross-scope violations **0**; cross-owner disclosures **0**. Qualification output is never reported as real provider execution or production readiness (**FALSE READY: 0 claimed**).

## Change size and review

The candidate spans 337 files because it selectively imports four qualified feature implementations, their tests/schema proposals and historical evidence, plus the new composition, routes, UI and qualification dossier. It is not a broad refactor of published infrastructure. Unchanged baseline code and migrations remain intact; imported, adapted and superseded paths are recorded separately. Historical raw logs retain original whitespace/terminal bytes; staged whitespace checks exclude those pinned evidence directories. New code and the canonical dossier pass the whitespace check.

## Remaining integration gates

1. **Work admission / execution:** mount the qualified canonical admission and execution host after the correct frozen dependency is supplied. Current Work creation deliberately stops at intent. There is no beta execution endpoint or live Result producer.
2. **Live Sofie retrieval:** the qualified retrieval/context assembler and receipts are callable and tested, but no live Sofie model instruction consumer is mounted. Automatic task-time selection/consumption and demonstrated behavioral improvement remain unqualified. Later comparable Work reuse currently uses an explicit trusted selection fixture.
3. **Durable owner Memory production activation:** schema and restart behavior are qualified locally. The existing owner-memory adapter still uses its canonical deployment database path; this run did not activate it in production. The browser Memory page covers Work Knowledge and governed learning.
4. **Schedule/event/approval hosts:** retain their qualified adapters, but source-authenticated scheduling, external reply/file/provider receipts and execution approval continuation are not mounted by the beta composition. Non-owner signals fail closed. Needs You owner decisions and Goal continuation are integrated.
5. **Migration lineage:** reconcile the published-main and active Digital Worker ledgers before consuming this candidate into a deployment lineage. No claim of compatibility with an already-applied alternate ledger.
6. **Product completeness:** live owner Knowledge remains on its existing canonical API; no deployment credentials were connected. Work/Result archive pagination beyond the first 100 records and comprehensive interactive plan editing remain limited. MyFactory, live Relay and Capsules are explicitly pending.

## Requested final status map

| Field | Status |
| --- | --- |
| MEMORY ACTIVATION | LOCAL PASS; production activation pending |
| WORK RETRIEVAL | LOCAL contract/receipt PASS; live Sofie consumer pending |
| LEARNING | Persistence/lifecycle PASS; live improvement NOT_PROVEN |
| GOAL OS | Persisted Goal/Plan/Task/dependency PASS LOCAL |
| TASK→WORK | Exactly-once intent PASS; admission pending |
| RESULT→TASK | LOCAL_FIXTURE proof/currentness PASS |
| PROACTIVE CONTINUATION | Dependency/Result/owner-response PASS LOCAL; source hosts pending |
| UNIVERSAL INBOX | PostgreSQL persistence, owner isolation, correlation, dedupe and supersession PASS |
| NEEDS YOU | Persisted exact-action owner decisions PASS |
| WORK CONTINUATION | Goal→next Work intent PASS; executor continuation pending |
| TODAY / DAILY BRIEF | Persisted projections PASS LOCAL |
| BETA UX / DESKTOP / 390PX | PASS LOCAL; limitations above |
| ACCESSIBILITY | 18 zero-violation scans plus keyboard checks PASS |
| CROSS-SYSTEM GOLDEN JOURNEY | PASS LOCAL; live path PARTIAL |
| RESTART/RECOVERY | Eight integrated process-kill checkpoints PASS |
| AVOIDABLE COORDINATION DEBT / DUPLICATE WORK | 0 / 0 observed |
| FALSE COMPLETIONS / AUTHORITY EXPANSIONS / CROSS-OWNER DISCLOSURES | 0 / 0 / 0 observed |
| FALSE READY | 0 claims; this candidate is explicitly PARTIAL |
| FULL REGRESSION | Local suites/build/typecheck/governance PASS; environment skips and live exclusions disclosed |
| README/DOCS | Canonical dossier, source map, migration hashes and historical supersession updated |
| WORKTREE | Dedicated branch; clean committed candidate required at handoff |
| MYFACTORY INTEGRATION | PENDING |
| CAPSULE INTEGRATION | PENDING |
| OVERALL | PARTIAL |

## Reproduce without external credentials

From this worktree, install the lockfile with `npm ci --ignore-scripts`. Start a disposable PostgreSQL 17 cluster on loopback port 55489; do not point these qualification scripts at a deployment. Run:

```sh
node --import tsx apps/eve/test/beta-integration/qualification.mjs
node --import tsx apps/eve/test/beta-integration/adversarial.mjs
node --import tsx apps/eve/test/beta-integration/recovery.mjs
npm run test --workspace=eve-agent
npm test
npm run typecheck
npm run db:migrations:check
npm run build
```

For browser qualification, start the production build locally with `MYEVE_BETA_MODE=qualification`, `MYEVE_BETA_DATABASE_URL=postgresql://postgres@127.0.0.1:55489/myeve_beta_qualification`, and temporary local `MYEVE_OWNER_ID`, `MYEVE_ACCESS_PASSWORD`, `MYEVE_SESSION_SECRET`. Use `http://localhost:3099` for the signed login flow. The gate rejects production Vercel environments, non-loopback hosts, non-qualification database names, and never falls back to DATABASE_URL. The test-only Result producer is under `test/beta-integration`; it is not a product API.

The frozen feature browser interception specs remain source evidence. Current persisted-data browser qualification used the Playwright CLI against the actual local production build; scripts/commands and assertions are retained in the browser logs. Temporary browser sessions, cookies and credentials are excluded from the commit.
