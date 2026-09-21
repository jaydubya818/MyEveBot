# Hosted migration runner correction

The normal HTTP migration runner failed against two fresh hosted Neon qualification databases with SQLSTATE42601: multiple commands cannot be inserted into a prepared statement. Existing migration chunks contain multiple SQL commands. The prior local HTTP bridge accepted them through node-postgres's simple-query path, so it did not reproduce Neon's HTTP transport restriction.

The runner now uses the existing Neon `Client` over a session. Unparameterized migration chunks use the PostgreSQL simple-query path; each migration and its parameterized checksum-journal insert share one explicit transaction. Failure rolls back both, and the client closes in `finally`. Migration SQL, checksums, ordering and schema are unchanged. No federation behavior or defaults changed.

The local fixture adds a loopback-only WebSocket-to-PostgreSQL bridge for the real session driver, using documented non-Neon SCRAM settings only in the test preload. Historical baseline schema creation retains its existing HTTP fixture. Added regression cases prove multi-command rollback and refusal of applied-checksum drift. Fresh/upgrade preservation, idempotency, schema equivalence and both authority integration scripts pass.

Both hosted synthetic MyEve databases applied27 migrations and passed a normal-runner rerun. Relay independently applied22 unchanged migrations. Runtime roles receive DML without schema/database creation, object ownership or migration-journal writes; temporary migration logins were revoked. This is migration/target preparation evidence, not production-platform qualification.

Affected regression:496 Vitest tests in74 files;130 Node tests;25 default-disabled probes;8 migration/authority integration checks; both workspace typechecks and production builds pass. Hosted construction stopped separately at Relay's existing KMS/HSM custody contract, and no external gate ran.
