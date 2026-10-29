# Independent beta feedback review

Date: 2026-10-23 (America/Los_Angeles)

Verdict: **no remaining source-level security, accounting or privacy blocker was found in the reviewed feedback patch.** The patch is prepared for review only. The user has not authorized deployment or production SQL changes for this work.

## Scope

Reviewed the uncommitted patch in `/tmp/myeve-auth-password-management`, branch `codex/beta-feedback-20261023`, based on serving-source commit `5895b129b61c22b1bd276c8ddcdedfd0048228da`.

| Confirmed issue | Reviewed correction | Evidence and limits |
| --- | --- | --- |
| Today displays a Work connection warning despite its canonical inbox succeeding. | Today stops requesting its unused legacy Work list; its canonical `WorkInbox` remains responsible for current Work and genuine failures. | Source inspection and the implementation agent's actual-old-source reproduction receipt. Built-UI receipt reports both successful inbox and genuine-outage/retry coverage. |
| Sofie implies it can book, purchase, charge cards or contact people. | Mandatory provider context explicitly states unavailable actions first, corrects earlier misleading claims and limits alternatives to accurate chat assistance. | Provider-boundary tests retain these rules and remove unsupported execution tools. Actual generated model responses were not evaluated by this reviewer. |
| Replies are unnecessarily verbose. | Context requests concise answers by default while preserving requested or necessary detail. | Instruction assembly/provider-boundary coverage; generated output quality remains a model-behavior qualification limit. |
| Follow-up preferences/context are acknowledged rather than applied. | Context directs application of the latest relevant preferences; tests preserve the actual latest instruction and earlier user context through the provider boundary. No unsupported cross-conversation memory promise is introduced. | Provider-boundary and persistent-agent assembly tests. These prove delivery of context, not perfect model adherence. |
| Personal turns and budget usage are missing or unclear. | An owner-authenticated read-only endpoint combines authoritative central reservations with separately labeled local measured usage, UTC reset and effective trial state/expiry. | Real PostgreSQL, API and UI regressions, including central-only reservations, multiple operations per turn, unavailable reads and owner isolation. |
| The primary Agent chip is unexplained in the beta. | The chip and its Agent link are hidden in external-alpha chat; ordinary non-alpha behavior remains unchanged. | Source inspection and built-UI receipt with preserved synthetic conversations. |

The reviewer inspected application source and synthetic local evidence only. No production access, credentials, private provisioning records, live tester cookies, paid model calls, deployment, enrollment or activation were used. Reviewer mutations were limited to disposable localhost test databases and this document; application source was not edited by the reviewer.

## Security, accounting and privacy findings

The central `status` branch authenticates the exact existing owner/cohort/slot/policy/credential tuple and returns before row locks or mutation branches. A real read-only transaction test succeeds and proves no admissions, local allowances or dispatches are created or altered. The browser-facing GET ignores caller-supplied identities and mutation modes, repeats current signed-principal verification, requires the exact installation policy owner, and sends private/no-store responses varying on Cookie. Accounting failures return a generic unavailable state instead of fabricated zeros or private error contents.

Reservations are read from the authoritative central ledger, including reservations whose local acknowledgment was lost. They remain charged across failure, cancellation, expiry and settlement. Measured usage is aggregated separately from settled SOFIE operations attached to this owner's exact policy and CHAT allowances. Multiple operations do not multiply a turn's reservation. Pending/unknown usage is identified, measured cost does not restore quota, and the daily measured label refers to the turns' admission day rather than claiming invoice attribution by settlement date.

The projection returns this owner's totals, fixed configuration ceilings, effective remaining quota and coarse availability. It does not return current cohort consumption, other-owner identifiers or other-owner totals. Returning such aggregates for a two-owner cohort would reveal the other owner's activity by subtraction; the implemented response avoids that disclosure. Strict response schemas reject unexpected fields.

Review found and required a **P2 display-accuracy fix**: local policy inactivity, expiry or revocation originally appeared only as a temporary pause while the displayed expiry came from the cohort. The final helper now derives effective owner state, uses the later required activation and earlier applicable expiry, and preserves coarse shared pausing. Local-only expiry/revocation fixtures pass without changing the central policy. The synthetic clock fixture was corrected while preserving its activation-after-creation CHECK constraint.

The UI removes stale figures on refresh failure, offers a retry, refreshes on turn activity/focus/online/visibility, and distinguishes quota from immediate availability. Expanded details now have a bounded scrolling area so they cannot consume the entire chat layout. The final built-browser run passes expanded-panel/composer viewport assertions on desktop and mobile; the reviewer also visually inspected the expanded mobile screenshot and confirmed the composer remains visible and usable.

No budget limit, paid admission, refund, replay, UNKNOWN fence, Work/Factory denial, application password, owner identity, session secret or database binding is broadened by this patch. The branch is explicitly excluded from Git deployments in `vercel.json`.

## Independent tests

Commands were run from `/tmp/myeve-auth-password-management/apps/eve`. PostgreSQL suites create/drop randomly named disposable databases on the authorized localhost fixture; provider calls in unit suites are mocked.

Initial broad affected run:

```sh
MYEVE_EXTERNAL_ALPHA_TEST_DATABASE=postgres://auth_test@127.0.0.1:55482/postgres \
  /tmp/myeve-auth-password-management/node_modules/.bin/vitest run \
  lib/external-alpha/chat-only-postgres.test.ts \
  lib/external-alpha/usage-route.test.ts \
  components/owner/beta-chat-usage.test.tsx \
  lib/external-alpha/context.test.ts \
  lib/external-alpha/model.test.ts \
  lib/external-alpha/features.test.ts \
  lib/external-alpha/tool-authority.test.ts \
  lib/external-alpha/paid-paths.test.ts
```

Result: **155/155 passed across eight suites, 17.86 seconds.**

After the effective-state correction, added boundary cases and fixture correction, the changed suites were independently rerun:

```sh
/tmp/myeve-auth-password-management/node_modules/.bin/vitest run \
  lib/external-alpha/model.test.ts \
  lib/external-alpha/context.test.ts \
  components/owner/beta-chat-usage.test.tsx \
  lib/external-alpha/usage-route.test.ts

MYEVE_EXTERNAL_ALPHA_TEST_DATABASE=postgres://auth_test@127.0.0.1:55482/postgres \
  /tmp/myeve-auth-password-management/node_modules/.bin/vitest run \
  lib/external-alpha/chat-only-postgres.test.ts

/tmp/myeve-auth-password-management/node_modules/.bin/vitest run \
  agent/instructions/persistent-agent.test.ts
```

Results: **43/43 passed** in 384 ms; **14/14 PostgreSQL cases passed** in 20.29 seconds; **4/4 instruction-assembly cases passed** in 412 ms. These are overlapping follow-up runs and should not be added to the initial broad count. `git diff --check` passed.

The reviewer also inspected the implementation agent's final `output/beta-feedback-20261023/affected-tests.log`: **165/165 passed across nine suites, 20.23 seconds, exit 0**. This final combined run was performed by the implementation agent, separately from the independent runs above. The implementation agent reports a passing production build (`Gl1-EWL7ZCMANOsGnXiVp`) and full typecheck/governance validation (898 sources, zero UNKNOWN entries).

## Browser evidence and remaining qualification limits

The reviewer inspected the implementation agent's receipts at:

- `/Users/jaywest/Myeve/output/beta-feedback-20261023/reproduction/receipt.json`: the old Today component reproduced the reported legacy Work warning while the canonical inbox succeeded.
- `/Users/jaywest/Myeve/output/beta-feedback-20261023/browser/receipt.json`: final PASS on production build `Gl1-EWL7ZCMANOsGnXiVp` with synthetic resource responses. It reports usage/exhaustion/error/retry, preserved draft, hidden chip, owner switching, desktop/mobile reflow, visible composer and no serious/critical targeted accessibility violations. It records zero paid operations and zero production mutations.
- `/Users/jaywest/Myeve/output/beta-feedback-20261023/browser/mobile-expanded.png`: visually inspected by the reviewer; the expanded budget panel scrolls within its bounded area, and the enabled composer remains fully visible at a 390-pixel viewport width. The final browser test also asserts the expanded panel is at most 161 pixels high and the composer is enabled/in view on both desktop and mobile.

The reviewer inspected the final browser test source, receipt and expanded mobile screenshot but did not independently launch that browser run. Browser resource interception is useful UI evidence but does not replace the real PostgreSQL/API boundary tests or evaluate model-generated responses. Actual concise/preference/refusal behavior must not be represented as newly measured live-model behavior by these tests. The reviewed release note, `docs/operations/beta-feedback-release-20261023.md`, correctly retains this limit and requires a bounded, authorized post-release smoke within existing quota; it does not authorize production changes or a trial/budget reset.

## Release and role-trust constraints

- Keep this branch nondeploying. No production SQL, role, environment, policy, credential or budget change is authorized by this review.
- A later authorized rollout must separately apply and verify the reviewed read-only `status` function replacement. Current accounting that lacks this mode must produce an honest unavailable UI state; do not widen table privileges, fabricate remaining quota or call a mutating admission function to simulate a read.
- Central runtime roles remain restricted to the authenticated function. The legitimate database/migration operator and deployed application code are trusted; PostgreSQL owners/superusers can replace functions, privileges or triggers. The view is observational and must never become admission authority.
- Preserve nonrefundable reservations, fixed personal/cohort ceilings, original trial windows, immutable history and all paid Work/Factory/auxiliary-path denials. A displayed balance is a snapshot; live authority is rechecked on send.
- Preserve prior authentication qualification and deployment protection. No rollback to legacy deployment-password code is permitted after a password has changed.

## Reviewed source fingerprints

| Source | SHA-256 |
| --- | --- |
| `apps/eve/lib/external-alpha/shared-accounting-chat-only.sql` | `c1ee56e72f20fae8e277a2bcada1644583dd3de0e9c69114f5d2b20eaca3cb14` |
| `apps/eve/lib/external-alpha/usage.ts` | `dab3f2244686ed5c4989d0aaf5d25ba5b414ea3ee0411f0ac0d7a82aa2bd8e6b` |
| `apps/eve/lib/external-alpha/usage-contract.ts` | `3bf30610e8b3f5275337d980f379cad9b4b6babada7c40ca20465c4028bc9a5b` |
| `apps/eve/app/api/chat-usage/route.ts` | `5fedc463f25782aff83282211b9df858315c5fc7aa335061cadc0d20634be8aa` |
| `apps/eve/components/owner/beta-chat-usage.tsx` | `79f1437674dffe539a657315fb5981781b9f055e563d73e1e9a4556b0cef0619` |
| `apps/eve/components/owner/integrated.tsx` | `d40cbda3e53e30bef93457c7d176bddcdfdc46f3befb351f25b24d7d2ecc270f` |
| `apps/eve/lib/external-alpha/context.ts` | `c49768d5de784624d12d53a006b55dd51ac46211b94ca3be81528bced6138154` |
| `apps/eve/app/chat.tsx` | `92ef89492673adac053e4bf21f7c5370b53df314e752e5ea449d809d3a90749b` |
