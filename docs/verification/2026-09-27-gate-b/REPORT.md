# Gate B single-writer handoff — local PASS

Baseline: **`7bf276493eb2b3206a50eea0c4c9c262b7396014`**. Implementation branch: **`codex/digital-worker-integration`**. The candidate commit containing this dossier is the review target. Sole implementation ownership was explicitly confirmed by the user. No protected owner worktree, retained database, original checkpoint, producer branch, live service or main checkout was modified.

**Gate B = PASS for the requested local synthetic-Factory qualification.** Both Golden Journeys end in protected verification PASS and an immutable PARTIAL Result. **Live MyFactory = NOT READY / NOT_RUN.** A concrete live transport that proves exact-attempt remote quiescence and rejects delayed dispatch is not configured or qualified. No live execution follows this tranche. Independent code review is pending; “independent verification PASS” below refers to the existing protected candidate verifier, not reviewer approval or live product qualification. M1 live remains NOT QUALIFIED; Gate C remains PASS/CLOSED.

## Schema and ownership

The approved forward migration is [0056_factory_writer_handoff.sql](../../../apps/eve/migrations/0056_factory_writer_handoff.sql), registered in `database-schema.ts`.

SHA-256: **`dc4a908d6f3abd665824cb249459df850a92ff7c4346fded461a2061ba72b2bc`**.

The [immediate ownership check](0056-ownership-and-checksum.json) inspected all 11 registered worktrees and 368 local/origin refs before exclusive file creation. 0056 was unclaimed. Ownership is Gate B / canonical Digital Worker integration. The user-approved migration was frozen before qualification; **bytes changed after qualification = 0**. [Migration manifest](migration-manifest.json) confirms every 0001–0055 file remains byte-identical to the approved baseline. No new migration number was allocated after 0056.

No parallel tables or Work/Run/writer/verification architecture were introduced. The existing route Run gains monotonic writer generation, exact Factory request/dispatch binding, PREPARED/UNKNOWN/DISPATCHED/STOPPING/TERMINAL lifecycle, quiescence/fence evidence and immutable candidate/historical custody. Existing workspaces identify the producer/receipt, and existing verifier jobs identify the route Run. Normal native re-admission may rebind the current runtime/workspace only after old custody is sealed on its terminal historical Run. The forward definition of completion capacity retires only explicitly quiesced commitments; it does not erase spend or unknown provider exposure. Migration 0053 is untouched.

## Reuse, adaptations and trust boundary

- **Reuse:** `RouteAdmissionService`, the canonical Work lock and one-open-route-Run index, native session/common-ledger fencing, Gate C requests/receipts/admissions, candidate material validation, direct workspaces, protected Docker verifier leases/recovery, immutable native Result proofs and shared Work/Chat projection.
- **Adapt:** exact content-digest FactoryVersion admission; native session/workspace succession preserving history; verification against terminal Factory custody; Factory provenance in candidate/proof; historical candidates and blocked next steps in Current Truth. The original native agent-binding check remains at the final SQL evidence write and is regression-tested against concurrent revocation.
- **Add:** [FactoryWriterStore](../../../apps/eve/lib/engineering/factory-writer.ts), a trusted internal server coordinator using the same route Run, and the approved 0056 fields/constraints/functions. It is not exposed as an agent tool or a new public dispatch endpoint.

For one scoped Work, at most one nonterminal productive route Run exists, including across Work generations. Native fencing requires no inflight/unknown runtime, unresolved common-ledger call or verifier recovery. Factory acquisition is normal atomic admission with Work/version/generation, route Run/writer generation, Factory identity/version, request/WorkOrder/attempt, repository/base, allowed paths and deadline. A Gate C receipt creates no writer.

Dispatch claims commit UNKNOWN before I/O. Only the claim winner can call the transport; replay/process restart does not resend. Cancellation/timeout/takeover first marks STOPPING and requests stop. They never prove quiescence or free the writer slot. A trusted remote observation must bind the exact attempt, prove no productive process remains **and durably reject delayed/replayed dispatch**. Even NOT_DISPATCHED requires this terminal fence. The local producer uses a durable terminal tombstone; a delayed dispatch after native succession is tested and cannot start.

The database function is SECURITY DEFINER with PUBLIC execution revoked. An explicitly trusted server role must authenticate the owner and supply the principal; model/user-facing roles must never receive arbitrary handoff access. Both restricted application and worker role tests reject implicit execution, direct writer/custody/receipt updates and DDL. Trusted transport observations are not model claims, timeout assumptions or signed-result substitutes.

After Gate C admission and independent execution reconciliation, the Factory Run becomes terminal/fenced. Exact signed patch bytes are applied only as data in a bounded isolated temporary Git repository; regular UTF-8 files, paths, raw commit, tree and material digests are checked. Immutable Factory candidate custody retains producer, FactoryVersion, request, WorkOrder, attempt, writer generation and receipt. It survives restart and does not require a RUNNING native writer. Gate C evidence remains provenance; protected MyEve checks are authoritative verification.

On verification FAIL, a fresh normal native admission creates a new decision/Run/session after Work generation advancement. Its initial draft is the exact failed Factory candidate, with the original approved base/profile. Native repair goes through the controlled model wrapper and normal mutation/verification path. Earlier native and Factory workspace, candidates and evidence remain immutable historical custody. Late authenticated receipts cannot replace a newer writer's candidate. Human control is acquired only after proven Factory terminality.

## Actual local qualification

[Structured journey evidence](gate-b-validation.json) retains exact Factory bindings, candidates, terminal writer records, independent protected evidence, PARTIAL/FAILED proofs and the repair custody chain. [Execution log](gate-b-integration.log) records the assertions. The synthetic producer and controlled native model make no live provider calls; PostgreSQL, process kills and protected Docker checks are real.

| Gate | Result / evidence |
|---|---|
| Gate B focused units | **26 PASS** — candidate tampering, provenance and every quiescence identity/scope mismatch ([log](unit.log)) |
| Gate B PostgreSQL / Golden Journeys | **23 PASS** ([log](gate-b-integration.log), [JSON](gate-b-validation.json)) |
| Factory success | Native fenced → bounded Factory admission/dispatch → Gate C → remote terminal/fence → exact custody → protected PASS → PARTIAL |
| Factory failure/repair | Factory custody → protected FAIL → new normal native Run/session → exact-draft repair → protected PASS → PARTIAL |
| Migration canonical validation | **56 ordered migrations PASS** ([log](migrations.log)) |
| Migration qualification | Fresh chain; populated 0055→0056; injected transactional failure/rollback; exact rerun; restricted roles; authority expansion denied |
| Historical native checkpoint | Disposable restore only; all original columns/rows preserved across 0055→0056; no new Factory authority ([JSON](historical-preservation.json)) |
| MyEve / Q37 app regressions | **1,542 PASS, 40 existing gated skips; 177 files pass, 3 skipped** ([log](app-tests.log)) |
| Root contract regressions | **151 PASS, 0 skipped** ([log](root-tests.log)) |
| M1 controlled completion | **PASS** — actual budget/controller path, failure/repair/PARTIAL and Docker/process recovery ([log](native-completion.log), [telemetry](native-telemetry.json)) |
| M1 additional SQL regressions | **5 scripts PASS** — route admission, Work context, projection, protected verifier, legacy migration ([results](m1-sql-results.json)) |
| Gate C regressions | **47 PostgreSQL checks PASS**, all Gate C counters zero ([log](gate-c.log)) |
| Pinned producer `fcd8afd` | **72 PASS** from an isolated pinned archive, no producer owner changes ([log](producer.log)) |
| Typecheck / capability registry / skills | **PASS** ([log](typecheck.log)) |
| Governance | **PASS**, 650 classified sources, **UNKNOWN=0**; ten actually changed existing fingerprints plus one new enforced adapter; unrelated entries changed **0**, removals **0** ([audit](governance-changes.json)) |
| Webpack production build | **PASS**, TypeScript and 89 static pages complete ([log](webpack.log)) |
| README / Digital Worker docs | Updated with schema, lifecycle, custody, verification, recovery, evidence and actual live limitations |

The seven required real PostgreSQL race pairs are native vs Factory acquisition, Factory vs Factory acquisition, completion vs cancellation, completion vs human takeover, timeout vs native acquisition, late Factory custody vs native succession, and stale Factory attempt vs current generation. Additional checks cover duplicate dispatch claims, delayed transport completion after cancellation and native-agent revocation exactly at final evidence attachment.

Real SIGKILL checkpoints cover native fenced, Factory acquired, dispatch recorded, result received, Gate C admitted, Factory fenced, candidate custody and protected verification started. Restart derives state from PostgreSQL; no blind dispatch or automatic writer acquisition occurs. Expired verifier leases require resource reconciliation before retry, followed by real protected checks.

| Safety assertion | Observed violations |
|---|---:|
| Concurrent productive writers | 0 |
| Duplicate Factory dispatches | 0 |
| Stale writer mutations | 0 |
| Lost historical custody | 0 |
| Factory-granted authority | 0 |
| False Ready | 0 |

These counters summarize assertions in the bounded local tests, not live production telemetry. All assertions must pass before the structured evidence is written.

## Reproduction and limitations

Use a fresh task-owned PostgreSQL 17 instance on loopback port 55479 with the local `postgres`/`q37_admin` test roles, and the already-pinned protected Docker verification image. Do not connect these scripts to retained or live databases. Each integration script creates/drops its own database. Repository-root commands:

```sh
npm run db:migrations:check
GATE_B_EVIDENCE=/private/tmp/gate-b-validation.json node --import tsx apps/eve/test/factory-writer.integration.mjs
GATE_B_HISTORICAL_DUMP=/path/to/offline-checkpoint.dump GATE_B_HISTORY_EVIDENCE=/private/tmp/gate-b-history.json node --import tsx apps/eve/test/factory-writer-history.integration.mjs
NATIVE_COMPLETION_TELEMETRY=/private/tmp/gate-b-native-telemetry.json node --import tsx apps/eve/test/native-completion.integration.mjs
Q37_GATE_C_EVIDENCE=/private/tmp/gate-b-gatec node --import tsx apps/eve/test/factory-receipt.integration.mjs
node --import tsx --test apps/eve/test/*.test.mjs
npm run typecheck --workspace=eve-agent
```

From `apps/eve`, run `ADMISSION_CONTEXT_TEST_POSTGRES=1 ../../node_modules/.bin/vitest run --maxWorkers=1` and `NEXT_TELEMETRY_DISABLED=1 node ../../node_modules/next/dist/bin/next build --webpack`. The five M1 SQL script names are in `m1-sql-results.json`. Producer regression command in the isolated `fcd8afd` archive: `node --test apps/supervisor/test/*.test.mjs packages/hosted-routing/test/*.test.mjs packages/storage/test/*.test.mjs`.

Dependency installation used `npm ci --ignore-scripts` only in this integration worktree after its inherited dependency symlinks lacked required packages. No dependency manifest, owner checkout or shared dependency layout changed. The previously observed default Turbopack failure on cross-worktree dependency symlinks remains a documented environment/tooling limitation; that command was not requalified. Webpack is the qualified production build. It retains the existing noVNC top-level-await target warning. The 40 existing external/gated skips remain explicit; they are not counted as passing.

During test authoring, fixture-field selection, rejection-handler timing and an invalid agent-status transition were corrected. Final review restored the original native final-write agent guard and added a real PostgreSQL revocation assertion. Recorded command logs normalize terminal carriage returns and trailing whitespace only. The original preflight dossier and its recorded hashes are retained unchanged. Final artifacts contain passing runs of the resulting source; the migration bytes were never changed after qualification.

This tranche stops after local Gate B qualification and candidate commit. It adds no live adapter, publication, Ready authority, marketplace, scheduler, ER2, automatic Factory selection or live test. The independent reviewer should inspect the candidate SHA supplied with this commit, its [source manifest](source-manifest.json), migration freeze and the exact journey evidence before any separate live planning.
