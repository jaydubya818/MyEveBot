> Current status: [authorized target report](authorized-target-report.md). Three schemas are prepared with credentials revoked; hosted construction stopped at the existing Relay KMS/HSM contract. Neither external gate ran. Earlier preparation statements below are historical where superseded.

# Deployment-blocker closure report — 2026-09-20

**NO-GO — EXTERNAL QUALIFICATION PENDING.** Implementation improved; target creation did not complete. No external infrastructure was created, no target enabled, no independent assessor engaged, and neither external gate executed. Hard budget enforcement is still missing, not merely awaiting a signature.

## Required 25-point report

| # | Item | Result |
| --- | --- | --- |
| 1 | Readiness branch / HEAD | `codex/myeve-federation-production-readiness`, started clean at `6f668b9`; this report's enclosing documentation commit is the resulting HEAD. |
| 2 | MyEve source pin | Frozen `60d341f9909936f03e4d72e1a7f845721ef82c46`; locally qualified proposed successor `767b585e0d910136fef8eb421933e34a5bc8b601`. Not promoted or deployed. |
| 3 | Relay source pin | Frozen `614c638d6fc4099db8064540326f5de4438e93a1`; locally qualified proposed successor `bbfcaa18710556fc689f60990599f4734e99a720`. Not promoted or deployed. |
| 4 | Relay crypto startup | PASS locally: persistent key-provider startup, invalid/missing configuration failure, stable identity after reinitialization, existing crypto contracts. Real Next production-build smoke reaches missing-Agent-auth401. Hosted startup NOT_RUN. |
| 5 | Key custody | Prepared explicit `managed-secret` backend for approved persistent Vercel sensitive secrets. Exportable runtime custody; not KMS/HSM. Owner acceptance or existing compatible KMS/HSM reference pending. No production key generated. |
| 6 | Isolated MyEve deployment | NOT_CREATED. Existing production/exact-pin preview identified but not proved synthetic; excluded from tests. |
| 7 | Isolated Relay deployment | NOT_CREATED. Current production advanced to unrelated `7ea29b2…`; not used as frozen federation evidence. |
| 8 | Ingress solution | Server-only origin-bound Vercel bypass headers, existing app auth preserved;14 focused tests pass. No global protection weakening. Hosted token/scoping/smoke pending. |
| 9 | Peer selected | Second isolated MyEve installation at proposed successor, operated independently. Codex/Claude requester-only MCP integrations rejected as complete receivers. |
| 10 | Real peer rationale | Existing production Agent app, persistent DB/keys/replay/authority/artifacts; separate deployment and operator, no Ava service. These target properties await hosted verification. Same-platform qualification only. |
| 11 | Peer deployment/version | Version proposed `767b585…`; deployment ID/origin BLOCKED, not invented. |
| 12 | Workers | Existing MyEve pollers A/B and Relay maintenance code reused. No suitable host identified; Railway inventory only unrelated production service. Hosted worker health/retry/restart/stop NOT_RUN. |
| 13 | Database isolation | Read-only metadata confirms existing Neon resources support DB/role creation. Three empty restricted-role databases NOT_CREATED. Provisioning script syntax checked only; no isolation claim. |
| 14 | Budget enforcement | NOT_IMPLEMENTED_OR_PROVEN.120 submissions,2000HTTP, concurrency2/model1,$5,64KiB,60min remain mandatory. No hosted/model run allowed until hard aggregate controls and failure tests exist. |
| 15 | Emergency stop |25 local disabled-state probes pass. Hosted stop/revocation/worker kill/watchdog drill NOT_RUN. Procedure documented; env changes alone do not stop in-flight processes. |
| 16 | Telemetry/evidence | Non-secret local regression logs and current allowlisted metadata frozen with hashes. Hosted log/export location, provider cost reconciliation and audit handoff BLOCKED. |
| 17 | Infrastructure smoke | Local Relay production-build startup PASS; hosted health/TLS/DB/registration/signed-envelope/receiver/stop smoke NOT_RUN because three targets do not exist. No full golden path run. |
| 18 | Source commits | Relay `bbfcaa1`: startup/provider wiring and22 tests. MyEve `7852287`: ingress and14 tests/governance; `767b585`: TCP-ready migration test fixture. Readiness docs/provisioning scaffolding are separate, in this report's commit. No push/deploy/pin promotion. |
| 19 | Regression | MyEve496 Vitest tests/74 files;130 Node tests;25 disabled probes;27-migration fresh/upgrade/checksum/schema checks and2 authority integration scripts; both workspace typechecks/builds PASS; governance503 sources/0 unknown. Relay219 passed/4 skipped across46 files (43 passed/3 skipped), plus2 performance and3 browser tests; typecheck/lint/build/migration journal/frontier PASS; local production startup smoke PASS. |
| 20 | Security target | TARGET_NOT_READY. Source/evidence package prepared; exact target URLs/IDs, scope/window, assessor/stop contact and controlled access absent. Assessor must receive immutable package in separate context. Implementation cannot mark PASS. |
| 21 | Production target | TARGET_NOT_READY. Complete runbook retained; same-platform peer selected; hosted installations, workers, budget and operational smoke missing. |
| 22 | Human/operator inputs | Explicit hosted DB/role authorization; custody choice; existing worker host or approved infrastructure scope/spend; branch/protection scope confirmation; proposed-pin review/acceptance; independent peer operator/assessor, secret-reference access, telemetry custodian, stop contact/window. Hard-budget implementation still required after runtime/provider selection. |
| 23 | Security gate | **NOT_RUN** |
| 24 | Production platform gate | **NOT_RUN** |
| 25 | Verdict | **NO-GO — EXTERNAL QUALIFICATION PENDING** |

## Qualification evidence and limitations

The local MyEve full suite includes the existing48 federation cases plus14 new ingress cases;496 is the total, not an additional federation count. The root130 Node tests are separate. The25 probes cover five non-enabling flag forms across owner status/mutation, artifact access, client construction and worker startup. They do not attest hosted settings.

Relay's22 new crypto cases are included in219. Four skipped cases require external/live prerequisites and are not passes. The existing release/frontier tests are local release-policy evidence, not independent security approval. Three Playwright cases ran against a disposable local DB with a temporary port override; no production credentials/data. Performance/browser latencies are local only, not the session SLA. No separately deployed peer was tested: reuse of MyEve code coverage cannot substitute for its hosted restart/revocation/operator evidence.

Fresh locked MyEve dependencies resolved the shared-checkout dependency mismatch. An overlapping older build caused a build-lock failure; after it exited, the complete two-workspace build passed. The migration fixture now waits for PostgreSQL TCP readiness, preventing a container initialization race. Relay's actual production build initially exposed module-local provider duplication between instrumentation and route bundles; process-global symbol storage fixed it and the production smoke then passed. Final logs record successful runs; these earlier failures are retained here as rationale, not hidden qualification claims.

Local databases were disposable, loopback-only; MyEve's migration fixture reports cleanup, and the separate Relay container and volumes were removed. No personal application row was queried, copied or seeded. No private keys/tokens/database URLs are included in evidence. Source pin promotion needs owner review of these separate fixes and the newly frozen deployment matrix.

## Authorized work completed and stop boundary

The implementation mission authorized the focused source fixes and read-only inventory. Automatic approval review rejected hosted creation of three empty Neon databases/roles, treating it as a persistent external mutation using production administrative credentials that needs explicit owner authorization. The command did not execute. No fallback creation was attempted. The preparation script was subsequently written locally and syntax-checked only; credentials are neither generated nor stored until a future explicitly approved execution.

Three authorization questions remain unanswered: database creation; acceptance of runtime-exportable sensitive-secret custody versus KMS/HSM; existing worker host or maximum infrastructure spend. No permission is inferred from elapsed time. There was no authorized way to complete the hosted target in this turn.

Remaining work after decisions: review/harden provisioning against actual role privileges; create only empty approved databases, verify all non-system-schema and cross-database denial boundaries; migrate; resolve branch secret inheritance and ingress blast radius; deploy three immutable targets; configure supervised workers and hard atomic budget/deadline/cost controls; run only infrastructure smoke with tested stop; freeze exact target IDs/URLs/keys/roles and assign independent operators. Do not execute S01–S18 or P01–P17 during that implementation work.

The budget is a material implementation gap: existing rate windows, estimated per-work spend and provider soft alerts cannot prove the required hard aggregate ceiling. A future implementation must fail closed on missing counter/state or uncertain provider usage, reserve worst-case in-flight cost before admission, meter retries/worker traffic, bound streamed artifacts and persist limits across restart. It needs actual configured price/token limits or a demonstrable provider hard stop. No paper-only control is labeled enforced here.

See [deployment target](deployment-target.md), [session envelope and golden path](qualification-session.md), [assessor handoff](assessor-target.md), and [machine-readable target](target-manifest.json). The [new evidence manifest](evidence/blocker-closure/manifest.json) freezes local preparation only. A new immutable manifest is mandatory after operator-approved deployment; previous preparation digests remain historical.
