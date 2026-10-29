# Six confirmed beta feedback fixes — qualification

**Result: qualified source, ready for an authorized rollout. No application deployment or production accounting SQL was performed.**

Branch: `codex/beta-feedback-20261023`. Base: `5895b129b61c22b1bd276c8ddcdedfd0048228da`, the serving PR #99 chat-only/password-management lineage. Git deployment for this branch is explicitly disabled before any push.

| Issue | Minimal correction | Evidence |
| --- | --- | --- |
| Sofie offers unavailable bookings/purchases/card charges | Mandatory per-turn refusal-first limitations; no disabled tool schemas or backend grants added | Original tester transcript; missing original rules reproduced from serving source; provider-boundary cases for booking, correcting an earlier offer, email and Factory; dynamic instruction assembly; compiled hosted instructions present |
| Today reports Work connection failure while Work is healthy | Remove Today's unused legacy Work read; existing canonical WorkInbox remains | Actual serving Today React component reproduces exact warning with canonical inbox succeeding; final built-app browser passes same failure injection; real inbox outage remains visible and retryable |
| Daily turn allowance hidden | Owner-wide central reservation count and remaining quota, refreshed on activity/focus/online/UTC polling | Real PostgreSQL central-only lost-acknowledgment reservation, last-turn/concurrency, UTC rollover and lifetime tests; built UI exhaustion and refresh checks |
| Daily/trial budget hidden or ambiguous | Personal $1/day/$5 trial permanent reservations plus separately labeled recorded model cost; static $2/day/$10 cohort ceilings | Two-operation allowance does not double count quota; measured settlement never refunds reservations; owner/policy isolation; pending/UNKNOWN labels; effective local/central expiry and revocation |
| Replies ignore concise/latest style preferences | Explicit simple-response default and latest preference application, with requested detail retained | Supplied tester feedback; current prompt and complete latest preference/history reach mocked provider; no claim of cross-conversation memory |
| Unexplained SofieDirect Agent chip | Hide direct-Agent chip inside external-alpha installations | Original condition shows chip for primary agentId; real built alpha UI with primary-agent thread hides chip and View Agent link; identity/thread bindings unchanged |

## Passed checks

- **165/165** affected tests across nine suites, including disposable PostgreSQL, authenticated API, denied tool paths, owner isolation, context preservation and current prompt assembly.
- Independent reviewer ran affected suites separately, found and required the effective local expiry/revocation display fix, and independently verified its correction. Final verdict: no remaining source-level security/accounting/privacy blocker. See [independent review](2026-10-23-beta-feedback-review.md).
- Actual production Next.js build: `Gl1-EWL7ZCMANOsGnXiVp`, exit 0.
- Real built-app Chrome UI with synthetic resources: PASS on desktop and 390×844 mobile, collapsed and expanded details, composer enabled/in view, no horizontal overflow, no serious/critical targeted accessibility findings, retry without losing an unsent draft, and same-browser owner switching without thread/draft/usage leakage.
- Full TypeScript, capability registry, imported skill routing and executor governance pass: **898 classified sources, UNKNOWN=0**.
- Hosted Eve production compiler passes after an explicit missing-OIDC diagnosis and read-only local build-context refresh. The first isolated build lacked VERCEL_OIDC_TOKEN and was rejected; its output was not used. The successful build includes current mandatory capability instructions.
- `pg` bundle check: workflow and server artifacts both include the driver, with **0 unresolved pg loads**.
- Existing password/session implementation and all application migrations remain byte-identical to serving source. No new dependency, service, table, account, privilege, activation, paid Work route or budget allocation is introduced.

## Live preservation check

At `2026-10-23T19:40:27.684Z`, read-only Vercel/app requests confirmed:

| Installation | Unchanged serving deployment | State | Health | Existing owner session/history |
| --- | --- | --- | --- | --- |
| Tester 1 | `dpl_2wdFaM1iW2aA3h5TTFkQ86UZrXTy` | READY, source5895b129 | HTTP200 ready | Original owner valid;9 retained threads readable |
| Tester 2 | `dpl_5tHNcxjB7Y9Ny6i3pQ6ffJhbWeQf` | READY, source5895b129 | HTTP200 ready | Original owner valid;4 retained threads readable |

Project settings and environment references matched retained release records. No live tester message, model call, conversation mutation, password change, session revocation, policy change, ledger update, new deployment or domain change was performed by this feedback fix.

## Scope and release prerequisites

No new live-model response was generated during qualification. The tests prove the current refusal/style policy reaches the provider and disabled execution remains denied; they do not measure whether a probabilistic model follows that policy in every reply. A bounded post-release refusal/conciseness smoke must use the existing owner allowance, never extra/reset quota. Existing confirmed tester responses are the behavioral reproduction evidence.

Deployment also requires the reviewed read-only `status` addition to the existing central accounting function. That source-only replacement preserves all existing mutation branches, grants, policy records, activation, expiry and nonrefundable history. The UI reports usage unavailable until the function is installed; it never infers authoritative remaining quota from incomplete local rows. See the [rollout and rollback runbook](../operations/beta-feedback-release-20261023.md). Neither this report nor independent review authorizes a production change.

Evidence: `/Users/jaywest/Myeve/output/beta-feedback-20261023/` contains reproduction and built-browser receipts/screenshots, affected test/typecheck/build logs, successful hosted build and bundle checks, and production-preservation readback. All browser/database fixtures are synthetic or localhost-only. Production tokens and connection strings are excluded.
