# Managed Eve: first beta release contract

Decision (September 26, 2026): MyEve operates one isolated Eve environment per tester. BYO Vercel remains an advanced option. Relay and MyFactory remain shared governed services, with separate per-Eve identities, credentials, and authorization.

## Smallest shippable control plane

For the first guided beta, the Control Plane may be operator-only. The tester should receive a working Eve URL and sign-in, not a Vercel-token form. The operator interface may be a CLI initially, but its registry must be durable and auditable; a local spreadsheet or one-off Vercel project is not a control plane. No public provisioning endpoint may accept an operator Vercel credential from an unauthenticated tester.

The registry owns one stable environment ID per tester. It records the invited Relay account ID, Eve owner ID, project/deployment IDs, dedicated database and Blob store IDs, template SHA/release, Relay Agent identity and key version, lifecycle state, budget policy, last health check, export status, and deletion receipt. It stores **no** plaintext password, token, database URL, or signing private key. Only the control plane can mutate this mapping; all mutations require an operator identity and an idempotency key. Email is kept in the protected registry, never the Git release packet.

Provisioning runs as a resumable state machine: `reserved → project_created → storage_created → configured → deployed → healthy → active`. Every resource is tagged with the environment ID. A retry discovers resources by exact ID before creating anything. Failure leaves a visible state and cleanup action. An existing project is never silently adopted or overwritten. The new Eve gets one Vercel project, one dedicated database, one dedicated Blob store when file features are enabled, and newly generated session, Relay, webhook, and storage credentials. No data store or credential is shared with Jay's Eve or another tester's Eve. The owner is linked to the exact Relay identity, and Relay grants default to none.

Upgrade pins the template SHA and migration set, takes a verified database backup, deploys one environment, checks health and owner sign-in, then advances its recorded release. A failed upgrade retains the previous deployment and a restore path. No bulk rollout is needed for the first beta.

Monitor records health, current deployment, database connectivity, Relay connection, last successful check, and recent deployment failures. The operator sees stale or failing environments and can pause one Eve without pausing Relay or other testers. AI Gateway must have a per-project budget before the first model call; its cap is soft for the crossing request. Vercel's platform spend management is team-wide, so the beta also needs per-project usage review and an operator pause threshold. Do not label a dashboard warning as a hard project spend cap.

The existing owner-facing **Manage → Data → Backup & recovery** flow offers a downloadable, checksummed archive from day one. The control plane records a successful export and its hash before deletion. The archive itself states domain completeness and portability; excluded credentials and referenced files are not represented as restorable data. The owner can download without an operator token. Test a real export and archive verification on the isolated hosted Eve before invitation. Do not promise a working import: restore is a separate unfinished work order.

Deletion is two-stage: disable the Eve and revoke Relay identity/credentials first; export and verify a final owner archive; then delete the exact Vercel project, dedicated database, and Blob store, verify each is gone, and retain a non-secret tombstone/receipt. Destructive deletion needs explicit owner authorization and a retention notice. Deleting a Vercel project alone does not prove its connected storage was deleted.

## First-user acceptance gate

1. Control Plane provision, retry, status, upgrade, pause, export-record, and deletion rehearsed against a disposable isolated Eve. Verify no cross-Eve data or secrets appear in either project.
2. Per-project model budget and team platform spend control observed in provider settings. Record the alert/pause operator and threshold.
3. Owner signs into the new Eve and downloads and verifies an archive. Test the empty, loading, failure, and success states of setup and export.
4. Relay invitation creates a distinct account for the exact tester email; the tester's Eve registers its own Agent key and gets only explicit grants. Hosted message/reply, shared Knowledge, private denial, and revocation all pass.
5. MyFactory remains on the tester's Mac and disposable repository. The approved Linear team, local host health, signed receipt, duplicate suppression, and one reviewed draft PR pass before claiming the three-product beta journey.

Until these gates pass, Relay may be in production, but the managed Eve invitation is **not ready to send**.
