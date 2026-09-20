# MyEve Relay adapter

Integration base: `/Users/jaywest/Myeve`, `codex/openbot`,
`74fee5b1fdc8ec7c705a9087d9bdf58992b8f27c`, clean before isolation.
Integration worktree: `myeve-relay-federation`, branch
`feat/relay-federation-adapter`. Relay remains pinned and unchanged at
`614c638d6fc4099db8064540326f5de4438e93a1`.

## Current architecture audit

MyEve is a Next.js 16 / React 19 application using Eve 0.27.7. Authenticated
owners are resolved by `web-auth.ts`; persisted Agents belong to owners and
have explicit capabilities, risk ceilings, and execution limits. Knowledge is
canonical in PostgreSQL `knowledge_records`, sources, provenance links, and
relationships. Memory uses owner/Agent/Goal scopes and an optional Supermemory
backend. Goals, Workspace, conversations, and task runs are separate local
domains. Control Center reads `task_runs`, approvals, milestones, and computer
state. ActionGateway enforces local capability policy and exact-action approvals.
Execution occurrences and action ledgers provide durable fencing and recovery.

There was no Relay federation client. Existing references to Relay were role
instructions and unrelated VNC relay code. No production environment files are
copied into this worktree, and no shared database is migrated.

## Adapter boundaries

Owner-authorized publication code may select canonical Knowledge. It materializes
an explicit, immutable publication projection. External query code receives only
a publication-reader capability; it does not import canonical Knowledge, Memory,
Goals, conversations, Workspace, or the general Agent tool runtime. Everything is
PRIVATE unless the authenticated owner confirms an exact publication preview.

Relay carries addresses, grants, references, signed delivery, lifecycle, and audit
evidence. Incoming work must additionally pass MyEve local policy. Local Runs stay
in MyEve and correlate to, rather than being replaced by, Relay request IDs.
External knowledge remains sourced external context, without automatic promotion.

Relay's current remote API does not expose audit export retrieval. The existing
signed audit-export format can be imported and independently verified using a
pinned Relay public key. MyEve local delivery activity is distinct from imported
Relay-signed disclosure receipts. This avoids an unqualified protocol extension.
Relay owner-session operations remain distinct from Agent bearer authentication.

## Qualification state

- Federation protocol: PASSED_LIVE, disposable platforms (previous mission).
- MyEve adapter: PASSED_LIVE, isolated local qualification; see qualification.md.
- Production multi-platform: NOT_RUN.
- Independent security review: NOT_RUN.

Baseline application Vitest: 402 passed in 63 files. The root strip-types Node command
had a pre-existing startup failure. Running the same complete suite with `--import tsx`
passed all 130 baseline tests. Final regression: 437 Vitest tests and 130 Node tests.


## Explicit deployment configuration

Federation is disabled when `MYEVE_RELAY_ENABLED` is missing or not exactly `true`.
An enabled installation must configure these independently from owner login secrets:

- `MYEVE_RELAY_ORIGIN`: pinned HTTPS Relay origin; no path, query or credentials.
- `MYEVE_RELAY_KEY_ID` and `MYEVE_RELAY_PUBLIC_KEY`: trusted Relay Ed25519 verification pin.
- `MYEVE_RELAY_ENCRYPTION_KEY`: separate random 32-byte key encoded as 64 hex characters.
- `MYEVE_RELAY_OWNER_ORIGIN`: exact browser origin behind a reverse proxy; no trust in
  caller-supplied forwarded headers. If absent, the request URL origin is used.
- `MYEVE_RELAY_ARTIFACT_PRIVATE_KEY`: separate MyEve Ed25519 signing key.
- `MYEVE_RELAY_ARTIFACT_ORIGIN`: HTTPS source-owned artifact origin.
- Existing `MYEVE_OWNER_ID`, signed owner-session configuration and MyEve DATABASE_URL.

Apply migration 0027 through the existing migration runner only to the intended MyEve
installation. This mission migrated disposable databases only. Manage → Relay owner actions
require signed MyEve authentication even in development and exact same-origin POSTs.
The owner explicitly logs into Relay to register/reconnect, then previews and confirms Knowledge.
No default auto-publication rule or automatic Knowledge promotion exists.

The optional worker is `node --import tsx apps/eve/scripts/relay-worker.ts` (or `--once`).
Use normal deployment supervision; the worker is never started or enabled implicitly.
It serially polls bounded deliveries and retries durable results. A crash during uncertain
execution requires inspection of the canonical Run/ActionGateway before any manual recovery.
Do not reset a processing action to runnable merely to make it progress.

This first adapter supports immutable SNAPSHOT publications. To change content, create and
confirm a new view, update grants explicitly, and revoke the old view. Pausing/revoking disables
local projection reads before the remote mutation; network uncertainty remains closed. A
publication with ambiguous remote creation stays `sync_required` for owner inspection.
Receipt imports support the deployment's pinned signing key; key-history rotation is not
implemented or qualified. External context and artifact bodies expire locally; idempotency
metadata and signed disclosure evidence remain durable. Revocation cannot erase copies
already delivered to an independent owner.


## Historical concurrent frontier observed at original completion

The canonical checkout advanced independently from the inspected `74fee5b` base to
`81979b6d367776366e930278fdad897d63956fc5` and accumulated uncommitted action-recovery
work during this mission. It now reserves migration 0025 for action-executor enforcement
and has an uncommitted 0026 action-recovery migration. This integration deliberately remains
on its recorded base; its local live result does not qualify that later frontier. Before any
future merge, rebase onto the settled canonical work, renumber the federation migration,
resolve schema-version changes and rerun authority, upgrade and live federation checks.
The canonical checkout and its concurrent edits were not modified by this mission.


## Canonical Routine reconciliation

The historical frontier above is superseded by the reconciliation on `60d341f`.
Federation retains committed migration **0027 unchanged**; Routine pending-send state
uses **0028** and depends only on canonical Runs and Actions. Do not renumber 0027.
Federated Action attribution is now `relay_request` (displayed as Federated request),
while Routine Actions retain `scheduled_occurrence`. The request's `local_run_id`
links Run, Action, external caller, grant and decision audit. No Routine is created by Relay.
See [current qualification](../routine-federation-reconciliation.md).
