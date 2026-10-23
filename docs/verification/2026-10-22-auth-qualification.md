# Authentication qualification — October 22, 2026

Status: deployed and verified on both canonical tester URLs.

## Incident diagnosis

Tester 1’s configured password update postdated the deployment actually serving its public alias. Project environment updates affect a new deployment; the existing login handler continued comparing against its older environment snapshot while the source-preserving redeployment was building. Once that existing redeployment became READY, the new password returned HTTP200 and the original owner ID. Chrome confirmed login and reload. Tester 2’s original password was write-only; the user explicitly authorized issuing its independent temporary credential and redeploying its existing source. The application-level implementation now removes this dependency for future changes.

## Source and scope

The common serving source was compared against 4,107 retained source files. Authentication originally matched 1582df4a; the deployed qualification notice adds four files/changes represented by 4f5f127a. The release branch is based on that exact serving baseline, preserving the notice and existing deployment protection.

The change touches authentication routes and shared session verification, adds password storage/crypto/recovery, Settings/recovery UI, route classification, one additive migration and regression tests. Existing owner IDs, databases, session secrets, conversations, connections and ordinary application records are unchanged. Migration 0108 adds only three authentication tables and their indexes/constraints. Both existing ledgers were verified through 0107 before rollout.

## Qualification

- 126 maintained targeted regression checks passed (122 authentication/storage/schema/browser-storage checks plus4 preserved qualification-label checks).
- Independent security reviewer: 18/18 additional PostgreSQL checks passed; see2026-10-22-auth-security-review.md.
- TypeScript typecheck passed with the serving version's locked dependencies; existing dependency security patch verified.
- Production Next.js 16.3.8 webpack build passed. Local Turbopack was blocked by the environment's compiler port restriction; provider-side candidate build will verify the production builder.
- All 104 migrations applied successfully to an isolated local PostgreSQL 17 fixture.
- The actual built server passed password change without deployment, old-password rejection, prior-session revocation, single-use reset/replay rejection, unchanged owner and cross-origin denial using synthetic credentials and a disposable database.
- Chrome verified actual production login for each tester and authenticated page reload. Tester 1 uses its current configured password. Tester 2 received an explicitly authorized private temporary password; owner IDs remained 92652191-ad9e-4534-98cb-e0ec3f02d66c and a6a2d36a-c187-4001-b0ab-fc4f4aa2153c respectively.
- Chrome verified Settings password controls, anonymous Forgot Password, anonymous Reset Password, removal of reset token from the address bar, old-password failure and recovered-password login against the built local fixture.
- Mobile Settings and recovery had equal document/client scroll widths, with no horizontal overflow, at 390px viewport.

## Boundaries

Synthetic sessions verified cross-installation denial. A proposed live-cookie crossover check was rejected by automatic approval review as credential egress to another destination and was not executed. Live tester identities are distinct; new cookies additionally carry the installation claim.

This qualifies authentication only. COMPUTER remains denied for these installations; existing desktop sockets are outside this release. Unrelated MyEve/Factory/MissionControl execution readiness is unchanged. Never roll back to legacy password code after a credential has changed. Preserve Standard Protection on prior deployment URLs.

Owner-issued recovery instructions are in docs/application-passwords.md. Password/reset tokens and cookies are excluded from this report and source control.

## Final production result

Both canonical aliases serve source `7e191bdd12734f59f95ea6410ac9417360de0349`:

| Tester | Serving deployment | Browser login | Existing session |
| --- | --- | --- | --- |
| 1 | dpl_8uXJZG4CKWH8XjVcmaUsfuaBKmK6 | Passed | Preserved |
| 2 | dpl_Gp6haWtUwRNi1GaarJPrLNetA1G3 | Passed | Preserved |

Fresh Chrome logins on the final canonical URLs opened authenticated Today and Settings with Change Password. Production logout, anonymous Forgot Password and missing-reset-link error state also passed. Both database credentials are initialized at version zero under their original serving owner IDs and project namespaces, so owner-issued recovery is available immediately. No production password was changed merely to test revocation; change/reset/revocation transactions were exercised on the same built source with synthetic credentials and real disposable PostgreSQL.

Both migrations added only 0108 and retained all 103 original ledger entries/checksums. Provider environment-reference IDs and update timestamps prove MYEVE_OWNER_ID, DATABASE_URL and MYEVE_SESSION_SECRET were not changed. Vercel Standard Protection remains enabled. Existing signed cookies from before the release still authenticated on their own canonical installation after promotion.

A final provider Turbopack build and TypeScript check passed for each candidate before promotion. Tester 2's archive upload encountered transient TLS/EPIPE errors; the standard per-file upload succeeded without changes to source or TLS verification.

Evidence lives in `/Users/jaywest/Myeve/output/auth-password-management-20261022/`, including production-verification-1.json, production-verification-2.json, screenshots, migration receipts and build/test logs. Credentials and cookies remain outside this directory and source control.
