# Gate B writer-contract inspection — schema required, stopped

Baseline: **`7bf276493eb2b3206a50eea0c4c9c262b7396014`**, branch `codex/digital-worker-integration`. All implementation inspection uses this commit. Other worktrees/refs were inspected only for ownership, not used as implementation inputs.

**Gate B = PARTIAL (inspection complete; implementation and qualification not started). SCHEMA CHANGE = REQUIRED — STOPPED. Live MyFactory = NOT READY / NOT_RUN.** No migration, schema/registration/inventory change, runtime change, provider action, database mutation or new commit was made. The current changes are documentation only.

The user's §17 requires: **“If an additive schema change is genuinely required: STOP BEFORE CREATING THE MIGRATION.”** This is that boundary. Approval is needed for the proposed forward migration and the bounded adaptations below, not for another writer architecture.

## Canonical contract: REUSE / ADAPT / ADD

| Surface | Existing contract and evidence | Decision |
|---|---|---|
| Writer identity | `engineering_route_runs.id`, route/provider, decision, Work version/generation; native identity further bound to `engineering_native_runtime.route_run_id/session_id` | REUSE the route Run as authority identity; no parallel lease table |
| Exclusivity | `engineering_route_runs_one_open_writer` permits only one nonterminal Run per scoped Work, across generations ([0043](../../../apps/eve/migrations/0043_engineering_route_admission.sql)) | REUSE unchanged; UNKNOWN/BLOCKED must keep occupying it |
| Acquisition | `RouteAdmissionService.admit` locks current Work, rejects an open route Run/legacy execution and inserts admission plus Run and native session atomically ([source](../../../apps/eve/lib/engineering/route-admission.ts)) | REUSE lock order and guards; ADAPT for bounded Factory binding and terminal native-session succession |
| Work generation / revocation | `WorkStore.change` increments version and generation; native effects check current generation, admitted Run and session ([store](../../../apps/eve/lib/engineering/store.ts), [native authority](../../../apps/eve/lib/engineering/native-routing.ts)) | REUSE Work fencing; ADD explicit writer-fence progression tied to the same Run model |
| Session custody | Native runtime has one row per Work; session and Run must match, inflight/unknown or unresolved common-ledger calls block execution ([0050](../../../apps/eve/migrations/0050_engineering_native_runtime.sql), [budget](../../../apps/eve/lib/engineering/native-model-budget.ts)) | REUSE; never clear unknown exposure or overwrite unresolved custody |
| Quiescence / release | No general native→remote quiesce/release transition exists. Native draft SQL checks Run state; existing generation invalidation alone cannot prove a remote process stopped | ADAPT productive SQL to serialize with the Work/Run handoff; ADD durable stop/terminal/quiescence evidence before release |
| Human takeover | Current `takeover` switches Work control to human and advances generation; the change guard checks legacy unresolved effects, not Factory terminality ([types](../../../apps/eve/lib/engineering/types.ts), WorkStore) | ADAPT to request/fence/stop/reconcile first; human authority remains blocked while remote status is unknown |
| Recovery | Common-ledger unresolved calls survive restart. Verifier uses queued/running/recovery-required states and resource inspection ([0052](../../../apps/eve/migrations/0052_work_model_ledger.sql), [verifier](../../../apps/eve/lib/engineering/direct-verification-driver.ts)) | REUSE conservative recovery; ADD durable Factory dispatch/stop state with no blind retry or automatic acquisition |
| Candidate custody | Native workspace is one mutable current row per Work, tied to native decision/Run; candidate history lives in its JSON. Factory receipt tables hold authenticated provenance only | REUSE candidate validation and Gate C; ADD an immutable Factory custody binding independent of productive writer authority |
| Verification / Result | Verifier seeding and `verifyRequested` require a current RUNNING DEEP_AGENT writer; results read native workspace/proof ([direct development](../../../apps/eve/lib/engineering/direct-development.ts), [native results](../../../apps/eve/lib/engineering/native-results.ts)) | ADAPT the existing verifier to accept terminal-writer Factory custody, keeping exact candidate and server-owned verification claims; no fake native admission |

## Why the current schema is insufficient

1. **A route status is not remote execution custody.** The existing route Run holds provider identity, status and Work generation, but no distinct writer fence, immutable Factory request binding, durable dispatch claim, stop request or terminal/quiescence observation. `UNKNOWN` can block acquisition, but cannot alone distinguish never dispatched, possibly dispatched, stop requested and positively stopped. Those distinctions must survive process loss and be constrained under the existing Work lock before terminalizing the Run.
2. **Gate C cannot be repurposed as the authority ledger.** 0054's `current/cancelled` flags and ADMITTED receipt represent receipt eligibility/provenance, not remote stop confirmation. 0055 explicitly adds no writer, budget or candidate authority. Putting mutable authority into either signed/qualified receipt path would undermine their qualified separation. Gate C PASS is not release evidence.
3. **Native custody is intentionally not a handoff archive.** `engineering_native_runtime` and `engineering_direct_workspaces` each have a per-Work primary key. Current normal admission refuses an existing native runtime row, including a historical one. Deleting/resetting that row or replacing its workspace to force a Factory→native repair would lose or misbind custody; an explicit proven-terminal succession path is needed. The routing decision also has one row per Work version, and one Run per decision. A new admission must keep an independent immutable decision/Run and preserve those constraints, not rewrite the old admission.
4. **The existing verifier requires the writer that Gate B must already have released.** `DirectDevelopmentStore.verifyRequested` explicitly requires the matching RUNNING native Run; verification jobs have a foreign key to the native workspace. A Factory candidate therefore needs durable custody/provenance that can support verification without manufacturing native writer authority. A free-form JSON field in an admission or old draft could physically hold data, but does not provide the required receipt/Run/fence referential constraints or preserve historical candidate identity through a new native repair.

These are authority/persistence gaps, not a recommendation to redesign the native model or simply rename existing statuses. An application-only JSON workaround would hide a second authority state machine in records qualified for another purpose.

## Minimum proposed forward schema change (not created)

Proposed identity: **0056**, subject to a fresh ownership check at approval/creation time. It is **not reserved**. Keep every existing migration file, especially 0051–0055, byte-identical.

- **Extend existing route-run custody.** Add an explicit monotonic `writer_generation`/fence value; a Factory request FK with immutable bounded authority data (Factory ID/version, request/attempt, repository, approved base, candidate path scope, deadline); durable dispatch state keyed by that exact request; stop-request state/reason; and terminal/quiescence evidence with its observation identity and timestamp. Use existing `UNKNOWN`/`BLOCKED` nonterminal states for unresolved/stopping custody. No second writer/lease table, scheduler, or independent budget.
- **Constrain transitions under the existing Work lock.** Allocate the next writer fence atomically; require Work/Run/fence agreement for every productive operation; make dispatch identity immutable/unique; reject terminal release until bound quiescence evidence exists; keep UNKNOWN and requested cancellation occupying the existing one-open-writer index. Timeout alone, a sent cancellation, and Gate C PASS never satisfy this guard. Quiescence validation must be trusted backend logic, never a user-supplied boolean. Remote producer dispatch/reconciliation must honor the same exact attempt identity; this has not yet been qualified.
- **Add immutable Factory candidate custody, not another writer.** Retain scoped Work/version/generation, originating route Run/writer generation, Gate C request+receipt foreign keys, FactoryVersion/WorkOrder/attempt and exact candidate/base/tree/artifact digests. Enforce same-request receipt identity and one exact custody record per accepted attempt; prohibit provenance mutation. Establish current custody only after that Run is fenced/quiescent and no newer writer supersedes it. Old valid receipts remain historical.
- **Extend the existing verification-job target.** Permit a job to bind either the original native workspace candidate or the immutable Factory custody record, with an exclusive target constraint. Keep current verifier lease/recovery behavior and exact candidate checks. A Factory target must not require a productive native Run. Retain Factory provenance separately from authoritative MyEve protected verification.

Native-session re-admission and Work control require bounded application/SQL adaptations alongside this schema. A new normal native admission must use a fresh decision/Run/session after proven quiescence and a fresh Work revision/generation where required by the existing one-decision-per-version constraint. Preserve old admissions, candidates, ledger calls, spend and completion obligations; no blanket reset or automatic refund. Existing completion capacity is computed by 0053 SQL from admitted stages and candidates: any approved retirement of an unfinished native commitment must be explicit, quiescence-backed, and preserve unresolved exposure through a new forward definition, never an edit to 0053 or an invented cancellation event. Exact DDL, backfill and restricted-role guards must be reviewed and qualified in the implementation tranche; no live backfill is authorized here.

## Required behavior after approval

Native→Factory: prevent new productive native operations, serialize with pending mutations, fence, prove quiescence, then acquire the sole Factory Run and bind the request before dispatch. Holding a native session or having no current provider call is not by itself complete mutation quiescence.

Factory return: Gate C authenticates the result and bytes; separate execution reconciliation proves terminality. Fence/release Factory, establish immutable custody, then use the existing protected verifier against that exact candidate. Successful local outcome is PARTIAL, never Ready.

UNKNOWN/timeout: retain the nonterminal writer slot; no blind redispatch, native reacquisition or human productive access. Cancellation and takeover request stop but do not imply it completed. Human authority follows confirmed quiescence only. Late results may authenticate but cannot supersede a newer writer/candidate.

Factory failure retains attempt/evidence and blocks until remote reconciliation establishes terminality; it grants no native authority. A Factory candidate failing protected verification may seed a **new normal native admission** after Factory is terminal, with ordinary budget/policy/owner checks. It never transfers Factory authority to Sofie.

## Migration manifest and ownership

Origin was fetched for ownership inspection; the implementation baseline was not advanced. [Ownership snapshot](migration-ownership.json) covers **12 registered worktrees and 258 local/origin refs**. No inspected working tree or ref claims a migration above 0055. The snapshot includes the dirty status of each independently owned worktree; nothing there was modified, reset, stashed, or imported.

[All 55 migration hashes](migration-manifest.json) match the approved baseline. Latest registration is `0055_engineering_factory_results.sql`. Canonical `node scripts/migrate-database.ts --check` passed **55 ordered migrations**. No retained database was connected.

| Migration | SHA-256 / disposition |
|---|---|
| 0053 native completion | `1f3fd2316758e547608fb4e23480105d1ce3a1dcb93a04a4c5be69841f2c5a53` — unchanged |
| 0054 Gate C | `722f6b24052f53cda67da755011438ceacf65aa0dfc0579d5afde998f64a6634` — unchanged; Gate C receipt admission ownership retained |
| 0055 legacy Factory results | `a431db228036cc6fd07128db861c99ee4add2de6afe43f1ec5a4c32b83df2141` — unchanged |
| Proposed 0056 Gate B | Unclaimed at inspection, not reserved, not created |

## Qualification status at the stop boundary

| Requested gate | Result |
|---|---|
| Canonical M1 writer contract reuse | Identified/proposed; runtime reuse qualification NOT_RUN |
| Schema change | REQUIRED — STOPPED before creation |
| Single-writer invariant; native→Factory; Factory scope/return/custody | NOT_RUN — implementation blocked on schema approval |
| Independent verification; failure/UNKNOWN/cancellation/takeover/late results/native repair | NOT_RUN |
| Process recovery / PostgreSQL concurrency | NOT_RUN |
| Concurrent writers / stale mutations / duplicate dispatches / lost candidates | NOT_MEASURED — no Gate B execution; zero must not be claimed |
| Factory-granted authority / false Ready | Gate B NOT_MEASURED; prior baseline evidence remains zero |
| M1 and Gate C regression | NOT_RERUN; prior baseline PASS remains historical evidence |
| Migration validation | PASS, 55 unchanged migrations |
| Typecheck / governance / webpack | NOT_RERUN; no runtime, schema or inventory changes |
| README / Digital Worker documentation | Updated to this schema stop |
| Gate B | PARTIAL — inspection only, not qualified |
| Live MyFactory | NOT READY / NOT_RUN |

All eight requested process-loss points, seven PostgreSQL race pairs, successful/failure golden journeys and affected M1/Gate C/verifier/full validation remain required after implementation. Preserve the [canonical baseline's](../2026-09-27-digital-worker-integration/REPORT.md) 40 gated skips and documented Turbopack symlink limitation. M1 live remains NOT QUALIFIED; Gate C remains PASS/CLOSED. No live Factory qualification follows automatically from either schema approval or a later local Gate B PASS.
