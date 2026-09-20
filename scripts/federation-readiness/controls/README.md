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
