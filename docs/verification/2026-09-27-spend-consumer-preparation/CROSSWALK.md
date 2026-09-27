# Producer protocol crosswalk

Canonical/active compatibility pin: **d9564beef41590c3700069ec340d926db23b7ba7**. Supported candidate only: **8f5e3774129b5f9f4b1c9655ffbbb531cd20fa0f**. Candidate activated: **NO**. Comparison is against those exact Git objects, including `dispatch-control.ts`, storage `spend.ts`, and the candidate handoff.

| Surface | d956 canonical | 8f5e377 candidate | Classification / consumer handling |
| --- | --- | --- | --- |
| PREPARE | POST `/api/connect/v1/dispatches`; exact requestId, workId, workGeneration, repository, deadline, maxSpendUsd, input | Same keys; creates immutable per-Work ceiling; min maxSpendUsd tightened from >0 to >=0.000001; max remains20 | UNCHANGED wire keys; ADDITIVE durable binding; BREAKING for sub-micro-dollar budgets. Validate exact prepared ceiling `floor(maxSpendUsd*1e6)` |
| START | POST `/:requestId/dispatch` with exact Work/generation/route Run/writer generation/dispatch identity/FactoryVersion/WorkOrder/remote Run/base/paths/deadline | Same identity and exactly-once claim, now gateway-bound spend reservation before model request | UNCHANGED request; ADDITIVE producer enforcement. Consumer requires reviewed evidence and current authenticated availability |
| READ | GET `/:requestId`; execution/snapshot/identity/quiescence/evidence/blocker plus `spend:{status,ceilingUsd,reason}` | Zero-cost LOCAL_FIXTURE retains old form. Non-fixture spend becomes USD/microUSD ledger and operations | BREAKING for strict old spend parser. Explicit consumer `WORK_LEDGER_V1` contract must match producer source digest; no implicit negotiation from field presence |
| STOP | POST `/:requestId/stop` with same identity; terminal tombstone after resource reconciliation | Also cancels Work budget, preventing further paid starts; retains existing exposure | UNCHANGED wire; ADDITIVE cancellation semantics. No refund or fresh ceiling inferred |
| Ceiling | Informational USD amount, no paid enforcement | `ceilingMicrousd`, immutable per Work, across generations; same-generation request binding immutable | ADDITIVE. Exact equality with prepared approved ceiling; historical continuity checked |
| Reservations | Not exposed | `retainedMicrousd`; operations in reserved/dispatched/unknown retain full `reservedMicrousd` | ADDITIVE. Active and UNKNOWN subsets calculated without double counting |
| Settlement | Not exposed | `settledMicrousd`; settled operations include actualMicrousd, providerRequestId and authoritative usage | ADDITIVE. Require complete settlement fields and actual <= reserved; sums must equal header |
| UNKNOWN | Informational status | Status UNKNOWN iff any operation is unknown; all uncertain reservation retained | ADDITIVE. Missing/erased operations, status disagreement, reset ceilings and state regression rejected; no fresh Factory admission while unresolved |
| Accounting completeness | Not established | Full operation list plus ceiling/settled/retained/available arithmetic | ADDITIVE readback validation; PRODUCER QUALIFICATION PENDING for final completeness of all real paid effects. Missing or inconsistent readback fails closed |
| Operation binding | Not exposed | operationId, Work/generation, dispatchIdentity, requestId, WorkOrder, FactoryVersion, runId, model, pricingRevision | ADDITIVE. Current operation must match exact remote execution and reviewed price identity; historical generations remain preserved |
| Pricing | Not qualified | Each operation identifies model/pricingRevision; gateway validates its injected price card | ADDITIVE identity; PRODUCER QUALIFICATION PENDING for real current commercial pricing. Wire does not advertise an authoritative price card or pricingQualified flag |
| Completion reserve/state | No producer completion-budget fields | Still no completion-budget/reserve contract | UNCHANGED / PRODUCER QUALIFICATION PENDING. No invented payload fields. Required completion evidence is a separate consumer-reviewed qualification prerequisite |
| Execution health | LOCAL_FIXTURE or DISABLED; spendEnforced flag | Adds LOCAL_SPEND_FIXTURE. Default paid execution remains DISABLED | ADDITIVE mode. Flag alone cannot authorize paid admission; source-bound evidence and complete readback are also required |
| Terminal/quiescent | Authenticated exact identity, terminal state and resource evidence | Same semantics | UNCHANGED. Writer fencing and spend reconciliation remain independent; terminal execution can retain UNKNOWN accounting |

## Exact new ledger shape

`status`, `currency: USD`, `unit: microUSD`, `workId`, `workGeneration`, `requestId`, `workOrderId`, `deadline`, `ceilingMicrousd`, `settledMicrousd`, `retainedMicrousd`, `availableMicrousd`, `cancelled`, `operations`, and optional `reason`.

Each operation contains `operationId`, `workId`, `workGeneration`, `dispatchIdentity`, `requestId`, `workOrderId`, `factoryVersion`, `runId`, `model`, `pricingRevision`, `reservedMicrousd`, nullable `actualMicrousd`, nullable `providerRequestId`, nullable `usage`, and state reserved/dispatched/unknown/settled. Amounts must be nonnegative safe integer micro-USD. No completion fields are assumed.

`WORK_LEDGER_V1` is the consumer's explicit compatibility selector for this exact audited shape, not a claimed producer-advertised protocol version. Producer source/FactoryVersion, health mode, readback and retained operations are checked independently.
