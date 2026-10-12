# Independent PostgreSQL recovery witness

This source adds a server-compatible witness adapter to the existing capability recovery contract. It preserves the filesystem adapter and the existing application policy registry. The witness holds only an exact owner/organization/installation/epoch enrollment and the monotonic revision/digest of existing authority inputs. It is neither an authorization service nor an execution/accounting ledger.

## Trust boundary and provisioning hold

`independent-witness.sql` is a separate-store schema proposal, not an application migration, startup script or automatic provisioning path. A separately authorized custodian must qualify and provision the store, backup/restore separation, immutable enrollment, installation binding digest, qualification digest/expiry and restricted credential. Runtime code has no initialize, delete, reset, enrollment-update, schema-create or credential API. No actual installed witness, grant or credential was created for this source change.

The witness runtime receives only schema USAGE and EXECUTE on `read_head` and `advance_head`. The functions bind `session_user` to the exact immutable owner enrollment and reject elevated privileges, including NOINHERIT membership that could permit SET ROLE to a writer. Tables deny direct runtime writes. Enrollment update/delete/truncate and head rollback/delete/truncate are rejected. There is no reset function. A new incarnation or legitimate privileged input change needs separate custody requalification; runtime cannot erase the old high-water mark.

An independently retained witness is a required trust assumption. A different URL/database name alone does not prove separate custody, credentials, backups or restore boundaries. Restoring the witness itself to an old value alongside the application is outside this adapter's guarantee and must remain prohibited by the qualified retention procedure. Local two-database tests prove the algorithm, not installed independence.

## Configuration and operation

The PostgreSQL adapter requires all of:

- `MYEVE_CAPABILITY_RECOVERY_EPOCH`
- `MYEVE_CAPABILITY_RECOVERY_WITNESS_DATABASE_URL`
- `MYEVE_CAPABILITY_RECOVERY_WITNESS_ENROLLMENT_ID`
- `MYEVE_CAPABILITY_RECOVERY_WITNESS_QUALIFICATION_DIGEST`
- `MYEVE_CAPABILITY_RECOVERY_WITNESS_INSTALLATION_DIGEST`
- Existing `MYEVE_CAPABILITY_DATABASE_URL`, for same-database rejection.

No filesystem directory may also be configured. Outside loopback, the witness URL requires `sslmode=verify-full`; URL host/port overrides and other query options are rejected. Credentials are never logged. The package declares the already-locked `pg@8.20.0` runtime dependency; no version upgrade or new registry download is required.

Every comparison reads the independent database; no policy head is accepted from a process cache. Read and CAS validate current immutable enrollment, qualification/installation digests, expiry and exact tuple. The application continues using its existing pinned policy transaction and owner lock. Before the app commit, the witness performs its own durable monotonic compare-and-swap. There is no distributed transaction or compensation. A failed, ambiguous or lost application commit can leave the witness ahead; subsequent operations quarantine instead of rolling it back. An identical head check is read-only; conflicting or backward updates fail closed.

Each independently committed query uses a bounded pool (two connections), connection/statement/idle transaction timeouts, and a client query deadline. `closeRecoveryWitnessDatabases()` is exported for process/test shutdown. No direct server or production integration is performed by importing the adapter.

## Qualified source tests

`packages/capability-enforcement/test/postgres-recovery-witness.test.ts` uses two newly created local PostgreSQL databases and restricted synthetic roles. It covers current reads; exact scope and epoch; configuration isolation/TLS; denied runtime enrollment/reset/table writes; overprivileged and NOINHERIT role rejection; actual `pg_dump`/restore behind a retained revocation witness; restart with an old in-memory head; app commit interruption after CAS; concurrent conflicting CAS; backward/repeated updates; expired enrollment; and missing witness database. Fixtures remove only their own databases and roles.

Run with an explicitly selected disposable loopback cluster:

```sh
CAPABILITY_WITNESS_TEST_DATABASE_URL=postgresql://127.0.0.1:55855/postgres node --import tsx --test packages/capability-enforcement/test/postgres-recovery-witness.test.ts
```

This is synthetic qualification. No real owner binding, external-alpha record, installation FactoryVersion, model operation, spending ceiling, UNKNOWN exposure or release hold changes.

## Hosted activation remains blocked

`apps/eve/lib/capability-control/runtime.ts` retains its blanket Vercel/production guard unchanged. Automatic approval review rejected a proposed narrow hosted exception as a new security-boundary change without sufficiently explicit human authorization. The rejected exception was not applied or rerouted. The separate proposal document records the exact conditions for a consolidated human decision. This adapter alone does not make a hosted installation ready or active.
