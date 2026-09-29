# Schema activation package

Package: READY_FOR_INTEGRATION. Canonical database activation: INTEGRATION PENDING. Live ingestion: NOT_RUN. This directory is not a migration and has no reserved migration number.

## Contents

- `schema.sql`: exact candidate tables, constrained JSONB fields, generated query columns, unique/foreign keys, history triggers, indexes and FORCE RLS policies.
- `apps/eve/lib/universal-inbox/postgres-repository.ts`: unmounted pool adapter. No runtime DDL or environment lookup.
- `apps/eve/scripts/qualify-inbox-postgres.mjs`: creates/removes its own PostgreSQL 17 cluster in a temporary directory using a private Unix socket with TCP disabled. Applies/rolls back the candidate, then qualifies restricted-role writes, isolation, concurrency, history fences and queries. Never reads DATABASE_URL.
- [Persistence dictionary](../persistence-contract.md), [integration crosswalk](../integration-crosswalk.md), [local database evidence](../../verification/universal-inbox/integration-preparation/postgres.json).

## Roles and grants

The migration owner/DBA applies DDL using a migration-only identity. The runtime identity must be LOGIN, NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOINHERIT, NOBYPASSRLS, must not own these tables and must not inherit any table-owner role. Grant schema USAGE and SELECT, INSERT, UPDATE on the three Inbox tables only. Deny CREATE in the containing schema and grant no DELETE/TRUNCATE/trigger/role management rights. No canonical Work, approval, source-provider or private peer permissions are granted by this package.

The adapter sets `myeve.inbox_owner` transaction-locally using a server-authenticated owner, and uses explicit owner predicates as well as RLS. A caller without that context sees no rows. A database client capable of arbitrary SQL can set custom settings, so the pool is server-only: RLS supplements trusted authentication, not a public SQL API. Never expose runtime connection credentials to the browser or model tools.

Production should inject a connection pool implementing `InboxSqlPool`, e.g. the already available Neon Pool transport. The fixture used local `pg`; this does not qualify Neon/serverless networking, backups or deployment behavior. The noninteractive Neon HTTP transaction interface cannot be substituted for this interactive transaction callback.

## Backfill contract

1. Keep the new public route/dispatcher disabled. Inspect current worktrees and choose the numbered migration only with the canonical migration owner.
2. Take an owner-scoped source watermark from canonical approvals, Work blockers, reminders and admitted external messages. Backfill only current actionable/unresolved records and an explicitly bounded recent-message window. Do not turn historical completed Work into thousands of unread Result cards.
3. Existing stored v1 fixture rows are not a production source of truth. If promoting any existing Inbox persistence, set absent additive nullable fields to null; preserve identity, terminal state, original read state, response identity and source evidence. Never infer a historical Work generation from its current generation. Unbound responses remain blocked from canonical continuation.
4. Normalize each source with stable account/event identities and locally persisted mapping/sequence. Store a projection digest in the source admission record. Authenticate/authorize every row just as for live ingestion. A backfill cannot create grants.
5. Process at most 100 admitted rows per batch; checkpoint the exact source cursor only after all row transactions commit. If a process dies, rerun the same batch: the source uniqueness key and digest make this safe. Unknown outcomes are retried by the same source ID, not replaced with new IDs. Changed-content collisions are quarantined for the source owner, never silently overwritten.
6. Reconcile approvals' effective current status and Work/Goal generations before cutover. Historical resolved rows, if needed, are imported with preserved terminal/read state through a reviewed migration path, not replayed as new notifications.
7. Compare source pending counts and owner-scoped Needs You counts, explain every delta, then enable one owner/cohort. Persist source cursors and monitor only failures/actionable deltas.

No backfill is run by this branch. Retention/deletion of source content requires the source owner's policy; runtime has no destructive grants. Source references and read-time entitlement checks preserve revoked/private boundaries.

## Qualification before canonical activation

Run the shared domain/replay suite against the chosen production database adapter, plus the actual upgrade path from the integrated schema head. Validate: RLS under the real restricted role; source/owner keys; index plans and p95 under representative scale; connection interruption inside each atomic unit; rollback/retry; canonical receiver idempotency; supersession of in-flight work; provider revocation; backups/restore; source backfill/checkpoint restart. Local empty-cluster schema application is not qualification of an existing production upgrade.

Rollback is to disable the API/dispatcher and preserve the additive records. Do not drop response/evidence history or reopen resolved episodes. No down migration is provided because deleting owner decisions is not a routine rollback.

## Files requiring owning-stream integration

The integration owner, not this tranche, changes:

- `apps/eve/migrations/<owner-selected-number>.sql` and `lib/database-schema.ts`.
- Authenticated Inbox route composition with `createInboxApi`, `SourceAuthority` and the qualified pool.
- Canonical Work's atomic `CanonicalContinuationPort.record` and source events; no direct Factory/Gate routing.
- Goals NeedsYouPort snapshot delivery, accepted snapshot revision/cursor, exact DependencySignal verification and Task dispatcher.
- Source-owned Relay/email/Slack/webhook admission and visibility/revocation adapters.
- Existing reminder/schedule and notification dispatcher idempotency keys.
- Product-owned Today/Daily Brief/Needs You data loaders and presentation through the documented Beta crosswalk.

All these remain explicit activation dependencies. The package can be integrated without guessing field names, persistence transactions, response semantics or ownership.
