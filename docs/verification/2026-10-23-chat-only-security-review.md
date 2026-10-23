# Independent chat-only security review

Date: 2026-10-23 (America/Los_Angeles)

Verdict: **the reviewed chat-only source and opt-in readiness diagnostic are qualified, with no remaining source-level security blockers.** This is a scoped engineering review. It does not establish that production enrollment or activation has occurred.

## Scope and authorization

The user authorized CHAT ONLY for the two existing tester installations: ten turns per owner per UTC day, a $0.10 reservation per turn, $2 per UTC day across the cohort, and $10 lifetime within 120 hours. Paid Work, Factory, auxiliary models, delegation and other paid paths remain outside that approval.

The independent reviewer inspected the patch in `/tmp/myeve-auth-password-management` based on `f44eeb09`, using the security-and-hardening workflow and installed Eve documentation. Scope included the standalone central-accounting replacement, inert application migration `0109`, schema rollout requirements, tool/model/context/feature narrowing, and `GET /api/readiness?alphaEnrollment=1`. Existing accounting, model dispatch, Work authority, tool replay, route and session controls were traced where relevant.

The reviewer did not access production, private provisioning records, actual environment values, tester credentials, cookies or live accounting fingerprints. No model/provider calls, deployment, production enrollment or activation were performed. Reviewer mutations were limited to disposable localhost fixture databases and this review document; application source was not changed by the reviewer.

## Reviewed fixes and controls

- **Stale-snapshot spend-cap race resolved.** Central live admission/dispatch and the local allowance trigger require READ COMMITTED. Aggregate checks run under the canonical cohort/policy locks, with server-derived UTC time. Unsupported isolation fails closed.
- **Paid Work remains denied.** The central replacement rejects WORK reservation and retained WORK bind/assert/dispatch, including replay paths, and rejects `running_work`. Only authenticated historical hold/fence/cancel/settlement paths remain. Work/Factory capabilities and provider tool schemas are removed; executable tool authority also denies direct and resumed calls before effects. Provider instructions now state the chat-only boundary.
- **Charges cannot be recycled.** Central admission charges the full fixed allowance. Cancellation, expiry, settlement and unknown outcomes do not refund it. The existing UNKNOWN and unresolved-lease fences remain. Owner caps are $1/day and $5 lifetime; cohort caps are $2/day and $10 lifetime. Lifetime limits cover a 120-hour window intersecting six UTC dates.
- **Local narrowing is separately installed and inert.** Migration `0109` creates no policy, activation, member or allowance. Once the exact owner/policy narrowing row is installed, the trigger verifies current policy binding/activation, fixed CHAT cost and operation count, current UTC day and deadline, and local aggregate limits. Narrowing rows deny UPDATE, DELETE and TRUNCATE.
- **Authentication is preserved.** This patch does not replace owner identities, passwords, session secrets, database bindings or the deployed application-password architecture. Existing non-alpha schema requirements remain pinned.

## Enrollment diagnostic

The existing readiness route exposes a diagnostic only for explicit `alphaEnrollment=1`. It requires normal web authentication, repeats current principal verification, validates the existing production/project policy binding, and requires the principal to equal the exact policy owner.

Its response allowlist is limited to `ownerId`, `projectId`, `cohortId`, `slot`, `policySha256` and `credentialSha256`. The credential fingerprint hashes the exact validated lowercase 64-hex token as UTF-8, matching central accounting's `sha256(convert_to(token,'UTF8'))`. It is not the bearer preimage and cannot authenticate as that preimage. The diagnostic does not return the raw token, policy JSON, connection URL or exception contents; it performs no write, enrollment, activation or paid dispatch and emits no log. It executes outside cached readiness reports and returns `private, no-store` with `Vary: Cookie`.

An additional CSRF/same-origin rejection is **not required for this read-only GET**: it has no state-changing effect, remains authenticated and owner-bound, and neither the route nor inspected global configuration enables cross-origin response reads through CORS. Existing secure SameSite cookies and browser origin isolation remain applicable. Do not add permissive CORS or change this diagnostic into a mutation without another boundary review.

The retained October 22 package marked `PREPARED_NOT_APPLIED` for a different candidate is excluded. The operator must obtain facts from the verified serving runtime and separately enroll the exact known owners using legitimate operator database access. A fingerprint response itself grants no central membership or spending authority.

## Independent test results

From `/tmp/myeve-auth-password-management/apps/eve`:

```sh
MYEVE_EXTERNAL_ALPHA_TEST_DATABASE=postgres://auth_test@127.0.0.1:55482/postgres \
  /tmp/myeve-auth-password-management/node_modules/.bin/vitest run \
  lib/external-alpha/chat-only-postgres.test.ts \
  lib/external-alpha/chat-recovery-postgres.test.ts \
  lib/external-alpha/shared-accounting-postgres.test.ts \
  lib/external-alpha/tool-authority.test.ts \
  lib/external-alpha/model.test.ts \
  lib/external-alpha/features.test.ts \
  lib/external-alpha/paid-paths.test.ts \
  lib/database-schema.test.ts
```

Result: **8 suites passed, 152 tests passed, 19.17 seconds.** PostgreSQL suites use randomly named disposable localhost databases and remove them during teardown; provider dispatch in unit suites is mocked.

```sh
/tmp/myeve-auth-password-management/node_modules/.bin/vitest run \
  lib/external-alpha/enrollment-readiness.test.ts
```

Result: **1 suite passed, 9 tests passed, 181 ms.** Coverage includes initial auth denial, absent/foreign principals, exact response fields and raw-secret absence, production binding failures, malformed credentials, cache headers and separation from ordinary readiness reports.

Total independently executed: **161 tests across nine suites.** `git diff --check` also passed.

Critical PostgreSQL cases include concurrent final-slot admission, exact retry deduplication, changed-binding denial, owner/day/cohort/lifetime limits, sixth-UTC-date lifetime exhaustion, forged local allowance fields, immutable narrowing rows, stale REPEATABLE READ snapshots, altered membership, revocation, expiry, UNKNOWN fencing, retained pre-upgrade WORK denial and historical cleanup without refund.

## Release constraints and role-trust limits

1. Apply only inert `0109` to each existing application database before promoting code that requires it. Verify existing migration lineage and authentication bindings remain intact.
2. The implementation agent reports the actual central database has the base shared schema only. Install the recovery prerequisite, zero-gap upgrade and chat-only replacement in that order while the cohort remains inactive. Verify the final function definition/fingerprint and restricted role privileges before enrollment/activation. No broad callable alias may remain.
3. Verify the serving deployment independently, obtain its owner-bound diagnostic facts, and compare the exact owner/project/cohort/slot/policy tuple before operator registration. Enroll exactly the two approved slots; stage local narrowing and central membership while inactive, then activate under the user's existing approval. Never substitute the excluded prepared package or rotate environment credentials under this patch.
4. Central runtime roles must retain only authenticated-function access, without raw accounting-table mutation, schema creation or function replacement. Local runtime code must not expose arbitrary SQL or operator enrollment. These controls trust the application code and legitimate database/migration operator. PostgreSQL owners/superusers can alter functions, privileges or triggers; this review does not claim resistance to a malicious database administrator or a fully compromised runtime holding raw secrets.
5. Historical full-scope policy documents remain unchanged; their larger nominal Work limits are not permission to execute Work. The central replacement, installed local narrowing and executable release controls must remain together. Do not roll back to broader accounting/Work code after activation.
6. Keep existing deployment protection and password-management rollback constraints. COMPUTER, Work/Factory, publication, autonomous delegation and unbudgeted provider paths remain denied. Provider failures or ambiguous outcomes may consume a reservation and fence further chat; they must not trigger automatic refund or redispatch.
7. Typecheck, production build, deployed authentication/recovery checks and an actual bounded chat smoke are implementation/operator release checks. The reviewer did not independently perform production verification or observe production spending.

## Reviewed source fingerprints

| Source | SHA-256 |
| --- | --- |
| `apps/eve/lib/external-alpha/shared-accounting-chat-only.sql` | `e28bdea141c3ef25b68ca036ea4ae673b57f6cf7ae3ce84dd903c7b62a293622` |
| `apps/eve/migrations/0109_external_alpha_chat_only.sql` | `71a3cf4eb5b4bcb12d9eb451dd2e35810773bf6c247243c2250aec44b725ffd3` |
| `apps/eve/app/api/readiness/route.ts` | `69f6a42865ce6278fac2b235b62611df7972c4dd151879ac8037a6c518f93a3d` |
| `apps/eve/lib/external-alpha/model.ts` | `406f45c94c3e2605ec5ace2593ac8efedfe82256f69de35695fa6f7d1331c7d1` |
| `apps/eve/lib/external-alpha/tool-authority.ts` | `c3502cfef60044fcad91bd2daa11d31aedba4aa705323a5466b8e402d4d2acd4` |
| `apps/eve/lib/external-alpha/context.ts` | `f2e116e302b057d6b701adc68d8aa1c7bd9da67579ce5f7ce31c877d3e4d6e0b` |
| `apps/eve/lib/external-alpha/features.ts` | `37843498ce58cc1aab1190e26071c0d69f07b4ff414f35bbb890bf906753bd22` |
