# Unified beta installation and activation preparation

Status: engineering and qualification in progress; activation held. This document organizes the existing controls. It neither replaces the Factory release coordinator nor grants deployment, spending, credential or database authority.

## Release identity and preflight

Use one source-bound release record for MyEve/MyApps, MissionControl, Relay and MyFactory. Retain exact commit/tree identities, dependency locks, migration hashes, CI run and job identities, independent review dispositions, Factory source custody, configuration digests and each derived FactoryVersion. Preserve failed attempts and their full reserved exposure. Do not use historical green CI as evidence for changed runtime source.

The MyEve engineering source was assembled from independently identified source snapshots and has a parentless composition baseline. Canonical-main adoption needs explicit preservation/transformation evidence and independent review. A deployment-disabled development branch is not a merged production release. The existing main-connected Vercel project must not receive this branch by accident.

Before real installation, resolve the held Factory coordinator defects and hosted capability-guard proposal through their recorded authorization process. The current local MyApps Docker composition must also have an explicitly qualified installation host and runtime profile; do not set local flags on a hosted process to bypass that boundary.

## Three separate installation records

Prepare exactly one record for the platform owner and one for each of the two external testers. Verify each record from its authoritative systems, without guessing subjects or reusing another installation's credentials:

- canonical MyEve owner, installation and deployment/project;
- Clerk issuer, subject, audience and authorized origin;
- MissionControl owner, tenant, project, connection and signing-key enrollment;
- Relay owner/agent enrollment, backend incarnation and enrollment digest;
- qualified Factory source, configuration, runtime profile, original request binding and derived FactoryVersion;
- capability evidence, current policy revision and destination acknowledgments;
- existing accounting membership and approved ceiling; the platform owner uses its canonical owner route, never a third external-tester slot;
- active runtime role, operator role, schema lineage, credential reference and rotation status;
- private MyApps source closure, immutable runtime image, adapter/data-contract digests and qualified host.

No secret values belong in the release record, logs or invitation. An absent binding remains unqualified. The two tester enrollment documents must not contain `ownerFactoryAdapter`; only the separately qualified platform owner may use that adapter. Verify that the deployed application credential cannot write enrollment documents.

## Migration and role sequence

1. Inventory the actual installed schema and checksum ledger using the approved read-only process. Reject unknown or mixed lineage. Match a rehearsed upgrade path before proposing an installation change.
2. Capture an authorized backup and verify restoration in an isolated database. Preserve accounting, immutable receipts, permissions and pending/UNKNOWN states.
3. Stop new admissions through the existing controls and reconcile active execution. Backend cleanup and known accounting require authoritative evidence; neither elapsed time nor an operator note clears UNKNOWN.
4. Under the existing explicit migration authorization, apply the canonical forward migrations and separately qualified capability/accounting schema sequence. The unified supplement preserves all historical checksums. Intermediate disposable databases that applied0100 before0099 are not supported installation prefixes: use a fresh fixture for those historical tests, and reject such a ledger on a real target until a separately reviewed recovery is defined. Migration 0099 is the owner admission adapter; 0100 retains exact External Alpha ISSUE/DISPATCH admission custody. No historical permit relationship is inferred or backfilled. Migration0101 requires an explicit matching owner context before either admission assertion runs. Additive0102 preserves that caller context and serializes owner/Alpha admission on the same Work row in both directions. Original0099 has SHA-256 `52478de2d2e680949406b4f1c76e3bb4c3220dbf07d8c4dc521ff9e51787bc8c`. An intermediate target carrying the changed0099 checksum `b580bb23098fb564a95de94bfd5b7a826278f10a19717de9331469b52c8e2f1f` is rejected; never rewrite its ledger or assume it was never installed. Such a target requires its own reviewed recovery.
5. Admission requires `READ COMMITTED`. Additive0103 rejects unsupported isolation before either owner/Alpha admission lock, preventing stale transaction snapshots from admitting both routes. Additive0104 extends that requirement to the legacy effect and writer guards, including execution, model calls and route runs. Both preserve the published migration bytes and leave database defaults unchanged. Existing Work and UNKNOWN records must remain intact when a conflicting admission is denied. Verify the actual connection's isolation before activation; do not silently override an unexpected setting. Apply only the reviewed role grants. The application must not own protected tables/functions, disable triggers, TRUNCATE evidence, mutate owner enrollments or policy evidence, write triage history, or write exact admission custody directly. Verify these denials with the actual deployed role, including inheritance. Operator credentials stay outside the application. Owner GUC-based RLS guards against application mistakes; it does not isolate a compromised runtime role that can set its own context. Verify actual separate tester database/credential boundaries.
6. Verify installed source, schema, enrollment and current policy readbacks before enabling any admission. Compare the independent PostgreSQL witness identity, digest and expiry with the exact installation.

## Recovery and rollback

Application rollback uses a qualified prior source that is compatible with the forward schema. Do not delete migrations or rewrite checksums. If no compatible prior source exists, leave admission disabled while preparing a forward fix. Database restore is an exceptional authorized operation: it must not discard accounting or a remote effect that occurred after the backup.

MyApps rollback prepares a new monotonically increasing release from a previously installed package, requires fresh preview and owner approval, and preserves saved task data. It is separate from application or database rollback. For a stranded RUNNING app operation, follow the exact-operation recovery procedure. For an ISSUED Alpha authority whose exact permit expired, follow `expired-issued-permit-recovery.md`; the unique per-Work authority cannot be replaced by a generation bump. UNKNOWN accounting and UNKNOWN app cleanup remain held until their respective authorized reconciliation establishes the truth.

## Activation gate

Require current source-bound independent review, all hosted jobs, local PostgreSQL/browser/recovery qualification, and installed authenticated Golden Journey evidence for each person. Verify owner isolation, expired/revoked session denial, same-Mission identity, exact Factory authority, current capability enforcement, no duplicate execution after response loss, confirmed cleanup, canonical accounting, private installation, update/rollback, Sofie task operations and private feedback.

Retain negative tests alongside successes. A synthetic web session, loopback transport, FakeFactory, injected policy or package-only update cannot count as the installed journey. Any failed check leaves that installation inactive.

Prepare one consolidated final authorization request naming the exact installation changes, central accounting actions, credential work, custody budget/history successor, protected execution records and final activation. The current custody proposal must preserve the two already consumed attempts; a proposed fifth lifetime record and $7.52 cap are not covered by the historical four-record/$5 envelope until explicitly approved. Send onboarding only after the authorized changes and readbacks pass.
