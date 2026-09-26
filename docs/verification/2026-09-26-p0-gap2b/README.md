# P0 Gap #2B — completion budget and native Current Truth

**PARTIAL — schema boundary identified; implementation stopped before creating a migration, as requested.** Completion allocation and Current Truth fixes are not implemented or qualified. No provider calls, fixture writes, migration, authority renewal, budget increase, ER2 or publication occurred in this tranche.

Starting candidate: `5a7a3fc`. Evidence: qualification `m1er1-33b7a0af-e626-4e86-a507-4454311a67a4`. The separate 0052 candidate inspected is `f3a5de879ec48a6e65faf9e9dcac9e5441a024c5` in `gap2-common-ledger`; it is not merged into this branch. The retained fixture remains paused under the upgrade coordination agreement. No pre-0052 writer was resumed. The coordinating task subsequently reported retained-database 0052 upgrade PASS, checksum `a6958d75de012f257c5a4378cd2828b422806f776bc9462689077a93dd9fe106`, historical rows preserved and empty canonical accounting tables. It explicitly required continued pause, compatible runtime and historical liability reconciliation before any resumption. This task acknowledged the pause; it has not independently queried or modified the upgraded fixture.

## Why implementation stopped

The owner's section 12 says: **“If a new migration is genuinely required: STOP and report why before creating it. Do not change 0051 or 0052 history.”** This is the stopping instruction; no skill or automatic approval rejection caused the stop.

0052's `engineering_model_reserve(jsonb)` serializes Work/Agent/common-budget access and atomically enforces `spent + reserved + this_call_exposure <= ceiling`. It has no persistent completion-contract enforcement. `purpose` distinguishes native/conversation/verification requests, while `bounds` is retained as provenance; neither protects remaining repair or completion slots. Its transition function handles individual dispatch/retention/settlement, not a lifecycle commitment.

A prompt or application preflight could estimate enough remaining money, but another reservation can consume it before productive admission or during the lifecycle. Lowering one caller's effective ceiling alone does not require every competing purpose/older caller to honor a shared commitment. Using a fake future model-call receipt is also wrong: request identity/hash is not yet known, and that would mix an allocation with actual provider exposure and its dispatch/recovery rules. Reusing `historical` as mutable policy would contaminate accounting provenance.

The smallest robust design therefore changes the **atomic common-ledger reservation boundary**. Since that function is installed by immutable 0052, changing its persistent behavior requires a new additive migration. No new independent spending balance is proposed. No migration file or SQL function replacement has been created.

## Exact observed spend

Categories below follow each retained model response/tool call. They describe the call's primary function, not an inferred token-level cost split. A tool itself does not incur an additional model charge; a model response selecting submission still does.

| Call | Observed stage | Actual cost | Reserved maximum | Input tokens |
| --- | --- | ---: | ---: | ---: |
| 1 | Initial authenticated inspection | $0.038942 | $0.337266 | 19,021 |
| 2 | Scoped context / Knowledge explanation | $0.056142 | $0.367140 | 21,456 |
| 3 | Productive route admission | $0.047254 | $0.391461 | 23,122 |
| 4 | Approved workspace/base opening | $0.048486 | $0.400260 | 23,868 |
| 5 | Approved repository reads | $0.050586 | $0.404731 | 24,168 |
| 6 | Implementation planning | $0.060468 | $0.424856 | 25,769 |
| 7 | Initial implementation generation | $0.058818 | $0.441900 | 27,079 |
| 8 | First candidate submission | $0.057410 | $0.455830 | 28,195 |
| 9 | Verification queue inspection | $0.059086 | $0.468760 | 29,243 |
| 10 | Pending verification explanation | $0.073734 | $0.526155 | 34,232 |
| 11 | Persisted failure interpretation | $0.073890 | $0.553490 | 36,580 |
| 12 | Autonomous repair generation | $0.100016 | $0.642310 | 45,068 |
| 13 | Fresh-chat recovery explanation | $0.052822 | $0.355445 | 20,746 |
| — | Attempted repaired-candidate submission | **$0.000000** | Denied before dispatch | — |
| | **Total** | **$0.777654** | Reservations are not additional spend | |

[Machine-readable allocation and receipt keys](spend-analysis.json). Arithmetic: first two read-only calls $0.095084; route admission $0.047254; nine native calls $0.582494; post-restart read-only recovery $0.052822. Sum $0.777654. The native subtotal is already included.

At the block, twelve calls had spent $0.724832. Remaining Work allowance was $0.575168 under the unchanged $1.30 ceiling. The immediately preceding repair request required a $0.642310 maximum reservation. Input grew from 19,021 to 45,068 tokens as accumulated Work/tool state remained in the prompt. The next request was denied; there is no retained completed call or exact charged usage for it. The later bounded recovery response cost $0.052822. The final $0.777654 was not all consumed before the repair stop.

The denial was correct. Actual cost cannot replace worst-case exposure for admission. A completion reserve alone cannot make the same unbounded prompt history fit: deterministic request-size limits and bounded selected-Work context are also required. Original candidate/evidence/Result and raw captured payloads remain unchanged in the previous dossier.

## Proposed minimum additive change — not implemented

Prefer existing rows and JSON records; no new table or separate spend balance is needed in the proposed design:

1. Store a versioned immutable completion contract in the existing route admission authority snapshot. Bind it to Work/version/generation, Agent/revision, policy, Run, provider/model, pricing snapshot, fixed deadline, stage counts and per-stage request/output bounds. Reuse existing receipt `bounds` JSON for an authenticated stage/slot binding. Neither model output nor a request body chooses the allowance.
2. Admit the productive route and its minimum commitment under the same Work → Agent → common-budget lock ordering. If settled spend, uncertain/in-flight exposure and all remaining required stage maxima do not fit the authoritative ceiling, record a truthful budget blocker and acquire no productive writer. Include admission's own unresolved model exposure; do not assume it has already settled.
3. Additive migration updates the common reservation/dispatch enforcement to honor the stored contract for **every purpose**, including observer conversation calls. Derive unused stage commitment from the contract and durable receipts, never an independent balance. A native reservation atomically consumes its allowed slot and moves that slot's worst-case commitment into the existing reserved exposure. The invariant is `spent + unresolved provider exposure + remaining completion commitment <= effective Work ceiling`. Retrying the same receipt cannot consume a second slot or dispatch again.
4. Derive required stages from the actual tool state machine: bounded discovery/implementation, first submission, protected-failure interpretation, allowed repair iteration(s), repaired submission/finalization and final explanation. Protected local verification is not model spend; interpreting/explaining it is budgeted when a model is used. Stage counts and caps must be explicit before admission; do not choose arbitrary percentages or allocate from mean observed usage. Current unbounded input must fail the declared input cap, not be priced below its real size.
5. Keep existing maximum-provider-exposure calculation and output limit. Assemble bounded authoritative Work/run/candidate/check facts and only needed approved file content; retain all raw receipts/evidence durably. Enforce byte/token upper bounds before reservation. Do not add an unmetered summarization call. Determine stage caps from the serialized bounded request and current approved model prices, then calculate whether the same $1.30 ceiling fits.
6. UNKNOWN exposure stays reserved and blocks the relevant continuation. Known settlement can release unused exposure under the same locked contract. Any release of unused lifecycle slots must be a deterministic validated transition, with no release of uncertain calls and no history mutation. If bounds or remaining stages cannot fit, preserve draft/candidate/evidence and show the blocker and next permitted owner action.
7. Recheck the contract and unchanged authority before dispatch/output. A new migration is not permission to activate a historical budget, rewrite a Run or move the retained writer. Existing pre-contract historical Work requires the normal explicit reconciliation/current admission path before any new productive request.

The proposed migration is an extension of database enforcement, not a rewrite of 0051 or 0052. Its exact filename/number should be chosen only after the coordinated 0052 candidate and branch are settled. This report does not create or apply it.

## Current Truth defect and proposed contract

At starting candidate `5a7a3fc`, `worker-projection.ts:311` populates `currentRun` only from the legacy execution truth. The native route Run is separately available but not assigned there. `context-assembly.ts:252` emits **“Last Run: none.”** from that nullable field. Also, `worker-projection.ts:309` labels any native Result's local verification “PARTIAL,” including the actual FAILED Result. Both defects remain in the inspected 0052 candidate.

Implement one shared read-only projection for Work UI, selected-Work context and inspect tool:

- `activeRun`: currently executable only after current generation, deadline, provider qualification, policy and custody checks; unavailable/unknown checks fail closed.
- `latestRun`: newest associated Run even when none is active. Preserve stored status separately from effective state/reasons such as EXPIRED, REVOKED or HISTORICAL. Do not rewrite a stored RUNNING row just to display expiry.
- `runHistory`: stable ordered identity, purpose, terminal/expiry state, provenance and timestamp source; never infer creation order from a later status update.
- `writerSession`: recorded writer identity distinguished from currently usable productive custody. A stale/revoked writer is visible, not acquired or transferred by observation.
- `candidate` and `draft`: exact frozen candidate, draft revision/content identity, custody and whether a newer draft is unverified.
- `verification`: protected job/check status bound to exact candidate and evidence hashes. Failure remains failure after a repair draft is written; older evidence never passes a new candidate.
- `result`, `budget`, `blocker`, `nextPermittedAction`: immutable retained Result and readiness, canonical settled/reserved/unknown exposure plus protected completion commitment, and current permitted behavior. Protected PASS alone still yields PARTIAL, never READY_FOR_REVIEW.

The retained fixture must continue to show one historical native Run, failed candidate `43f43eaf92ac238cda545f091ada72a6ccb9b4fa`, ten checks with two failures, unverified revision-6 repair draft, immutable FAILED Result `a22eea13-0a62-4e92-abff-335e640af67a`, the recorded budget refusal, and revoked temporary authority. No active executable Run is created by exposing that history.

## Required qualification after schema approval

No new implementation test was run because implementation stopped at the schema boundary. The spend reconciliation above was executed against retained evidence and its source hash recorded. Prior qualification tests are historical supporting evidence, not Gap #2B passes.

Required focused tests: exact minimum contract; admission below minimum creates no writer; earlier/observer calls cannot spend repair commitment; real SQL simultaneous conversation/native reservations; immutable replay slot; unknown exposure; unexpected request-size growth; repair/draft custody on denial; zero ceiling changes; and post-restart contract reconstruction. Test all Current Truth cases A–F: active/latest agreement, expired latest, completed candidate, failed candidate with newer repair, verified repaired candidate, multiple Runs. Compare the same projection rendered through Work and selected-Work context/inspect, including budget/blocker/next action. Assert historical reads create no authority or writer.

Then run full app/root security, applicable SQL suites, migration checks, type/registry/governance and production build. A fresh authenticated model explanation remains a separate live gate requiring current provider authority. The retained fixture remains paused until the coordinating task confirms 0052 compatibility; old runtime processes must not resume.

## Required report

FAIL below means the requested implementation/qualification is not complete; it does not invalidate successful historical safety behavior.

| Gate | Result |
| --- | --- |
| P0 GAP #2B | PARTIAL — investigated and designed; schema stop |
| COMPLETION BUDGET CONTRACT | FAIL — not implemented |
| WORK BUDGET CEILING PRESERVED | PASS — unchanged $1.30; no new spend |
| REPAIR RESERVE | FAIL — not implemented |
| BUDGET EXHAUSTION CUSTODY | PASS — retained evidence proves draft/candidate preserved; no new live claim |
| ACTIVE RUN PROJECTION | FAIL — not implemented |
| LATEST RUN PROJECTION | FAIL — not implemented |
| RUN HISTORY | FAIL — not implemented |
| VERIFICATION PROJECTION | FAIL — incorrect PARTIAL label remains |
| WORK ↔ CHAT CURRENT TRUTH | FAIL — prior mismatch remains |
| LOCAL M1/ER1 READINESS | FAIL |
| SCHEMA CHANGE | REQUIRED — STOPPED before creation |

No new safety violation or model spend was introduced by this read-only investigation/documentation tranche. Incorrect “no Run” explanations are **not** claimed fixed. No fresh provider authority is requested yet: local Gap #2B has not passed. The next decision is approval of the additive atomic completion-contract enforcement above; live requalification authority is a later, separate step. ER2 remains blocked and stopped.
