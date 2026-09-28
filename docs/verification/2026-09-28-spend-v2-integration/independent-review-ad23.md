# Independent read-only V2 review

Producer reviewed: ad23f3251eaccaf1bad9e2a4364450ba9684e77f.
Consumer: preserved/adapted uncommitted diff from 14eff2e24f4a083f6f6f9563f044c3f86e92ed35; final committed review pending.
Result: CHANGES REQUIRED. No source files edited; no paid provider or credential used.

## Reproduced defects

1. P1 — completion child omitted from recovery/quiescence. `apps/supervisor/src/dispatch-control.ts:202` filters only `agent.process_started`; `jobs.ts:124` similarly recovers only the productive child. V2 emits completion process identity as `agent.completion_process_started` at jobs.ts:455. With old productive process absent and a real detached completion process alive, recovery read reports `quiescent:true,state:CANCELLED`. A successor native writer can be admitted on false absence proof. Include all phase process groups in recovery/clear-hold/terminal proof, and test supervisor loss while completion remains alive.

2. P1 — historical terminal GET fences newer generation. `apps/supervisor/src/dispatch-control.ts:197` invokes work-only `fenceAuthority(workId)` unconditionally for terminal history; same work-only behavior occurs at lines 214/225 and completion teardown. After generation 2 acquires active authority, reading generation 1 terminal request changes its current authority from active to fenced. Returned old-request readback also carries generation 2 spend binding, so strict consumer cannot read this history. Fences must be conditional on exact current attempt; separate immutable historical request identity from current Work-wide accounting.

3. P1 — historical phase operations satisfy current mandatory completion. `packages/storage/src/spend.ts:166-181` searches all Work operations for any settled productive/completion operation. After generation 1 settles both phases, generation 2 can call beginCompletion then assertCompleted with zero generation-2 operations. Require presence bound to exact Work/generation/request/WorkOrder/dispatch/FactoryVersion/run, while retaining Work-wide outstanding exposure checks.

Reproducer: `/private/tmp/q37-v2-review-repro.mjs`. Against the clean ad23f325 files, output was:

```json
{"scenario":"historical GET fences current generation","before":"active","after":"fenced","oldReadSpendGeneration":2}
{"scenario":"historical ops satisfy new attempt mandatory phases","newAttemptOperations":0,"accepted":true}
{"scenario":"live completion child omitted from quiescence","quiescent":true,"state":"CANCELLED"}
```

The producer owner began modifying the checkout after reproduction. These findings apply to the committed ad23f325; replacement must be re-reviewed after commit.

## Missing required qualification

`packages/storage/test/spend.test.mjs` tests named concurrent ledger connections and completion race call synchronous methods sequentially in one process. Process-loss coverage opens a second connection and invokes recoverUnknown manually; it does not terminate a process at a boundary. Required qualification still needs synchronized competing processes for last operation/phase slot and reservations, UNKNOWN/cancellation/fence races, and process termination before dispatch/after dispatch/in completion/after settlement with persisted evidence.

No additional concrete consumer defect was established in the adapted diff during this pass. This is not a final consumer PASS: committed pin and complete connected/local evidence remain pending. Actual paid execution remains disabled and no live readiness is granted.
