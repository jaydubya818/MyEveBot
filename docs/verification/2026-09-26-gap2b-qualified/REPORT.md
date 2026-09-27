# P0 Gap #2B — local qualification and live stop boundary

Local gates passed. Authenticated live M1/ER1 has **not** run; P0 Gap #2 remains open. Evidence is scoped to the isolated candidate and synthetic local tests, not a claim of autonomous live model success.

| Required finding | Outcome |
|---|---|
| P0 GAP #2B | **PARTIAL — local implementation PASS; live requalification pending** |
| RETAINED WORK BUDGET BLOCKER | PASS |
| HISTORICAL WORK MODIFIED | NO |
| TEST-HARNESS FAILURE | TEST / RESOLVED (exact schema, aggregate-vs-check assertion, immutable receipt setup, actual mode change) |
| 0053 MIGRATION | PASS on disposable fresh/populated/checkpoint-clone databases |
| COMPLETION CONTRACT | PASS |
| ATOMIC COMPLETION RESERVE | PASS |
| COMMON LEDGER BRIDGE | PASS |
| REPAIR RESERVE | PASS |
| CURRENT TRUTH | PASS |
| ACTIVE/LATEST/HISTORICAL RUN | PASS |
| VERIFICATION CURRENT TRUTH | PASS |
| WORK ↔ CHAT PARITY | PASS |
| LOCAL FAILURE → REPAIR → VERIFY | PASS |
| PROTECTED VERIFICATION | PASS — real network-denied Docker, ten exact checks per candidate |
| LOCAL RESULT | PARTIAL; original FAILED proof preserved |
| FALSE READY | 0 in qualified local cases |
| FRESH $1.30 WORK | ELIGIBLE FOR LIVE QUALIFICATION at tested pricing/bounds |
| RETAINED FIXTURE | STILL PAUSED; accepted 0052 evidence preserved |
| LIVE M1/ER1 | READY FOR REQUALIFICATION, authority not issued |

## What changed

Additive 0053 stores the immutable completion contract in the existing route admission snapshot. Capacity and call slots are derived inside the common Work ledger; there is no second spend balance. Admission and call/dispatch guards protect implementation, one repair iteration, and one fresh text-only explanation. Existing 0051 and 0052 are unchanged. Historical routes without the new contract cannot regain productive authority.

Fresh admission and subsequent model turns receive bounded canonical Work state. The initial conversation is costed together with completion before dispatch, followed by an atomic admission recheck. The first conversation does not grant productive execution. New source edits stop after the permitted repair iteration. UNKNOWN stays reserved through expiry, cancellation, process loss and replay handling. Only definitive unused obligations release capacity.

UI and actual model payloads use the same Current Truth formatter. Active, latest and historical Runs remain distinct; an inactive writer is historical identity, not permission. Budget spent/reserved/held are read in one SQL snapshot. Exact protected candidate evidence and immutable Results determine status; an empty paid final explanation remains blocked, never COMPLETE or Ready.

## Retained Work: correct blocker

Work `fb5a3dd2-e601-404c-8321-81f44ac2973d` remains historical: ceiling **$1.300000**, spend **$0.777654**, remaining **$0.522346**. The previously proposed minimum **$0.599040** exceeds that by **$0.076694**, before fresh conversation. Expected `INSUFFICIENT_COMPLETION_BUDGET` is PASS. No additional budget, reconciliation clearing, authority, migration or productive restart was applied to that retained Work.

The final new contract is larger (**$1.013769**) because it covers the qualified bounded context and nine completion calls. It was not reduced to fit historical remaining funds. Retained figures come from preserved evidence and the approved offline checkpoint clone; this turn did not connect to the retained live database.

## Local budget telemetry (controlled synthetic provider)

| Item | USD |
|---|---:|
| Work ceiling | 1.300000 |
| Initial completion hold | 1.013769 |
| Conservative initial conversation reservation bound | 0.078051 |
| Total qualified conservative plan | 1.091820 |
| Margin below ceiling | 0.208180 |
| Conversation reasoning: admission + fresh explanation | 0.006000 |
| Implementation: open/read/plan/write | 0.012000 |
| Failure interpretation | 0.003000 |
| Repair source change | 0.003000 |
| Verification-related model spend: two submissions | 0.006000 |
| Unused completion capacity returned (1.013769 − 0.027000) | 0.986769 |
| Final actual synthetic spend | 0.030000 |
| UNKNOWN exposure / remaining hold | 0.000000 |
| Remaining Work allowance | 1.270000 |

The ten controlled receipts are $0.003 each; these are test fixtures, **not measured live provider prices or a live viability claim**. Protected Docker checks incur no model spend. See `budget-telemetry.json` for per-stage common ledger snapshots. At the tested pricing, the maximum 14,336-byte input envelope plus 2,048 output tokens costs at most $0.112641 per call; all ten envelopes total $1.126410. Current live catalog pricing must be checked again and the journey must stop if the complete plan does not fit $1.30.

## Qualification evidence

- `migration.log`: fresh 53, populated 52 → 53, approved checkpoint clone, all 113 historical data tables unchanged, transactional failure rollback, exact migration rerun, zero fabricated authority; restricted application/worker conversation reserve/dispatch/settlement/replay and denied direct accounting writes/DDL.
- `integration-final.log`: real PostgreSQL contention; protected dollars and call slots; restricted application/worker native stage receipts; UNKNOWN conservatism; stale Work/policy/Agent fences; real SIGKILL after contract, reserve, dispatch, retained response, repair draft, and protected verification; immutable failed and repaired Results; expiry/cancellation/exhaustion; actual fresh initial and final conversation wrappers; ten-call cap; valid and empty explanations; third source repair denied.
- Actual provider-bound state `currentTruth` is compared field-for-field to the canonical projection before each implementation/repair/final call; the UI formatter parity regression uses the same lines. No unsupported “no Run history” assertion in these cases.
- `vitest.log`: **1,341 passed, 40 skipped**. Skips are pre-existing environment-gated suites, not claimed PASS.
- `root-tests.log`: **151 passed**.
- `typecheck-final.log`: TypeScript, 147 capability definitions/125 tools, imported-skill checks, **638 classified sources; UNKNOWN=0**.
- `build.log`: production webpack build PASS. `migration-manifest.log`: 53 ordered migrations validated.

0051 SHA256: `49806249a1b105cda3724372d9bc9b6afd66d1292e5c461eccbb31581a094fce`  
0052 SHA256: `a6958d75de012f257c5a4378cd2828b422806f776bc9462689077a93dd9fe106`  
0053 SHA256: `1f3fd2316758e547608fb4e23480105d1ce3a1dcb93a04a4c5be69841f2c5a53`

## Fresh Work prepared; authority withheld

- Work: `ca197e24-08e4-47a5-9589-b96df35485bb`, version 1 / generation 1, **paused**.
- Separate database: `gap2b_m1er1_2b3e464aec18b4d1`, schema 53. This is not the retained fixture.
- Ceiling $1.30; Agent cap ten provider calls / 1,800 seconds.
- Runs, common budget grants, calls, writers, workspaces and Results: **zero**.
- Provider qualification: **not issued**. Runtime: **not started**.
- Exact base `db5d95cf3d1dadf04a118f38bd5b388a5a226c31`; profile hash `aaf54927d1f4d8731cc38736f7aed6e65573b3ee344d2c4052c1e3aefc772a72`.
- `fresh-work.json` records the five approved source file hashes and nonqualified configuration identity. No old writer session or spend grant was copied.

## Minimum fresh authority requested

Authorize **one authenticated M1/ER1 journey only**, for the new Work above:

1. Start the isolated local runtime against the new database; authenticate the owner and create one productive Sofie writer session plus one final read-only fresh session. Resume only this new Work after current schema, Work generation, policy, Agent, budget and writer checks.
2. Issue one temporary qualification for `anthropic/claude-sonnet-5` through **Vercel AI Gateway, Anthropic-only**, bound to the named Work/owner/Agent, exact profile/base/configuration and current code candidate. Expire it after **30 minutes** from issuance or earlier on completion/blocker; revoke at the stop boundary. No automatic renewal or fallback.
3. At most **ten provider calls**: one admission, five implementation, three repair/failure-interpretation, one final read-only explanation. At most 14,336 input-envelope bytes including safety allowance and 2,048 output tokens per call; **$1.30 total Work ceiling** including all conversations, reservations and UNKNOWN. No historical allowance transfer and no budget increase. Reprice before admission; stop if the full conservative plan cannot fit.
4. Transmit only the bounded owner intent/Work contract/Current Truth, scoped tool schema, the five hash-pinned synthetic repository files in `fresh-work.json`, Sofie-generated `quantity.mjs`, and exact local protected-check/candidate/Result evidence. Permit exact-base repository reads needed to open that fixture. No unrelated source, credentials, private conversations or historical Work payloads.
5. Permit guarded source work solely on `quantity.mjs`, one intentional protected failure and one autonomous repair, isolated network-denied protected checks, immutable PARTIAL Result retention and the final fresh explanation. No human source edits, publication, PR creation, merge, deployment, broader repository writes, ER2 or other Q37 gap.

This permission request is required by the user's explicit live-authority stop boundary in the approved Gap #2B Budget Policy Resolution, section 10. Local implementation approval does not authorize provider dispatch. The original **Implement digital worker MVP plan** task remains paused; no fast-forward, stash or runtime resumption was requested.
