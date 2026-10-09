# Disposable migration and recovery qualification

This rehearsal uses the canonical MyEve migration runner and unchanged SQL. It
creates randomly named databases on a loopback PostgreSQL fixture, removes them
normally when finished, and writes a source-bound JSON receipt. It does not run
production SQL, create a host registration, or authorize installation/execution.

```sh
MYAPPS_MIGRATION_REHEARSAL=1 \
MYAPPS_POSTGRES_URL=postgresql://myapps_fixture@127.0.0.1:55793/myapps_fixture \
node --import tsx packages/myapps/qualification/migration-recovery.mjs \
  /absolute/composed/myeve /absolute/composed/myfactory /absolute/receipt.json
```

Run from an installed composed MyEve checkout. PostgreSQL 17 `pg_dump` and
`pg_restore` must be on PATH. CI may use its existing `blocker_fixes` service
database instead. The administrator connection is restricted to a loopback
fixture database; generated application, central accounting, restore and Factory
databases are distinct. Fixture-only NOLOGIN roles test restored RLS and are
removed after their databases. No credentials are created or changed.

PostgreSQL subprocesses receive only explicit fixture connection environment
variables after all inherited `PG*` settings are removed. Password-bearing URLs
never enter subprocess arguments. Failed subprocess output is withheld from
exceptions and receipts. The failure-path security regression injects a failing
`pg_dump`, hostile inherited libpq routing, and password-bearing child output:

```sh
MYAPPS_MIGRATION_REHEARSAL=1 \
MYAPPS_POSTGRES_URL=postgresql://myapps_fixture@127.0.0.1:55793/myapps_fixture \
MYEVE_SOURCE_ROOT=/absolute/composed/myeve \
MYFACTORY_SOURCE_ROOT=/absolute/composed/myfactory \
node --test packages/myapps/qualification/migration-recovery-failure.test.mjs
```

## Canonical recovery contract

`docs/final-migration-integration-decision.md`,
`docs/deployed-migration-lineage-reconciliation.md`, and the canonical
`migration-runner.ts` define exact canonical prefixes, checked lineage/bridge
receipts, locked ledger comparison and transactional forward migration. The
rehearsal covers fresh installation plus prefixes through 0033, 0067, 0084 and
0092. Every prefix converges to the exact fresh schema while preserving applied
ledger names, checksums and timestamps. The exact historical alternate 396631a
and published-main d64f2f9 sources are loaded from Git, checked against canonical
hash manifests and upgraded through the existing canonical bridges. Both converge
to the fresh schema without rewriting original ledger rows. Historically
satisfied 0030 is never falsely marked executed on the feature lineage. The
canonical lineage suites retain their additional approval and authority checks;
this harness does not redefine those contracts.

There is no supported destructive down migration. A failed or disconnected
transaction rolls back its DDL and ledger insertion; a restarted runner discovers
the exact ledger and retries forward. Concurrent runners must rediscover after
the locked ledger comparison rejects the stale transaction. UNKNOWN accounting
history and all charged exposure survive recovery.

Phase 2's former `0085_myapps_runtime.sql` is **not** a canonical prefix. The
rehearsal rejects that ledger identity. Moving an existing Phase 2 installation
requires an independently reviewed exact lineage transfer; no fabricated applied
row, checksum rewrite or ad hoc renumbering is qualified here.

Factory's canonical operator scripts enforce target-specific boundaries. This
rehearsal applies all twelve unchanged schema files in disposable transactions,
checks coexistence, empty authority/host-registration tables, 011→012 partial
failure/recovery and rejected duplicate 012. It does not introduce a Factory
production runner or represent a test ledger as production migration evidence.
Central accounting base SQL is installed only in a separate empty database;
duplicate base installation fails atomically while recovery SQL preserves data.

## Evidence

`historical-migrations.json` pins all 89 application, 12 Factory and two central
accounting SQL files to their previously qualified composed snapshots. Every run
checks all 103 byte hashes and ordered application ledger entries. New corrective
migrations require explicit review and corresponding qualification updates.

The harness also checks checksum tampering, schema drift of reconciled ownership,
duplicate and noncontiguous ledgers, real session interruption, concurrent
migration transactions, and a real custom-format backup/restore. Restore compares
the complete schema including ACLs and every public/Factory table row, then reruns
the application migration runner and owner isolation/immutable-evidence checks.
Restored central UNKNOWN exposure remains 1,300,000 microusd and cannot transition
to BOUND. Backup hashes appear in the receipt; temporary dumps are deleted.

These results qualify disposable recovery mechanics and source compatibility.
They do not qualify an unknown production target, operational backup retention,
production role transfer, a target-specific recovery point, release approval,
deployment, or paid execution. Those controls remain separate release gates.
