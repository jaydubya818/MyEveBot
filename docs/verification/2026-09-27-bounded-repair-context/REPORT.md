# M1/ER1 bounded repair context — LOCAL PASS

Continues implementation `84be8db` and blocked live evidence `02e5b4b`. The exact equivalent inputs reproduce **16040 bytes** under the original assembler. The repair-only capsule is **12488 bytes**, leaving **1848 bytes** below the unchanged **14336-byte** admitted ceiling and **512 bytes** below the enforced 13000-byte repair target. No live provider authority was issued and no real provider was called.

## Required report

| Field | Result |
|---|---|
| M1/ER1 REPAIR CONTEXT | LOCAL PASS |
| ORIGINAL SIZE | 16040 bytes |
| HARD LIMIT | 14336 bytes — unchanged, including existing 4096-byte safety allowance |
| NEW SIZE | **12488 bytes** |
| HEADROOM | **1848 bytes** to hard ceiling; 512 to target |
| REPAIR CAPSULE | PASS |
| MANDATORY EVIDENCE RETAINED | PASS — ten failed checks; five distinct complete diagnostics; exact candidate/source, criteria and verifier identity |
| HIDDEN TRUNCATION | **0** |
| EXPLICIT TRUNCATIONS | **1 plan narrative**, 602 → 400 UTF-8 bytes; **0 diagnostics** in the exact live case |
| EXTRA MODEL COMPRESSION CALLS | **0** |
| REPAIR | PASS — controlled provider through actual authenticated assembly/tools |
| PROTECTED RE-VERIFICATION | PASS — independent protected Docker checks |
| LOCAL RESULT | **PARTIAL** |
| OVERSIZED DISPATCHES | **0** — adversarial pre-dispatch failure also leaves call/reservation counters unchanged |
| FALSE READY | **0** |
| README UPDATED | PASS |
| LIVE M1/ER1 | **READY FOR FINAL REQUALIFICATION**, not live-qualified |

P0 Gap #2B and Gap #2 remain PARTIAL until the separately authorized live journey passes. The prior live Work remains paused/revoked. The peer MVP task remains paused. No ER2 or other Q37 capability was started.

## Exact failed payload analysis

The old function was re-executed offline from the original implementation using the retained pre-closure projection, Work/workspace/contract/config, exact neutral continuation and final submission feedback. It produced **exactly 16040 bytes**, matching the live pre-dispatch error. No historical Work was resumed, no model invoked, and no authority reconstructed. Regression inputs and the original assembled payload are retained under `apps/eve/test/fixtures/repair-context/`.

The table partitions serialized wire bytes, including escaping for the nested JSON capsule. Categories are disjoint ordered deletion deltas; remaining JSON framing and the existing safety allowance close the exact sum. These are bytes, not approximate tokens or raw character counts. See `byte-analysis.json`.

| Original category | Bytes |
|---|---:|
| System / Role / JStack / mode | 1141 |
| Work objective | 83 |
| Criteria | 285 |
| Plan | 1200 |
| Candidate identity | 214 |
| Candidate change/source | 496 |
| Repository context | 314 |
| Previously inspected source | 227 |
| Verifier logs/output | 1533 |
| Protected verification bindings | 1935 |
| Current Truth | 2208 |
| Run/writer and Work identity | 597 |
| Budget / repair state | 479 |
| Duplicated tool-history feedback | 72 |
| Owner continuation intent / wrapper | 138 |
| Tool schema | 780 |
| Other serialization scaffolding | 242 |
| Existing dispatch safety allowance | 4096 |
| **Total** | **16040** |

The 1704-byte excess was not solved by increasing any limit. The previous bounded assembler already omitted most conversation history, but retained verbose plan/controller state, repeated Current Truth identities and repeated candidate/diagnostic bindings. No extra compression model call was needed.

## Repair contract and compaction

`native-repair-context.ts` is a pure context projection called only in the existing REPAIR phase. It retains one Work identity/version/generation, Run/writer identity, exact revision, failed candidate SHA/artifact hash, remaining calls/repair reserve, objective, all relevant configured criteria and the current owner instruction without truncation. It preserves complete changed-file content and any unchanged source named by the plan. Other unchanged source has base/path/digest references.

Every failed check remains represented and bound to the failed candidate. Identical verifier identities and diagnostic bodies are stored once and referenced by index; check expectations retain exact input/output/exit status where present in the existing approved profile. This is significant for the actual fixture: the failed candidate omitted the required trailing newline as well as using parseInt on fractions. No verifier/check definition changed.

All diagnostic content hashes are checked against retained artifacts. Missing verifier identity or mismatched candidate/revision/diagnostic binding fails closed. The plan keeps file targets, blockers and a bounded intent excerpt. Prior tool transcript, duplicate Current Truth prose, repeated source copies and generic orientation instructions are omitted. The context does not create authority or change any tool capability.

Priority is deterministic: remove duplicate/narrative context first; shorten lower-priority plan narrative before shortening diagnostics. Full candidate changes, criteria, failure identities and candidate bindings are never truncated. Large diagnostic bodies can use progressive UTF-8-safe excerpts (1024/512/256/128 bytes) with `truncated`, `originalBytes`, `includedBytes`, and content-addressed artifact reference. The full retained artifacts are not changed. The model is explicitly told excerpts may be incomplete and to stop if insufficient. No new retrieval platform was added.

All outgoing repair requests are measured as serialized `{prompt,tools}` UTF-8 bytes plus the unchanged 4096-byte dispatch allowance. The assembler enforces `min(13000, admitted inputBytes)`. An essential capsule that cannot fit returns **REPAIR_CONTEXT_TOO_LARGE** with required categories, actual bytes, target limit, admitted hard limit, largest contributors and evidence references before catalog/reservation/dispatch. Large source changes, many essential failures or long criteria are rejected rather than silently omitted.

The existing controller still drives **inspect → write → submit** in the three reserved repair calls. `inspect` consumes persisted failure once, followed by candidate mutation; there is no re-admission, orientation reset or unchanged resubmission. No admission, phase, ledger, writer, verifier, readiness, Current Truth, migration or completion-contract implementation was changed.

## Exact case and adversarial qualification

The regression reconstructs the old 16040-byte case and asserts the new complete mandatory fields and byte ceiling. It checks Unicode diagnostic truncation/reference accounting, multiple failed checks, large diffs, multiple changed files, long criteria, repeated conversation history, duplicate Current Truth and evidence/candidate tampering. Repeated history produces identical repair output. Essential oversized cases return structured rejection.

The actual authenticated production assembly was exercised with a controlled local provider and network kill switch, real disposable PostgreSQL, the actual tool/gateway/writer path and independent protected Docker verification. Two full journeys ran: the existing controlled case and the preserved live implementation plan/source (including its exact faulty quantity.mjs). The second journey also injected an oversized local-only evidence fixture, asserted no additional provider call or reservation, restored its exact protected evidence, then completed repair. No retained live database was altered.

Both journeys use ten calls: admission, open, read, plan, write, submit, inspect, repair write, repair submit, fresh read-only explanation. The exact-live variant reaches two candidates, two protected verification attempts, one repair, no duplicate Runs/writers, no no-progress calls and no human source edits. The immutable Result is PARTIAL and readiness is false. Its three repair requests measure **12439, 12657 and 12318 bytes**; the fixture-independent exact historical reconstruction remains 12488 bytes. Identity sizes differ because the local test creates new Work/Run/session IDs.

`journey-exact-live-failure.json` retains all ten controlled provider payloads and final canonical projection. `journey-controlled.json` retains the other full journey. Local controlled output is not evidence of real-provider success.

## Validation

| Gate | Result |
|---|---|
| Repair adversarial unit tests | 10 passed, included in full app suite |
| Productive controller/authenticated assembly | 16 PostgreSQL cases passed, including both ten-call journeys |
| Full app security/regression | **1367 passed**, 40 existing environment-gated skips |
| Root security/regression | **151 passed** |
| Completion accounting, restricted roles, crash recovery, final explanation | PASS |
| Protected verification driver/concurrency/recovery | PASS |
| Worker projection SQL parity | PASS |
| Historical active/latest Run projection | PASS; 114 copied tables unchanged |
| Typecheck / capability / skill / executor governance | PASS; 640 classified sources; UNKNOWN=0 |
| Production webpack build | PASS |
| Prior evidence and unchanged architecture | Hash-verified; `preservation.json` |

Typecheck was rerun after the build finished to avoid concurrent generated Next-type deletion. The historical projection script was rerun with the actual quiescent checkpoint after the earlier pre-quiescence snapshot lacked its expected Run. Final logs above are successful; neither setup correction changed product behavior. Existing older standalone pre-completion-contract fixture failures documented in the prior controller report were not broadened into this context-only change.

## Local release gate and scope

Exact payload analysis, repair capsule, hard ceiling, target headroom, mandatory evidence, truncation disclosure, zero compression calls, failed-candidate repair, protected pass and PARTIAL Result all PASS locally. Live qualification remains required. No prior window was renewed, and the next action is a separately authorized fresh authenticated M1/ER1 requalification under the existing envelope with fresh pricing—not an automatic run.

The code change consists of one repair assembler and its narrow provider-boundary invocation. Tests update parity expectations from repeated prose to the corresponding canonical fields, add the exact live fixture and adverse cases, and verify no spend on rejection. The executor inventory is updated after reviewing this read-only assembler and unchanged effect boundaries. README and Digital Worker docs distinguish local readiness from live qualification. `source-hashes.json` and `artifact-hashes.json` pin this tranche.
