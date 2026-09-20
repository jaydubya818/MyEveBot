# Qualification controls — local preparation only

These controls are **not yet wired into hosted MyEve/Relay**. They do not authorize a
session. Keep the three deployments disabled and the database roles NOLOGIN.

Run from the readiness repository:

```sh
python3 -m unittest discover -s scripts/federation-readiness/controls -v
node --test scripts/federation-readiness/controls/*.test.mjs
node scripts/federation-readiness/controls/preflight.mjs
```

The last command MUST exit 1 for the current incomplete target.

## Implemented and tested

- `session.py`: operator-owned SQLite ledger, exclusive initialization, durable
  serialized transactions, immutable start time, two HTTP slots and rolling 2/s,
  2,000 admitted HTTP attempts, 120 submission attempts, one model slot, integer
  micro-USD reservations, $2/$3 component bounds, eight MyEve model calls,
  $0.25 maximum per call, no new models at $4 reserved. The $5 total is never
  exceeded by accepted liability reservations. No refunds, including on error.
- Active requests survive restart as occupied slots. Missing/corrupt/locked state
  denies admission. Unknown model cost stops the session and retains its slot.
- Artifact delivery buffers and validates actual bytes before exposing content;
  maximum 64 KiB per artifact, eight artifacts and 512 KiB aggregate.
- Admissions end at minute 45; explicitly classified cleanup HTTP may continue
  within the same request cap until minute 60. Watchdog detects model deadlines
  (60 seconds), overall expiry, clock rollback, stop, and lost state.
- `supervisor.py`: explicitly supplied environment, process-group ownership,
  SIGTERM then SIGKILL after at most five seconds. No process-name matching or
  persisted PID reuse. Local test kills a real child that ignores SIGTERM.
- `emergency_stop`: attempts all six controls even if one fails; never reports a
  complete stop when any adapter fails. Out-of-band emergency controls are not
  disabled by exhaustion of the test request cap.
- `database-brake.mjs`: exact allowlisted synthetic role names and endpoint
  fingerprints; revoke login/password and terminate that role's sessions without
  destroying databases or changing application tables. `--verify-only` is read
  only. `--freeze-synthetic-only` invalidates staged passwords; restaging then
  requires explicit reconciliation, not an automatic password reset.

## Remaining integration work — launch blockers

The SQLite ledger is suitable for one trusted operator control process, not a
shared filesystem between serverless instances. Every ingress, worker poll,
retry, model invocation, and artifact transfer needs an authenticated adapter to
one durable authority. A counter used only by a test driver is bypassable and is
not sufficient. No private credentials may be handed to an unguarded process.

`admit_model` accepts a liability reference from a trusted adapter; a string is
**not proof of a provider cap**. There is currently no such verified adapter.
The existing MyEve estimate must never be supplied as a hard bound. Keep model
execution disabled until a dedicated provider ceiling or a demonstrable fixed
worst-case bound is validated. Provider cancellation is distinct from killing a
client process; keep the full reservation on uncertain completion.

The watchdog predicate must be driven by a supervised loop and an independent
operator/deployment brake; this module is not itself an always-running hosted
watchdog. Worker loss, supervisor loss, all direct ingress bypass paths, and
serverless invocations already in progress remain required integration tests.

The six emergency callbacks need immutable deployment/owner/Agent/grant IDs and
hosted credentials. Ordinary Agent/grant revocations must call Relay's existing
authorized services with signed audit. The emergency DB brake closes access but
does not pretend to emit those records. It must still work during a KMS outage;
record any unsigned operator action for later reconciliation without inventing
Relay provenance. No synthetic Agent or grant has been created yet.

The local controller stores only counts, times, component labels and operation
IDs. Never pass prompts, headers, bearer tokens, database URLs, canaries, provider
response bodies, or key material to it. Keep operator ledger files private and
outside Git; retain redacted evidence for 30 days under the existing runbook.

## Shared PostgreSQL successor (current mission)

`postgres.mjs` now implements the same conservative envelope using one locked
PostgreSQL session row across independent connections/hosts. It includes bounded
HTTP/model adapters, actual-byte artifact admission, corruption checks, durable
operation fencing, and time-bounded emergency orchestration. No shared filesystem
or process counter is used. Ambiguous completion never frees a slot automatically.

Run its 21 local integration tests separately with an explicit localhost URL:

```sh
FQ_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55439/postgres \
  node --test scripts/federation-readiness/controls/postgres.test.mjs
```

The test creates and removes its own disposable database; the user must start a
local PostgreSQL test server. `FQ_PG_PACKAGE` can point to a package.json whose
installed dependencies include `pg`. No hosted URL is accepted by the test.

`identity-policy.mjs` is a render-only four-key IAM specification. It cannot run
with unresolved project/custom-environment IDs and performs no cloud mutations.
Its two tests prove local constraints, not actual IAM acceptance or denial.

The new authority is **not yet wired into hosted ingress or model execution**.
Only a trusted controller should receive table-mutation privileges. Application
instances must use an authenticated, component-scoped interface with one-use
request-bound permits. A callback that bypasses this interface defeats the cap.
The SQL DDL has not been applied to any existing hosted database. `create` is an
operator-only action; never give a runtime permission to create a fresh allowance.

Emergency adapters receive an AbortSignal and must verify resulting state. A
provider timeout is UNCONFIRMED; all independent brakes still run. Evidence capture
precedes the final DB-login brake. The real hosted adapters, guarded worker
entrypoint, dedicated model liability bound and billing/egress containment remain
blocking implementation work. See the current [design report](../../../docs/federation/production-readiness/kms-controls-design.md).

The generic wildcard Node test command above now requires FQ_TEST_DATABASE_URL;
without a local DB run only `database-brake.test.mjs`, `preflight.test.mjs`, and
`identity-policy.test.mjs`. Do not silently skip distributed-control coverage.

## Pre-provisioning implementation checkpoint

`controller.mjs` now authenticates distinct hashed component credentials and owns
shared-ledger mutation. It issues 15-second request/operation/body/origin-bound
one-use permits, requires a worker heartbeat no older than 10 seconds, holds HTTP
slots until the full bounded body arrives, and fences ambiguous attempts. The
actual artifact buffer is checked before returning bytes. Missing verified model
liability configuration denies execution. `server.mjs` exposes bounded JSON RPC;
its loopback default must sit behind authenticated TLS for hosted use.

`worker.mjs` supervises a real process group with registration, five-second
heartbeats, bounded lifetime, TERM/KILL, and no restarts. `stop-adapters.mjs`
revokes exact synthetic Relay credentials/grants and terminalizes nonterminal
requests, then reads back outcomes. SQL emergency denial is not a signed normal
protocol receipt; the operator must preserve stop evidence and inspect in-flight
work before any resumption.

This is **not yet an enforced hosted path**. MyEve and Relay origin handlers must
consume permits before work; every provider attempt including KMS must use the
controller allowance; artifact admission must be attached to actual publication
and storage; the tested pinned Haiku adapter must be wired into both application paths, with fresh price review; worker
source SHA must be verified from the checkout; Railway stop/model revoke and
persistent evidence adapters must be connected and tested. Workers must receive
neither model/storage bypass credentials nor ledger mutation credentials. Do not
start these modules as a qualification session until those integrations pass.

Local tests: `controller.test.mjs`, `stop-adapters.test.mjs`, `worker.test.mjs`.
Database tests require `FQ_TEST_DATABASE_URL` pointing to loopback-only disposable
PostgreSQL. Each creates/drops its own uniquely named synthetic test database.
No hosted operator credentials are required or accepted by these tests.
