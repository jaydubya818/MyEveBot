# Sofie self-test — local + isolated Preview

Date: 2026-09-12 PDT (2026-09-13 UTC)  
Final task: `task_d4c004a0-27f6-4301-8957-860cde2df7f2`  
Result: **FAIL — 5 of 6 required checks passed**

## Executive result

All three approved specialists ran in real browser sessions against Local and the disposable isolated Preview. Each of the six critical-path checks has one redacted JSON evidence artifact stored in Vercel Blob with its metadata persisted in Neon.

The suite correctly refused to report success because Preview did not match Local for identity and primary navigation: Preview showed `Sofie`, but not the `Hey Jay` greeting, and exposed 13 interactive elements versus 23 on Local. This is a genuine product assertion failure, not a specialist execution error, so it was not retried.

Run duration: 2 minutes 57 seconds  
Model usage: 20 of 40 steps  
Estimated model cost: $0.207 of $5.00  
Specialist attempts: one per specialist; no assertion retry

## Acceptance checks and stored evidence

| Specialist | Check | Result | Artifact | SHA-256 |
| --- | --- | --- | --- | --- |
| Functional & State | Local critical flow | PASS | `artifact_09fcb27d-4c72-4f61-b448-4e4fd90e51f3` | `c5adb384d75b813e083c144f6722f449400ccc5250590607bb3f4d4c968e231c` |
| Functional & State | Preview critical flow | PASS | `artifact_b1fa0fd1-2ead-4b82-a122-78aa06c3c5e4` | `a7a0e330965d67039f2644ecddee576c0b3af6d799a7cb454904b69d2cb6581d` |
| UX & Accessibility | Sofie/Jay identity and primary navigation | **FAIL** | `artifact_5cf82048-c1ca-4783-b1b7-ed387ee77148` | `defefc2de73d89d732375443d284009c1f2f6ce6c7a524512d868354b1999245` |
| UX & Accessibility | Responsive and keyboard usability | PASS | `artifact_675e9bfe-0386-4c08-ae5c-5ba49ce50c72` | `e4284a48216d43871f3174c522938ef835146d1c991ddb197369f090b583229d` |
| Trust & Resilience | Preview authentication and owner-data boundaries | PASS | `artifact_a72e6c35-48d8-4e80-8d55-d4d7a155bf69` | `c8166da4e3784a849471b12705d77a0ca3415839c8e35c3c190846411548efd5` |
| Trust & Resilience | Explicit failure and recovery states | PASS | `artifact_ba4d5f7d-b050-4a22-83f7-18b52a93f7dd` | `2dc32fda63b536632190ac17f0201c9a9628c3462e27284e5d6991647cce72f9` |

## Detailed findings

- Local critical flow: home/chat, Manage, Activity, and System readiness loaded without blocking errors.
- Preview critical flow: the same critical pages loaded through the isolated credential broker without blocking errors.
- Identity/navigation: Local contained `Sofie`, `Hey Jay`, and 23 interactive elements. Preview contained `Sofie`, omitted `Hey Jay`, and contained 13 interactive elements. **Release blocker for parity.**
- Responsive/keyboard: both targets remained usable at 390 × 844; Tab reached an interactive control; neither target reported page errors.
- Authentication/data boundary: missing and tampered Preview sessions failed closed; no owner data or brokered secret appeared in responses.
- Failure/recovery: both targets exposed explicit loading/readiness, empty, error/failure, cancellation, and retry language rather than silent or stuck states.

## Balanced guardrails

| Guardrail | Confirmation |
| --- | --- |
| 15-minute runtime | Persisted as a 900-second deadline and enforced by the task budget checks before model work and completion. This run finished well inside the boundary; the suite did not deliberately consume 15 minutes merely to trigger it. |
| Three specialists | Enforced by the completion gate; Functional & State, UX & Accessibility, and Trust & Resilience all completed in this run. |
| 40 model steps | **Observed live.** Diagnostic task `task_6746410b-c390-45d9-8b8e-c5e5bcc668e6` stopped at exactly 40/40 with `Model-step hard stop reached (40/40).` |
| One retry per specialist | Atomically bounded to fewer than `1 + max_retries_per_specialist`; the diagnostic gateway-rate-limit run exercised the initial attempt plus the single orchestration retry and then failed closed. Genuine assertion failures are not retried. |
| $5 estimated cost | Persisted as `$5.00` and enforced at or above the threshold before further work and before completion. This run cost $0.207; the suite did not intentionally spend $5 to trigger it. |

The time and cost boundaries are confirmed by the persisted contract and server-side enforcement paths. The step and retry boundaries additionally have live task evidence. Intentionally burning 15 minutes or $5 would add no product confidence and was not performed.

## Build and automated checks

- TypeScript: PASS — `npm run typecheck --workspace=eve-agent`
- Node test suite: PASS — 13/13 tests with `node --test apps/eve/test/*.test.mjs`
- Disposable Preview build: PASS — Vercel production build and type validation completed before browser QA

## Credential and environment cleanup

- Temporary Sofie application credentials: removed from the runtime by stopping the isolated QA server; exact-value repository scan returned no matches.
- Temporary Vercel automation bypass: revoked; the project reports zero remaining `automation-bypass` entries.
- Disposable Preview deployments: both QA deployments removed and the final test deployment is no longer resolvable by Vercel. The pre-existing protected Preview remains intact and Ready.
- QA browser sandboxes: all three orphaned microsandbox processes terminated.
- Local app: restarted from `.env.local` without temporary QA credentials; `http://127.0.0.1:3000/` returned HTTP 200.

## Release decision

**NO-GO for Local/Preview parity.** The infrastructure, trust boundary, responsiveness, and critical routes passed, but the Preview identity/navigation surface is incomplete. Fix the Preview rendering/configuration discrepancy, create a new disposable Preview, and rerun the same six-check suite before treating this feature as shippable.

## Follow-up diagnosis

Post-run inspection found that the identity assertion sampled the home route after a fixed 1.8-second delay even though the greeting depends on an asynchronous owner-scoped thread request. The failing artifact is therefore classified as a likely QA timing false positive rather than a confirmed product defect. The harness now waits up to 10 seconds for explicit route-specific product markers and records readiness for home, Manage, Activity, and System independently. This report remains **NO-GO** until a fresh isolated Preview rerun produces replacement passing evidence; historical evidence is not rewritten.
