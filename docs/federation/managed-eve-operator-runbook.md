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
node --import tsx apps/builder/scripts/managed-eve.ts record-export '/absolute/private/tester-provision.json' '/absolute/private/owner-archive.zip'
node --import tsx apps/builder/scripts/managed-eve.ts pause ENVIRONMENT_ID PROJECT_ID
node --import tsx apps/builder/scripts/managed-eve.ts resume ENVIRONMENT_ID '/absolute/private/tester-provision.json'
```

`provision` additionally needs `BUILDER_RELAY_ORIGIN` and `MYEVE_CONTROL_BUILDER_ORIGIN`; the Relay origin must present the configured signing-key fingerprint. A failed deployment is never silently replaced: inspect the exact Vercel deployment, then use `recover-failed-deployment ENVIRONMENT_ID DEPLOYMENT_ID` only when its provider state is `ERROR` or `CANCELED`.

`upgrade` first verifies the project marker and prior READY deployment, then writes a PostgreSQL custom-format backup under `database-backups/`, checks it with `pg_restore --list`, and records SHA-256 before changing state. It applies additive migrations and waits for owner sign-in/readiness. If a build fails, the old deployment remains recorded; rerun the same pinned command to resume an in-progress build. If readiness fails after a READY build, the command promotes the prior deployment and checks owner readiness. Treat a restore failure as an incident, not a retry loop. Database migrations are not rolled back by Vercel routing, so upgrades must remain backward-compatible.

The $20/month AI Gateway project budget is soft at the crossing request. Check Vercel project usage and team spend; pause this one project if costs or health leave the pilot's agreed range. `monitor` tests owner login and required readiness but does not yet verify Relay message exchange or alert an operator automatically.

## Export, revocation, and deletion

Owner archive: Eve **Manage → Your data → Backup & recovery**. The owner can download at any time; verify the archive through `record-export` before considering deletion. Archive completeness excludes credentials and may exclude referenced binary content. No import promise is made.

The CLI's `cleanup-rehearsal` is deliberately restricted to an unpaired `@example.invalid` Eve after a verified export. There is **no general customer delete command yet**. For a real owner removal request, first freeze access, revoke Relay Agent credentials and grants in Relay, export and verify the owner's archive, then plan exact project and storage removal with an explicit owner-authorized retention notice. Do not use the synthetic cleanup command or delete only the Vercel project for a real owner. Record a non-secret tombstone after verifying every provider resource is gone. This unfinished lifecycle is a guided-beta limitation.
