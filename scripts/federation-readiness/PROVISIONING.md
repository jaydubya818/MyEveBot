# Local qualification provisioning scaffolding

`inspect-database-access.mjs` performs read-only PostgreSQL role/version metadata queries. It parses locally available connection references in memory, emits only hashes/booleans/version, and suppresses raw connection errors. It does not read owner rows.

`provision-databases.mjs` is **unexecuted, syntax-checked scaffolding**, not approved infrastructure or proved isolation. Automatic approval review rejected its external execution. Do not run until the owner explicitly approves three empty logical databases and restricted roles on the existing hosted resources, confirms capacity/cost and approves credential custody. Review all database/schema/function privilege boundaries before use; its current public-table privilege check is not a complete isolation audit.

The explicit creation flag is an accident guard, not authorization. It creates random-name synthetic databases from template0 and never copies source rows. It writes generated connection secrets only to a mode0700 temporary directory with mode0600 files, never stdout. Migrate those credentials into the approved secret facility and securely retire temporary files after installation. Output contains references only. On a partial failure it attempts rollback of its own randomly named resources and reports any required operator cleanup. Do not print the secret files, add them to Git or attach them to evidence. Never pass credential values as shell arguments.

Host paths refer to this operator's existing local references. Neither script installs a hosted worker, provisions a provider hard budget, migrates schemas, deploys apps, creates owners or enables federation. The target remains blocked. See the readiness deployment-blockers report for required decisions and tests.
