# Production validation — failed closed

Observed 2026-10-05 UTC. This report does not qualify the production platform as READY.

## Exact authorization

Work: `479ebc7d-4f4c-496f-ad5f-1d30c0de3d1c`, generation 2.
Request: `b2f34418-7c6d-4141-88d7-31d6a666d25d`.
Deadline: `2026-10-05T04:11:34.510Z`; never extended.
Manifest digest: `3b8d6c2183eca773f7664ed4b3f09e7a7d4cc233ad00fc46a2ad3d348ff1a7be`.
MyEve production: `7fa625c91a351fd52a1264204202f19c763146aa`.
MyFactory production: `a591127a26f3d134289f9a3a4a4a8bd2a8628f41`.
FactoryVersion: `cb0a31aabb471688a87198e901edc733f7aecd0a134c76727b25689e30ae5b22`.

## Preflight and write boundary

The production marker matched project `prj_4hfceCN8l6wN1gUyYOzZLQ7aJapK`, database `dry-morning-22844424` (`myfactory-cloud-production-db`, store `store_vUOtU0sIkDLU6TY4`), and private custody store `store_qBuivS8MmRxnBNnU`. Eight qualified Factory migrations were present. Active grants and paid-operation rows were zero. Owner security smoke passed; general Work and publication remained disabled.

The Vercel query console Read-Only guard was enabled before the approved temporary window. It was disabled solely for insertion and revocation of the exact grant. This is the console write guard, not a server-wide PostgreSQL read-only setting. No schema changes, credential changes or unrelated record repairs were made.

## Failure

The owner validation button was invoked once. Command `cbc43de2-c7ab-48d2-a3c2-509d4ff88fd9` was created at `04:08:31.906Z` and marked blocked at `04:08:35.346Z`, with `factory_reconciliation_required`. The preparation retained state `IDLE` and the same deadline. The exact grant was installed, but its consumption timestamp remained null. No Factory intake, resource or candidate was created. TestEvidence, DiffEvidence and canonical Proof were not produced.

Source inspection found that the new validation-state transition modifies `factory_preparation`, while migration 0057's `engineering_factory_prepare_guard` rejects any change to that JSON once saved. Independent read-only review confirmed this source incompatibility and cleanup. A separate production catalog read at `04:14:26.927Z` confirmed the trigger exists, is enabled (`O`), and rejects any preparation change. The raw exception was not independently captured. Earlier mocked driver tests missed this PostgreSQL integration failure. No automatic repair or retry was attempted.

## Cleanup

- Read-Only before: ENABLED.
- Temporary write window: OPENED, then CLOSED.
- Exact grant installed: PASS.
- Validation: FAIL.
- Exact grant revoked: PASS; state REVOKED, never consumed.
- Remaining reusable grants: 0.
- Unexpected database writes observed: 0; operator writes were exact grant insertion and revocation, and MyEve writes were the authorized command/preparation lifecycle.
- Paid model operations: 0.
- Publication effects: 0.
- Factory intake receipts / execution resources / candidate custody rows: 0 / 0 / 0.
- Read-Only restored: PASS, independently read back after page reload; cleanup SELECT ran with the guard enabled.
- General Work: DISABLED.

At `04:12:57.198Z`, after the original deadline, read-only MyEve inspection still showed the same blocked command and no restarted preparation. The revoked immutable grant cannot provide execution authority. No replay was initiated to test this denial.

## Release consequence

Production deterministic validation and EvidenceProvider-to-Proof remain unpassed. The first paid canary was not prepared for authorization or executed. Further production validation requires a reviewed correction and a separately authorized new bounded attempt; this grant must not be revived.

Cleanup readback and screenshot are retained in the task artifact at `production-validation-20261005`; raw private configuration and credentials are excluded.

## Independent review conclusion

Validation NOT PASS; cleanup PASS based on retained readback. The state claim runs before the driver catch block and before Factory prepare. Halt and completion updates have the same immutable-JSON conflict. A future correction should preserve immutable preparation and store mutable validation lifecycle separately, with real PostgreSQL tests of claim, wait, halt and completion. No correction, retry, new grant or paid canary was performed.
