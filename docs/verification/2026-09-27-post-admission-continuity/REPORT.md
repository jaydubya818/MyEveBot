# M1/ER1 post-admission continuity — LOCAL PASS

Local qualification against the failed live evidence baseline `6630363618612826e322590f450afc1185e9aaea` (short ref `6630363`). No live provider authority was issued and no failed or retained Work was retried. M1/ER1 remains **NOT QUALIFIED live**. The paused MVP task remains paused. No ER2 or additional Q37 capability was started.

## Root cause and correction

The first gap occurred at successful admission: the route and completion contract existed, but writer custody was only acquired when the next model reservation happened. The admission receipt did not provide an explicit productive transition. The Current Truth reader additionally required an opened native workspace before observing current native authority. Therefore an admitted Work with no workspace was projected as having no executable active Run. Finally, the bounded completion prompt discarded prior tool outcomes and retained `admit` in the productive tool schema, allowing repeated admission proposals to consume the IMPLEMENT allowance without useful recovery feedback.

The native admission SQL now creates the writer atomically with its Run and completion contract. Existing version/generation, policy, Agent and budget checks remain authoritative. Canonical Current Truth observes current native authority before workspace creation and derives the execution phase and next operation from durable facts. The tool returns a deterministic SUCCESS receipt with current Work metadata, Run, writer, route, control, completion contract, budget and `open` as the next operation. It is explicitly not an authority token.

A duplicate admission from the same current writer returns ALREADY_ADMITTED without a new effect, Run, writer or grant. Stale version, stale generation, read-only intent and another session are rejected. Productive model context includes canonical metadata and native execution state, retains a bounded prior tool operation/outcome excerpt, and removes admission from the provider-facing productive schema. If a provider ignores that schema and proposes admission on two consecutive native calls, the next request stops before provider dispatch or reservation. No schema or migration changed.

## Required report

| Field | Local outcome |
|---|---|
| M1/ER1 POST-ADMISSION CONTINUITY | PASS |
| SCHEMA CHANGE | NONE |
| ADMISSION SUCCESS CONTRACT | PASS |
| POST-ADMISSION CURRENT TRUTH | PASS |
| ACTIVE RUN PROJECTION | PASS |
| WRITER PROJECTION | PASS |
| NEXT ACTION | PASS |
| ADMISSION → REPOSITORY INSPECTION | PASS |
| DUPLICATE ADMISSION | RECOVERED |
| REPEATED ADMISSION LOOPS | 0 in normal and single-duplicate recovery journeys; deliberately hostile provider is bounded as described below |
| ROLE CONTINUITY | PASS |
| JSTACK CONTINUITY | PASS |
| /POTATO-MODE CONTINUITY | PASS |
| WORK ↔ CHAT PARITY | PASS |
| COMPLETION BUDGET | PASS |
| LOCAL FAILURE → REPAIR → VERIFY | PASS |
| README UPDATED | PASS |
| AUTHORITY BYPASSES | 0 |
| DUPLICATE RUNS | 0 |
| DUPLICATE WRITERS | 0 |
| FALSE READY | 0 |
| LIVE M1/ER1 | READY FOR ONE FRESH REQUALIFICATION — requires fresh explicit authority; not executed |

All counters describe the bounded local qualification, not a claim about unseen production executions. Role/JStack/potato PASS proves configuration continuity and controlled behavior through the real production assembly, not independent real-model reasoning quality.

## Authenticated local proof

`admission-context.integration.test.ts` invokes the real owner login handler, cookie authentication, selected Work claim, persistent instructions, context hook, dynamic model selection, authored tool and Action Gateway with real disposable PostgreSQL. Only external provider/catalog and pinned repository HTTP responses are controlled. Unapproved network access is rejected. Synthetic source files are read from the preserved approved fixture artifact; no historical database is connected.

The provider fixture chooses from the actual production payload. Work version/generation come solely from production context. The test does not inject a repository-operation instruction after admission. The first nine proposals are:

1. `admit`
2. `open`
3. `read` README/objective context
4. `plan`
5. `write` deliberate failing quantity parser
6. `submit` → independent protected Docker checks FAIL → retained FAILED Result
7. `inspect` protected failure
8. `write` one minimal repair
9. `submit` → independent protected Docker checks PASS → immutable PARTIAL Result

Admission → productive operations use the actual model/tool path; no direct repository-service substitute performs that transition. Independent verification/result services execute the protected verification side. The verifier uses the existing pinned local Docker image with denied network. The Result remains PARTIAL because publication, CI and review are outside M1/ER1.

The test compares the complete admission native-execution fields and Current Truth lines to the Work projection, then compares the next provider-bound metadata, native-execution fields and Current Truth to that same post-admission projection. It also checks objective/criteria retrieval and role/JStack/potato instructions. One Run and writer exist throughout; both failed and repaired candidates remain retained.

The intentional single-duplicate fixture performs `admit → admit(ALREADY_ADMITTED) → open`; it creates one Run/writer, preserves current tokens, and receives the duplicate result plus canonical next action on continuation. A separate hostile fixture ignores the narrowed schema twice: initial admission plus two repeated proposals are charged, then the fourth attempted model step fails before provider dispatch. This does not claim that a malicious provider makes zero repeated proposals; it proves bounded deterministic loop prevention.

## Limits and safety

- Normal authenticated journey: **1 coordination + 8 productive calls = 9**. The final fresh read-only explanation allowance remains reserved at **$0.112641**.
- Single-duplicate recovery test: 2 coordination + 1 productive call before test termination. It demonstrates recovery only; it is not a second full ten-call journey.
- Hostile provider: 3 coordination calls total; next provider dispatch blocked. Limits are not increased to hide waste.
- Completion regression independently exercises ten charges including fresh admission and final fresh read-only explanation, plus empty-explanation handling. Conservative local fixture contract: **$0.085915 admission + $1.013769 completion = $1.099684 ≤ $1.30**. These are controlled pricing fixtures, not a new live pricing quote.
- Limits stay ten calls, thirty minutes, $1.30, one repair. Another repair is denied.
- Local safety regressions preserve zero unbudgeted calls, budget violations, authority bypasses, expired-authority revivals, duplicate consequential effects, lost candidates, stale-writer updates and false Ready events.
- Common-ledger tests cover restricted application/worker roles, concurrency, cancellation, UNKNOWN retention, expiry, stage exhaustion, settlement/replay and SIGKILL boundaries including writer/contract creation, dispatch, draft retention and protected verification.

## Validation and evidence

| Check | Result / artifact |
|---|---|
| Full app suite with PostgreSQL admission cases enabled | 1,353 passed; 40 existing environment-gated skips — `app-tests.log` |
| Final strengthened authenticated continuation suite | 12 passed — `authenticated-journey.log` |
| Root suite | 151 passed — `root-tests.log` |
| Completion accounting/crash/full local journey | PASS — `completion-budget.log` |
| Route concurrency/CAS/version/legacy writer SQL | PASS — `route-admission.log` |
| Work context SQL | PASS, silent successful exit — `work-context.log` |
| Worker projection/restart/scope/takeover SQL | PASS — `worker-projection.log` |
| Typecheck/capabilities/skills/executor governance | PASS; 638 classified sources, UNKNOWN=0 — `typecheck.log` |
| Production webpack build | PASS — `build.log`; existing noVNC target warning remains outside this change |
| Migration manifest | PASS, 53 ordered migrations — `migrations.log` |
| Preserved live artifacts and migrations 0051–0053 | Unchanged hashes — `preservation.json` |

An optional archival checkpoint projection command exited at its explicit missing `GAP2B_CHECKPOINT` prerequisite, before opening any database. It was not retried and is not counted as a qualification pass (`optional-archive-test-not-run.log`). The fresh PostgreSQL projection and authenticated parity checks above passed. The retained database upgrade remains previously completed evidence and was not rerun.

`source-hashes.json` pins every changed source/test/document at qualification; `artifact-hashes.json` pins this dossier. Test databases and fixture config directories were disposed by test cleanup. There was no live provider spend or temporary live provider grant. The preserved failed live window remains revoked and untouched.

## Remaining boundary

Next capability requiring evidence: **one fresh authenticated real-provider M1/ER1 admission → productive engineering → failure interpretation → one repair → protected pass → immutable PARTIAL → fresh-chat explanation**, with fresh prices and a fully fitting completion contract checked before admission. Local qualification cannot certify real-provider behavior. P0 Gap #2B and Gap #2 remain PARTIAL; M1/ER1 remains NOT QUALIFIED until that live journey passes. No authority is requested or issued by this report.
