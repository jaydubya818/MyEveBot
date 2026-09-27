# M1/ER1 Admission Context Contract Fix — local PASS

The authenticated bounded admission path now carries the current persisted Work ID, version and generation to Sofie. Native proposals must contain both concurrency tokens. The service compares the supplied values against current persisted Work before assessment and again at the final atomic SQL admission boundary. Metadata never grants writer authority.

## Required report

| Finding | Outcome |
|---|---|
| ADMISSION CONTEXT FIX | **PASS** |
| WORK VERSION PROPAGATION | PASS |
| WORK GENERATION PROPAGATION | PASS |
| MISSING VERSION DENIAL | PASS |
| MISSING GENERATION DENIAL | PASS |
| STALE VERSION DENIAL | PASS |
| STALE GENERATION DENIAL | PASS |
| AUTHENTICATED CHAT → ADMISSION | PASS — local production handlers/hooks/tool with controlled provider |
| READ-ONLY WRITER ACQUISITION | 0 |
| READ-ONLY AUTHORITY | UNCHANGED |
| COMPLETION-BUDGET REGRESSION | PASS |
| AUTHORITY BYPASSES | 0 in the qualified local cases |
| FALSE READY | 0 in the qualified native cases |
| SCHEMA CHANGE | **NONE** |
| LIVE M1/ER1 | **READY FOR FRESH REQUALIFICATION — not run or authorized here** |

## Root cause

At `f4d25fe`, `apps/eve/lib/engineering/conversation-model.ts:69` reconstructed the admission prompt using only `{workId, objective, criteria, currentTruth}`. This replaced the earlier authenticated assembly, which contained the Work version. The shared Current Truth lines did not carry the version, and the projection also omitted the persisted generation. The actual failed payload is preserved unchanged in `../2026-09-27-gap2b-live/dispatches/`.

The former controlled completion test returned `expectedWorkVersion: journey.version` directly from its fixture closure. It therefore missed the omission. That admission now derives **both** tokens solely from the actual provider-bound payload, and its exact proposal is passed to admission.

## Focused implementation

- `worker-projection.ts` adds persisted `workGeneration` beside existing `workVersion`. Its existing reread fences remain intact.
- `current-truth-lines.ts` validates and exposes canonical `{workId, expectedWorkVersion, expectedWorkGeneration}`. Work UI and authenticated assembly retain the same shared formatter.
- `conversation-model.ts` includes that metadata in bounded admission and read-only contexts, including the reserved final explanation. It instructs Sofie to copy observed values, never infer them. No provider call or extra tool lookup is added to discover tokens. Completion-budget preflight remains admission-only; observation cannot spend the implementation/repair reserve.
- Native tool/API input requires both positive integer tokens. The Work UI forwards both persisted values. `admitNativeWork` validates them and passes the originals through to `RouteAdmissionService`.
- Native route admission rejects a missing/mismatched generation; the locked SQL predicate checks the expected generation alongside expected version. Generic routes retain their existing input compatibility and also fence the server-observed generation at commit. No migration, optimistic-concurrency relaxation, provider qualification or writer bypass.
- Existing lower-level test callers were updated for the required generation argument. The generic duplicate-writer SQL fixture now copies a complete existing provider/decision binding, so it tests the intended unique-writer constraint under schema 53. Completion test telemetry is now opt-in via `NATIVE_COMPLETION_TELEMETRY`, preventing reruns from overwriting historical evidence.

The changes span the projection/formatter, prompt wrapper, native schema/tool/API/UI adapter, and admission service because both ends of the metadata contract must agree. The other edits are test callers and reviewed governance fingerprints; no unrelated feature was added.

## Required local cases

| Case | Evidence / outcome |
|---|---|
| 1. Current version + generation through authenticated assembly | PASS: real login handler → signed cookie → `routeAuth` → persistent instructions/`assembleContext` → context hook → actual Agent dynamic model → bounded provider input → model proposal → actual tool + Action Gateway → QUEUED route |
| 2. Missing version | DENY: strict tool schema and deterministic native service; preserved failed payload cannot produce a valid proposal |
| 3. Missing generation | DENY: strict native schema/service |
| 4. Stale version | DENY after persisted version changes; no route/writer created |
| 5. Stale generation | DENY after generation-only change; no route/writer created |
| 6. Work changes after assembly | DENY for both tokens, plus a real generation change immediately before final SQL admission |
| 7. Fresh context after change | PASS: reassembly supplies current persisted tokens |
| 8. Fresh read-only conversation | PASS: both tokens visible, admit absent from provider tools, direct attempt denied, zero writers |
| 9. Read-only → productive transition | PASS: explicit authenticated continuation still has no route/writer; open is denied until normal admission and separate writer acquisition |
| 10. Work UI / Chat canonical Current Truth | PASS: production assembly/payload lines checked against the canonical projection; shared formatter is rendered and compared in Work component regression |
| 11. Completion budget | PASS: atomic capacity/call-slot protection, restricted roles, UNKNOWN retention, races, cancellation/expiry, SIGKILL recovery, protected failure/repair/PARTIAL, valid and empty reserved final explanations |
| 12. No discovery provider call | PASS: deterministic assembly and metadata validation make zero provider calls; the first controlled provider call already has both tokens |

Additional local negatives cover anonymous authentication, malformed tokens and a future version. The production-path test mocks only database transport (to a disposable real PostgreSQL database) and the external provider/catalog. Global fetch throws on external access. Authentication, context binding, canonical assembly, dynamic model selection, tool execution, Action Gateway and admission remain production code. This is **in-process integration**, not a new live browser/model qualification.

## Verification

- Affected suites: **65 passed**, including **9 authenticated production-path PostgreSQL tests**.
- Full app suite: **1,350 passed, 40 skipped**. The 40 existing environment-gated skips are not counted as PASS.
- Root security/regressions: **151 passed**.
- Separate PostgreSQL context-receipt, generic route-admission and durable Work-projection suites: PASS on disposable databases.
- Completion integration: PASS with real PostgreSQL, controlled model, network-denied Docker checks and failure/recovery coverage. Initial bounded conversation reserve **$0.084471** + nine-call completion hold **$1.013769** = **$1.098240** at fixture pricing, within $1.30. Synthetic settled total remains $0.030000; no live model spend.
- TypeScript, capability registry (147 definitions / 125 tools), imported skill routing and governance: PASS. **638 classified sources; UNKNOWN=0**.
- Production webpack build: PASS. Existing noVNC top-level-await warning is unchanged from the prior qualified build.
- `git diff --check`: PASS. All 53 migration files unchanged. All **23** archived live-evidence hashes match; previous local evidence is also unchanged.

The initial generic route regression used an incomplete direct SQL INSERT and failed before its intended unique-writer check; completing the fixture resolved it without changing production safeguards. Initial new-test setup also lacked the required database configuration, correctly causing the real Action Gateway to deny it; configuring only the disposable local database resolved that test failure.

## Stop boundary

No live provider authority was issued. No live model request, old Work retry, historical database access, ER2, publication, Relay, MyFactory, deployment or other Q37 work occurred. Both historical fixtures remain untouched. The failed live qualification remains **NOT QUALIFIED** as historical evidence. Any fresh live requalification requires separate explicit authorization for the new candidate, Work, pinned resources, current prices and complete conservative plan.
