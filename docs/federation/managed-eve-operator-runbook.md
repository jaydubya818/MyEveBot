# Managed Eve operator runbook (first guided beta)

This is an operator-only CLI. It runs from a clean, reviewed MyEve source commit and keeps credentials, the registry, and database backups in owner-only files outside Git. Do not give a tester the Vercel token or provisioning JSON. The hosted Eve URL is the tester handoff; BYO Vercel is separate.

## Private state and exact identity

Set `MYEVE_CONTROL_REGISTRY_PATH` to an absolute file in a 0700 directory. Provision and upgrade input JSON must be 0600. The registry is atomically checkpointed with a local `.bak` file, but this is **not** an off-host disaster-recovery copy. Arrange a secure off-host copy before adding more testers. Each mutation verifies the exact project marker and expected IDs; never reassign a tester to an existing unmarked project. The registry holds no password or database URL.

The Orchis operator files on Jay's Mac are under `~/Library/Application Support/MyEve/managed-beta/`. The live environment ID is `5b646d3c-946e-4d03-a864-21552697c961`, project ID `prj_DNqQD6ursrd4IWL3vg65ClRwpBBZ`, dedicated Neon store ID `store_0V3uNIss6c909jIT`, and public URL `https://orchis-eve-beta.vercel.app`. Do not paste the private config or registry into an issue, PR, or email.

## Commands

From the MyEve root, with Node 24, Vercel CLI authentication, and a clean checkout at the `sourceSha` in the private JSON:

```sh
export MYEVE_CONTROL_REGISTRY_PATH='/absolute/private/registry.json'
export MYEVE_CONTROL_TEAM_ID='team_p8z8exJRTGfOPk1GC9vUOpv3'
export MYEVE_CONTROL_TEAM_SLUG='jaydubya818'
node --import tsx apps/builder/scripts/managed-eve.ts status
node --import tsx apps/builder/scripts/managed-eve.ts monitor '/absolute/private/tester-provision.json'
node --import tsx apps/builder/scripts/managed-eve.ts upgrade '/absolute/private/tester-provision.json'
node --import tsx apps/builder/scripts/managed-eve.ts export '/absolute/private/tester-provision.json' '/absolute/private/new-owner-archive.zip'
node --import tsx apps/builder/scripts/managed-eve.ts record-export '/absolute/private/tester-provision.json' '/absolute/private/owner-archive.zip'
node --import tsx apps/builder/scripts/managed-eve.ts pause ENVIRONMENT_ID PROJECT_ID
node --import tsx apps/builder/scripts/managed-eve.ts resume ENVIRONMENT_ID '/absolute/private/tester-provision.json'
node --import tsx apps/builder/scripts/managed-eve.ts delete '/absolute/private/tester-provision.json' '/absolute/private/owner-delete-permit.json' '/absolute/private/new-owner-archive.zip'
```

`provision` additionally needs `BUILDER_RELAY_ORIGIN` and `MYEVE_CONTROL_BUILDER_ORIGIN`; the Relay origin must present the configured signing-key fingerprint. A failed deployment is never silently replaced: inspect the exact Vercel deployment, then use `recover-failed-deployment ENVIRONMENT_ID DEPLOYMENT_ID` only when its provider state is `ERROR` or `CANCELED`.

`upgrade` first verifies the project marker and prior READY deployment, then writes a PostgreSQL custom-format backup under `database-backups/`, checks it with `pg_restore --list`, and records SHA-256 before changing state. It applies additive migrations and waits for owner sign-in/readiness. If a build fails, the old deployment remains recorded; rerun the same pinned command to resume an in-progress build. If readiness fails after a READY build, the command promotes the prior deployment and checks owner readiness. Treat a restore failure as an incident, not a retry loop. Database migrations are not rolled back by Vercel routing, so upgrades must remain backward-compatible.

The $20/month AI Gateway project budget is soft at the crossing request. Check Vercel project usage and team spend; pause this one project if costs or health leave the pilot's agreed range. `monitor` tests owner login and required readiness but does not yet verify Relay message exchange or alert an operator automatically.

## Export, revocation, and deletion

Owner archive: Eve **Manage → Your data → Backup & recovery**. The owner can download at any time. `record-export` checks an owner-provided archive but does not establish which Eve generated it. Before deletion, `export` fetches a new archive from the exact authenticated managed Eve, asks Eve to verify it, and records its SHA-256 and time. Deliver that archive to the owner through an agreed secure channel. Archive completeness excludes credentials and may exclude referenced binary content. No import promise is made.

The general `delete` command requires a separate 0600 permit after the owner's explicit authorization and a separately communicated retention notice. Its JSON fields are `environmentId`, lower-case `email`, exact `projectId`, exact `databaseStoreId`, exact `blobStoreId` or `null`, the SHA-256 of the newly generated archive, an ISO `approvedAt` within seven days, `ownerArchiveDelivered: true`, and `confirmation: "DELETE <environmentId>"`. The matching Control Plane export must be under 24 hours old. Prepare this file only after the owner approves the exact deletion and receives the archive; the boolean is an operator attestation, not cryptographic proof of delivery. Do not execute deletion for a real owner based on a test permit.

Deletion signs into the exact Eve, fences local Relay access, revokes its grants, disables its Relay Agent, revokes credentials, verifies local retirement, pauses the Vercel project, removes the exact identity-marked project and dedicated stores, verifies their absence, removes the Control Plane database backup, and records a non-secret tombstone. A partial failure stays in `deleting` and resumes only with the identical permit file. If the saved Relay owner session expired, have the owner reconnect Relay before starting; deletion stops before provider removal. Retained owner/archive copies follow the communicated retention notice. The $1 unpaired disposable rehearsal passed this entire path and its former URL returned 404. Retirement of a *paired* hosted Agent has focused tests, but no real paired-owner deletion has been performed.

`cleanup-rehearsal` remains restricted to an unpaired `@example.invalid` Eve and must not be used for a customer. Never delete only the Vercel project and assume its connected storage is gone.
