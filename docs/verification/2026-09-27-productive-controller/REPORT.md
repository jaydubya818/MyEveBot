# M1/ER1 productive execution controller — LOCAL PASS

Base: `caad506`. The real authenticated production-path assembly now progresses from orientation through implementation, protected failure, one repair, protected pass, immutable PARTIAL Result and a fresh read-only explanation using a controlled local provider. No live authority or real provider dispatch was issued. Prior live failures remain unchanged. M1/ER1 remains **NOT QUALIFIED live**.

## Required report

| Field | Outcome |
|---|---|
| M1/ER1 PRODUCTIVE EXECUTION CONTROLLER | LOCAL PASS |
| SCHEMA CHANGE | NONE |
| PHASE CONTROLLER | PASS |
| ORIENT → PLAN | PASS |
| PLAN → IMPLEMENT | PASS |
| IMPLEMENT → VERIFY | PASS |
| VERIFY → REPAIR | PASS |
| REPAIR → VERIFY | PASS |
| VERIFY → COMPLETE | PASS |
| NO-PROGRESS DETECTION | PASS |
| ADMISSION LOOPS | 0 — normal golden journey |
| REPOSITORY OPEN LOOPS | 0 — normal golden journey |
| EQUIVALENT READ LOOPS | 0 — normal golden journey |
| PRODUCTIVE MODEL CALLS | 9 — eight engineering calls plus the fresh explanation |
| COORDINATION MODEL CALLS | 1 — admission |
| LOCAL FAILURE → REPAIR → VERIFY | PASS |
| COMPLETION BUDGET | PASS |
| CURRENT TRUTH | PASS |
| WORK ↔ CHAT PARITY | PASS |
| FALSE READY | 0 |
| README UPDATED | PASS |
| LIVE M1/ER1 | READY FOR ONE FINAL REQUALIFICATION — requires separate explicit authority |

The normal journey used all ten reserved calls. It does not yet achieve the aspirational approximately five calls. The qualified atomic tool operations remain separate; coordination waste is zero beyond the one admission call. Adversarial fixtures deliberately contain repeated proposals, described below; they are not hidden behind the normal-path zero counters.

## Small controller, existing authority

`native-execution-controller.ts` derives native phases and next operations from the current workspace, scoped successful tool observations, candidates, exact evidence/Result and common ledger. It uses the existing `eve_events` table for idempotent `NATIVE_OPERATION` observations; no migration or new database abstraction was introduced. It is specific to the bounded Software Engineer harness.

ORIENT requires the opened approved base, objective/criteria, README and any existing editable target files. Absent targets are explicitly distinguished from inspected files. Successful reads are retained by path and content digest. PLAN requires affected approved files, intended change, verification approach, assumptions and blockers. A blocker prevents additional productive model calls. Once a valid unblocked plan exists, later reads cannot reset orientation. IMPLEMENT recommends write then submit. VERIFY relies on the separate protected verifier. REPAIR binds inspection to the exact failed candidate and allows one changed candidate. COMPLETE requires protected local pass and an immutable PARTIAL Result; it does not imply publication, CI, review or readiness.

Canonical Work/Chat projection exposes the same phase, known context, expected operation, Run/writer, candidate and budget. Each productive model payload is checked against the pre-dispatch Work projection; detailed metrics are deliberately omitted from the bounded provider capsule. The existing authority projection still blocks stale, paused, expired, exhausted or otherwise nonproductive state. Every effect keeps its original checks. The controller can narrow permission, never create it.

The tool host records progress only after observing actual server state/results. SQL observation inserts fence Work version/generation and writer. Successful read receipts must match current retained content. Replays use both durable model-call identity and tool-call identity; reused model-supplied tool IDs cannot suppress new no-progress observations. A crash after an effect but before its observation preserves the authoritative workspace; a read may conservatively need repeating, never an authority revival. Projection reads do not write progress or acquire custody.

The provider schema narrows to the current productive operation, with reasoned new dependency reads where appropriate. The authored tool independently rejects off-phase/repeated/no-op proposals with deterministic guidance even if the provider ignores the schema. Two consecutive no-progress observations expose NO_PROGRESS and one recovery opportunity. A third stops the next model dispatch. Stage/call/spend bounds are unchanged and can stop earlier.

## Actual local golden journey

The test uses real owner login/cookie authentication, selected Work/Agent binding, persistent instructions, context hook, dynamic model resolution, authored tools, Action Gateway and disposable PostgreSQL. Only the external provider/catalog and pinned repository HTTP responses are controlled. All other network access is denied. The initial owner instruction is the complete preserved live instruction from the b3bff2b window. No next productive operation, version or generation is injected into model context by the test driver.

The controlled provider chooses operations from the actual production execution capsule and produces fixture code. Its deterministic behavior is not evidence of real-provider reasoning quality. Independent protected Docker checks run the real candidate, and independent Result retention produces immutable proofs; the harness never substitutes direct repository services for the authenticated admission-to-implementation path.

Sequence:

`admit → open → read README → structured plan → write intentional parseInt failure → submit → protected FAIL → inspect failure → one repair write → submit → protected PASS → PARTIAL → new authenticated read-only explanation`

The exact normal phase trace is `ORIENT → PLAN → IMPLEMENT → VERIFY → REPAIR → VERIFY → COMPLETE`. The final projection records ten model calls, nine productive calls, one coordination call, zero no-progress calls, two candidate revisions, two verification attempts, one repair and zero Work-control interventions. The fresh explanation names the exact passed candidate and states PARTIAL with unqualified publication/CI/review. One Run/writer remains; the observer acquires no custody. Both failed and repaired candidates remain retained.

Simulated settled spend is $0.030000, reservations zero and UNKNOWN false. No actual provider spend occurred. The unchanged conservative ten-call envelope remains $1.126410 at the controlled fixture pricing, under $1.30. Completion holds and stage quotas remain enforced. The complete owner intent and all productive/final payloads fit the 14,336-byte input envelope; full payloads and final projection are retained in `local-journey.json`. Larger unsupported contexts fail closed before dispatch, rather than increasing the contract.

The capsule avoids unnecessary repeated source by using a base/source digest and path list; relevant content, changed source, plan and bounded failure excerpts remain available. Full protected artifacts stay retained with hashes; excerpts are explicitly marked when truncated.

## Adversarial and safety proof

- Exact live regression: after admission, controlled `open → read → open → read` produces two NO_PROGRESS observations without repeating repository-open effects. Current phase remains PLAN. The next model chooses plan from the real capsule, which advances durable progress to IMPLEMENT. The unchanged five-call implementation-stage budget is then exhausted; no hidden extra capacity is granted.
- A provider that keeps repeating README reads after recovery stops before another model call. The test reuses the same malicious tool ID across responses to verify durable-call idempotency cannot hide the loop.
- Repeated admission returns the existing observed transition without new authority; bounded refusal eventually stops before more spend.
- Missing dependency reasons are rejected after orientation. A specifically justified new bounded source read is allowed and preserves IMPLEMENT.
- A blocked structured plan stops model spend. Duplicate receipt delivery does not inflate counters. Paused Work cannot mutate source.
- Prior version/generation races, anonymous/read-only restrictions, alternate-writer denial, unchanged completion contract, UNKNOWN accounting, expiry, cancellation, stage exhaustion, candidate preservation and no false Ready are covered by the authenticated/current accounting suites.

## Verification results

| Check | Result |
|---|---|
| Full app regression with authenticated PostgreSQL enabled | 1,356 passed; 40 existing environment-gated skips — `app-tests.log` |
| Final exact Work/Chat parity and authenticated controller cases | 15 passed — `authenticated-journey.log` |
| Root security/regression | 151 passed — `root-tests.log` |
| Current completion accounting/roles/crash/full protected journey | PASS — `completion-budget.log` |
| Protected verifier concurrency/resource/recovery | PASS — `protected-verifier.log` |
| Route admission SQL | PASS — `route-admission.log` |
| Worker projection SQL | PASS — `worker-projection.log` |
| Work context SQL | PASS, silent successful exit — `work-context.log` |
| Typecheck, capability/skill/executor governance | PASS, 639 classified sources, UNKNOWN=0 — `typecheck.log` |
| Production webpack build | PASS, existing noVNC target warning — `build.log` |
| Migration manifest | PASS, 53 migrations — `migrations.log` |
| 0051–0053 and prior evidence | Unchanged — `preservation.json` |

Two pre-existing standalone script failures are retained, not reported as passes or skips:

- `engineering-native-host.integration.mjs` attempts native admission without the mandatory 0053 completion contract and fails with “A complete native completion contract is required.” It still assumes the pre-common-ledger host contract. Both current and untouched `caad506` fail at the same admission boundary (`legacy-native-host.log`, `baseline-native-host.log`).
- `engineering-direct.integration.mjs` expects “Working” for a legacy fixture whose current projection correctly says “Needs reconciliation.” Both current and untouched `caad506` fail at line 120 with the same assertion (`legacy-direct.log`, `baseline-direct.log`).

These obsolete-fixture gaps remain test-maintenance limitations; the current-contract authenticated, common-ledger and protected-verifier gates above pass. No obsolete fixture was weakened to manufacture green results. The baseline reproductions used a temporary archived source copy and disposable databases, not historical qualification Work.

## Boundaries and remaining qualification

Test databases and fixture config directories are disposed by cleanup; no live grant was created. The prior b3bff2b live Work remains paused/revoked, and the peer MVP task was not resumed. No ER2, publishing, deployment, learning or another Q37 capability was started. `source-hashes.json` pins changed implementation/tests/docs and `artifact-hashes.json` pins the dossier.

P0 Gap #2B and Gap #2 remain PARTIAL; M1/ER1 remains NOT QUALIFIED live. Next required evidence is one separately authorized fresh authenticated real-provider journey through the controller and final explanation, with fresh pricing and the full unchanged completion contract checked before admission. Local success does not authorize that window.
