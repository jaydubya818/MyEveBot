# External-alpha installation: environment variable names

Names and meanings only. No value, key, tester identity or token belongs in this
file, in source, in logs or in a ticket. Values are set by the operator in the
tester's own Vercel project (one project per slot) and are never copied between
slots.

An installation is any deployment whose `EVE_PROJECT_NAME` starts with
`myeve-alpha-tester` or that sets `MYEVE_EXTERNAL_ALPHA_POLICY`. Any such
deployment fails closed: a missing or malformed variable below disables the
feature or stops the application; it never falls back to a wider default.

| Name | Kind | Required | Meaning |
| --- | --- | --- | --- |
| `EVE_PROJECT_NAME` | immutable provisioning name | yes | Exactly `myeve-alpha-tester-1` or `myeve-alpha-tester-2`. The slot is taken from this name; the policy cannot override it. Any other `myeve-alpha-tester*` name is still an installation and is refused. |
| `MYEVE_EXTERNAL_ALPHA_POLICY` | JSON policy | yes | The exact reviewed policy (cohort, slot, owner, project, client, repository, base/tree, pins, limits). `slot` must equal the slot in `EVE_PROJECT_NAME` and `repository` must end in `myeve-alpha-workspace-0<slot>`. |
| `MYEVE_EXTERNAL_ALPHA_POLICY_SHA256` | digest | yes | Canonical digest of the policy above. |
| `MYEVE_OWNER_ID` | identifier | yes | Must equal `ownerId` in the policy. |
| `VERCEL`, `VERCEL_ENV`, `VERCEL_PROJECT_ID`, `VERCEL_TARGET_ENV` | platform | yes | Must describe a production deployment of the policy's `projectId`. |
| `MYEVE_EXTERNAL_ALPHA_AUTHORITY_SIGNING_KEY` | secret (Ed25519 PKCS#8 PEM) | yes | Signs Work authority. The installation refuses to start without a usable Ed25519 key. Its public key is pinned independently by the Factory. Never logged or echoed; an invalid value is reported only as `EXTERNAL_ALPHA_SIGNING_KEY_REQUIRED`. |
| `MYEVE_EXTERNAL_ALPHA_WORK_CONFIG` | JSON, non-secret | for Work | Allowed files, check commands, Factory origin and team, receipt public keys, and `factory.resultVerification` (Factory id, source and configuration digests, verifier policy digest, Result public keys). Absent or invalid disables Work. |
| `MYEVE_EXTERNAL_ALPHA_FACTORY_PIN_SHA256` | digest | for Work | The operator's pin of the Factory installation projection. MyEve offers Work only when this equals the digest of what it will place in every authority (cohort, slot, owner, policy digest, application, source, FactoryVersion). The Factory recomputes the same projection from its own copy. |
| `MYEVE_EXTERNAL_ALPHA_FACTORY_TOKEN` | secret | for Work | Bearer token for the dedicated Factory routes (separate from the canary transport). |
| `MYEVE_EXTERNAL_ALPHA_MEMORY_BACKEND` | flag | optional | Memory is OFF unless this is exactly `local-postgres`, meaning the owner approved the third-party-free local PostgreSQL backend. Supermemory is never used by an installation even if `SUPERMEMORY_API_KEY` is present. |
| `EVE_ENABLED_FEATURES` | list | optional | Can only narrow the installation allowlist. Unset or empty means no optional features (not "all"). |
| `DATABASE_URL` | secret | yes | The installation's own database. Migration `0087_external_alpha_work_result.sql` is required. |

Variables that must NOT be set on an installation (the policy loader refuses
the deployment): `MYEVE_ALPHA_OWNER_BINDING`, `MYEVE_PRODUCTION_CANARY_CONFIG`,
`MYEVE_CLOUD_QUALIFICATION_CONFIG`.

Test-only (never set in a deployment): `MYEVE_EXTERNAL_ALPHA_TEST_DATABASE`, a
disposable localhost PostgreSQL used by the real-database tests.

## What an installation serves

Only the explicit allowlist in `apps/eve/lib/external-alpha/features.ts`:
Sofie/Chat, Persistent Agents, qualified Live Agent Cards, Today / Work Inbox /
Needs You, bounded owner CLOUD Work, Result / Proof, Files, Memory (only with the
flag above) and an owner-facing Relay link (connect, explicit rotate, revoke,
retire; no peer auto-reply, Relay Work, business ask, grants or sends).
Everything else, including any new route nobody classified, is a 404 from the
proxy. `features.test.ts` enumerates `app/**/route.ts` and `page.tsx` and fails
on an unclassified route.

## Relay credential rotation

Linking to an existing Relay Agent issues a new credential and invalidates the
old one. The server answers `409 RELAY_ROTATION_CONFIRMATION_REQUIRED` with a
disclosure and the exact confirmation string (`ROTATE_AGENT_CREDENTIAL:<agent id>`);
no network call is made until the owner confirms it.
