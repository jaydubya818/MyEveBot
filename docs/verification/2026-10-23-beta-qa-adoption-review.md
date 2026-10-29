# Independent review — beta QA adoption

Date: 2026-10-23 (America/Los_Angeles)

**Verdict: no remaining source-level security or quality blocker found in the final reviewed adoption.** This qualifies a source candidate for the owner's review; it does not authorize deployment, production SQL, paid execution or additional capabilities.

## Reviewed scope

Reviewed the resolved diff in `/tmp/myeve-auth-password-management`, branch `codex/beta-qa-adoption-20261023`, against `931487c4db417321c7382285096fd27eaf378558`. The port adopts the application/test delta from QA #95, `39ef79cfe021b5ef78e5de990fc45cb72a3c3c37`, against its original base `252d4c8f19f6c52368930710e80ae3499fe8612d`; it preserves the current serving-release lineage and preceding six-feedback fixes.

The review covered owner/session authorization, CSRF origin comparison, cached-page recovery, safe thread identifiers and deletion failure, stale-resource/action behavior, cancellation/reattach messages, touch/landscape interaction, retained-candidate fetch errors, activity states, preview proof labeling, new regression tests, dependency delta, nondeploying branch guard and CI wiring. No MCP adapter, migration, accounting authority, quota, grant or paid Work/Factory change was adopted.

The reviewer accessed source and synthetic local artifacts only, ran local unit/DOM tests and wrote this report. No production credentials, tester cookies, private provisioning records or production services were accessed. No application source was edited by the reviewer. No paid model call, deployment, production database mutation or role change was performed.

## Findings corrected before acceptance

| Finding | Final correction and evidence |
| --- | --- |
| Retaining every failed resource read could leave approvals and Work controls actionable from stale projections. | `useProductResource` fails closed by default. Only the display-only Weekly review explicitly retains and labels stale history. HTTP 401/403/404 clear even opted-in retention. Polling, cancellation, concurrent-load guard and request bounds remain. Real-hook regressions pass. |
| Imported delete helper bypassed existing safe URL-segment handling. | It now uses the existing `threadApiPath` helper, retaining empty/dot rejection and single-segment encoding. Real helper and existing owner-conflict tests pass. Server-side signed owner authorization remains unchanged. |
| Optimistic deletion discarded unsynced local chat/draft and restored only metadata on failure. | Local chat, draft and index remain until a successful server response. An unconfirmed outcome shows an honest error; callbacks after owner-boundary unmount cannot clear a newly bound namespace. The built-app fixture proves failed deletion retains unsynced history and draft through reload without duplicate metadata. A lost acknowledgment is not a guarantee that the server did not delete. |
| Cached-page restoration always sent valid users to Login. | Persisted `pageshow` hides private children and reloads the canonical signed gate. Existing storage/401 redirects remain. The final browser run proves both valid-session continuation and signed-out rejection; the independent DOM test verifies reload, cleanup and no forced Login navigation. |
| New landscape overlay lacked usable close/backdrop and keyboard focus handling; its first correction still delayed focus behind visibility animation. | CSS and JavaScript use the matching narrow/short viewport condition. Close/backdrop are visible, visibility changes immediately, focus moves after layout, Tab stays in the drawer, Escape closes it and focus returns. Final real-browser QA-12 assertions pass at 844×390. |
| Reattach warning covered zero-event failures but missed a stream that failed after partial output. | Any caught stream failure sets the incomplete flag. The actual hook is tested; source wiring was inspected. No paid or live provider stream was exercised. |
| Meter text fell slightly below required contrast in the new retained-history browser fixture. | Normal text color replaces subtle text in loaded and unavailable meter states. Final desktop/mobile targeted accessibility checks report no serious/critical violations. |

Public Login/Forgot Password/Reset Password exemptions, the non-successful status gate, 15-second verification bound, retry UI, browser-owner header, private-UI mount gate, status cancellation and listener/fetch cleanup are preserved. Loopback aliases are normalized only outside production; production still compares exact scheme, host and port and rejects cross-site mutations. Negative origin tests include scheme/port mismatch, sibling localhost, malformed/null origin and production alias denial.

Application password hashing, credential/session versions, owner identities, browser namespace formats, database bindings, nonrefundable reservations, trial windows and paid-path denial code are unchanged. Candidate decision writes retain their existing exact binding and server authorization. The QA source cannot replace those checks.

## Independently executed checks

Commands below ran from `/tmp/myeve-auth-password-management/apps/eve` using `/tmp/myeve-auth-password-management/node_modules/.bin/vitest`.

Pre-resolution owner-boundary baseline:

```sh
vitest run lib/web-auth.test.ts lib/owner-browser-storage.test.ts \
  lib/thread-owner-conflict.test.ts lib/threads-route-owner-conflict.test.ts
```

**34/34 passed, four suites, 225 ms.** This earlier check is not presented as the final merged-component qualification.

Resolved adoption:

```sh
vitest run components/owner/candidate-decision.test.ts \
  components/qa-silent-failures.test.ts components/owner/resource.dom.test.ts \
  components/task-runs-panel.dom.test.tsx components/task-run-card.test.tsx \
  components/task-run-card.dom.test.tsx lib/web-auth.test.ts \
  lib/chat-reattach-notice.dom.test.ts components/owner/qa-medium.test.ts \
  components/owner-session-boundary.dom.test.tsx lib/thread-delete.test.ts
```

**62/62 passed, 11 suites, 1.32 seconds.** After the final BFCache correction, independently reran:

```sh
vitest run components/owner-session-boundary.dom.test.tsx
node --test test/capability-notice.test.mjs
```

**6/6 passed in 344 ms; 7/7 passed in 128 ms.** Counts overlap and must not be summed into one distinct-test total. The existing fixed-schema PostgreSQL suite was deliberately left to the implementation agent to avoid concurrent fixture interference.

`git diff --check` passed. Independent programmatic lock comparison found zero existing package version or integrity changes. The only new dependency is pinned dev-only `happy-dom@21.0.4` plus four dev transitive entries; its lock entry declares no install lifecycle script. This was a scoped dependency/provenance review, not a fresh advisory audit.

## Additional qualification evidence inspected

The following runs were performed by the implementation agent; the reviewer inspected their logs/receipts rather than independently launching the browser/build/PostgreSQL jobs:

- `affected-tests.log`: **279/279 tests, 28 suites, exit 0**, including disposable local PostgreSQL password/session revocation and chat accounting. This run predates the final BFCache change; its changed DOM suite was independently rerun above.
- `typecheck.log`: full app typecheck, capability registry, imported routing and executor governance passed; **903 classified sources, UNKNOWN=0**.
- `production-build-release.log`: final Next production artifact **`t47U1026yhJmFEyv6ddbk`, exit 0**. The retained optional MyApps asset warning does not qualify MyApps.
- `hosted-eve-build.log` and `pg-bundle.log`: local hosted-artifact build/check exited 0; both workflow/server functions bundle pg with zero unresolved runtime pg loads. This is no claim of a live hosted deployment.
- `qa-browser-release/report.json` and `qa-browser-release.log`: **5/5 passed, zero unexpected/flaky/skipped**, including landscape close/focus/Shift+Tab/Escape/focus return, touch font size, current account tap targets, and valid/signed-out persisted-page restores.
- `browser-release/receipt.json`: **PASS on `t47U1026yhJmFEyv6ddbk`**, using the real built UI with signed synthetic owners and intercepted local resource responses. It covers the preceding six fixes, unconfirmed-delete preservation through reload, quota/error/retry states, draft retention, owner switching, bounded expanded details and desktop/mobile composer visibility. Targeted accessibility checks show no serious/critical violations. Receipt records **zero paid operations and zero production mutations**.

Evidence root: `/Users/jaywest/Myeve/output/beta-qa-adoption-20261023/`. The reviewer also inspected expanded mobile layout imagery. Failed intermediate compiler and browser attempts remain in separate logs; they are not passing evidence.

## Limits and release constraints

- Review the qualified source candidate without deploying it. The branch's Git deployment guard remains disabled, and no production accounting `status` replacement, environment/credential change, enrollment, activation or trial reset is authorized here.
- Synthetic persisted events exercise the real recovery handler; native BFCache retention and physical iOS or network transitions were not measured.
- Browser interception proves UI behavior, not live service integration. Provider-boundary tests prove instruction delivery; actual generated refusal, concision and preference adherence remain unmeasured. Any later live smoke must remain bounded by separately authorized quota and the existing runbook.
- Some adopted helper tests mirror implementation patterns. The verdict relies on inspected production wiring, actual hook/component DOM coverage, existing server owner tests and the built-app delete/owner-isolation/browser checks rather than those mirrored tests alone.
- A displayed task, allowance or historical review never grants execution permission. Existing signed-principal, exact action binding, current-state and accounting checks remain authoritative.
- Hosted CI on a future successor commit has not been run by this reviewer. Prior QA/main CI and an earlier build do not qualify a changed successor automatically.
- The adjacent adoption qualification accurately separates production-preservation observations performed by the implementation agent from source qualification; those production observations were not independently repeated by this reviewer. Its deletion wording was corrected to avoid claiming an unchanged server state after a lost acknowledgment.
- Relay MCP and Factory pairing remain separate, unimplemented and unqualified stages. No approval for those stages is inferred from this review.

## Final source fingerprints

| Source | SHA-256 |
| --- | --- |
| `apps/eve/lib/web-auth.ts` | `216311cfe5e4c801d2f0e2b0ccc150dfadf2c4a4df33c39b0582fc38f7d70680` |
| `apps/eve/components/owner-session-boundary.tsx` | `ce4d9d4b5d0d36efea097765dfa2acff6c165b00bfb10258fb4c1fa42cca5fe9` |
| `apps/eve/lib/thread-delete.ts` | `9522cffa05970f4690af2ed264d4526eaeb8b91ee30a06662cf51bf4d438f5f0` |
| `apps/eve/components/owner/resource.ts` | `1e004e076d122cc8a0e641cca7a926f6a56fffac063a546f72c81e41906a1ec1` |
| `apps/eve/components/owner/product-hubs.tsx` | `cef2e997fc66a64d83bed68707ba4a7a39632e14768d826cdf7efe3d700859b0` |
| `apps/eve/app/chat.tsx` | `c428327b7f0dc503030d266a9c462269adc5db65ca5fb10574f9e47feaf301d9` |
| `apps/eve/app/globals.css` | `22d4471fdbb1c33c6695fb0c03a5db591cc26be16c30cf13c8438387fbceaa5e` |
| `apps/eve/components/owner/beta-chat-usage.tsx` | `ae40cfe8a229d357e7ef10cd05650675383c4374231cc61c906c8b0a0264eefe` |
| `.github/workflows/ci.yml` | `ae890aca504932db574ce901d7f6565be2ffa8bfd65668c8a56ff0a84c83d529` |
