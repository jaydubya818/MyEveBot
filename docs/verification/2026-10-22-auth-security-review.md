# Independent authentication security review

Date: 2026-10-22 (America/Los_Angeles)

Verdict: the reviewed source is qualified, with no remaining source-level security blockers. Production release remains conditional on the serving-deployment checks and real-browser qualification described below. This is a scoped engineering review, not a security certification.

## Reviewed scope

The reviewer worked independently from the implementation agent in `/tmp/myeve-auth-password-management`, branch `codex/auth-password-management-20261022`, against serving-source baseline `1582df4a`. The reviewer read the `security-and-hardening` skill and inspected the tracked diff and new files. Review covered:

- Password hashing, verified legacy-password bootstrap, database credentials, and installation namespaces.
- Login, authenticated password changes, public reset completion, and the owner-issued reset CLI.
- Signed sessions, credential-version revocation, legacy-cookie preservation, and existing protected API/Eve entry points.
- Migration `0108_application_passwords.sql`, schema rollout requirements, rate limits, bounded request parsing, CSRF controls, and reset expiry/replay/concurrency.
- Settings, login, Forgot Password, Reset Password, and their root browser-session and application-shell wrappers.
- The password-management deployment and rollback runbook.

The review did not access production credentials, temporary tester passwords, reset links for real users, or production application data. The reviewer did not modify application source or deploy code. Production configuration observations were supplied by the implementation agent and were not independently verified through production access by this reviewer.

## Findings and corrections

| Severity | Finding | Reviewed correction |
| --- | --- | --- |
| P1 | Reset could select another configured owner's password, and concurrent changes could create duplicate credentials. Password-only identity selection would then reject both owners. | An installation-scoped, domain-separated HMAC fingerprint and database uniqueness constraint enforce uniqueness atomically. Friendly checks also cover configured owners whose legacy credentials have not yet been imported. A failed reset uniqueness check rolls back token consumption. |
| P1 | `OwnerSessionBoundary` admitted only `/login` anonymously, preventing recovery pages from mounting. The application shell also treated recovery as private navigation. | Both wrappers now exempt `/forgot-password` and `/reset-password`. Reset fragment initialization is guarded against React StrictMode effect replay. |
| P2 | Authentication-attempt records had no deletion path, and client rows could be created after the installation limit was exhausted. | Login and reset consume their installation budget before creating client rows. Bounded housekeeping removes at most 100 rows expired for more than one day, within the current installation. |
| Isolation hardening | New signed cookies lacked an installation claim, leaving separation dependent on distinct owner/signing-key combinations. | New application-password cookies carry an installation claim and reject another installation, including when the owner and signing key are otherwise identical. Legacy cookies remain subject to credential-version checks. |
| Rollout regression | Advancing the current migration also advanced the requirement for the separately qualified nonproduction mode when application passwords were disabled. | That mode remains pinned to migration `0107`; application-password rollout explicitly requires `0108`. |

The final source re-review found no additional source-level blockers within this scope.

## Independent verification

The review used synthetic credentials and the authorized disposable PostgreSQL instance only. It copied the implementation's PostgreSQL suite into a separate review-only file, redirected its database schema to `auth_password_security_review`, and added eight focused boundary and abuse-case checks. The separate schema was dropped by test teardown; the implementation agent's fixture schema was not used.

Independent test file:

```text
/tmp/myeve-auth-security-review/password-auth-security.test.ts
```

Independent Vitest configuration:

```text
/tmp/myeve-auth-security-review/vitest.config.mjs
```

Exact final command, run from `/tmp/myeve-auth-security-review`:

```sh
AUTH_TEST_DATABASE_URL=postgres://auth_test@127.0.0.1:55482/postgres \
  /tmp/myeve-auth-password-management/node_modules/.bin/vitest run \
  --config /tmp/myeve-auth-security-review/vitest.config.mjs
```

Final result: **1 test file passed; 18 tests passed; duration 13.94 seconds.** The initial sandbox blocked the local socket; the command subsequently ran with approved access to this same disposable fixture.

Coverage included verified bootstrap and original-owner preservation; legacy session preservation before a change; password changes without redeployment; rejection of retired deployment passwords; revocation of old cookies; denied anonymous, wrong-current-password, weak-password, and cross-origin changes; hashed reset-token storage; concurrent reset replay; expired, replaced, and cross-installation reset tokens; competing password changes; atomic shared limits; fail-closed database outages; cross-owner collision rejection; direct uniqueness-conflict rollback with reset-token retention; reset-versus-change races; outstanding-token invalidation; cross-origin reset denial; route limits; signed-cookie installation isolation; bounded, expiry-aware, installation-scoped cleanup; and rejection before new client-row creation when an installation budget is exhausted.

The temporary test file/configuration are local review artifacts, not permanent repository test entry points. Repository regression suites remain the maintained tests; this record identifies the independent command and observed result precisely.

## Release constraints and residuals

- Before production promotion, qualify anonymous Forgot Password and Reset Password, password-change and recovery completion, explicit success/failure messages, and mobile layout in a real browser. The implementation agent owns this browser qualification; this reviewer did not independently perform it.
- Verify the canonical serving deployments, existing owner identities/database bindings/session secrets, actual login success, and cross-installation denial. The implementation agent reported both migration ledgers were already through `0107`, leaving only additive `0108` pending. Preserve that narrow migration scope.
- Keep Vercel Standard Protection (`all_except_custom_domains`) enabled on previous/immutable deployment URLs. The implementation agent reported it enabled for both tester projects. After a password change, rolling back to authentication code without database-password support would restore retired passwords and cookie acceptance; that rollback is prohibited.
- Preserve the stable signing secret used by password fingerprints. A future signing-key rotation must include a deliberate fingerprint migration/recomputation strategy; do not assume uniqueness remains enforced if its key changes independently.
- Existing COMPUTER/VNC sockets authenticate when opened and do not periodically revalidate credential versions. An already-open bidirectional desktop-control connection may outlive a password change. The implementation agent reported COMPUTER is denied on both tester installations; that restriction is required for this qualification. Enabling it requires separate transport-revocation work and review.
- Owner-issued recovery requires recipient identity verification through the established contact channel. Reset links remain single-use, installation-scoped, and valid for 15 minutes. Initialize every configured owner's database credential during rollout before removing bootstrap configuration or relying on recovery issuance.
- Database unavailability fails authentication closed. The implementation intentionally retains the existing architecture and database, without adding a recovery-email or authentication service.

