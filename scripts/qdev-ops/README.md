# QDEV operations source

These are preparation tools. No source qualification, approval reference string,
test fixture, or CI run authorizes a real service operation. Real provisioning,
custody, deployment, paid execution, and destructive cleanup require their own
exact owner authorization.

`provision-qdev.sh` prints a plan by default. Execution requires an exact runtime
`QDEV_NEON_ORG`, an owner approval reference, and an existing operator store. It
records only resource IDs and metadata in the visible inventory. Raw create
responses remain in the operator store. A missing or non-Free reported plan stops
further creation after recording the first created resource; no automatic plan
upgrade is available.

The operator-store guard checks owner, mode, and excluded paths. It does not
provide isolation from another process running as the same OS user. An operator
must choose custody outside every coding-agent workspace and respect the host's
separate custody policy. Never put real responses in a test store.

`rollback-qdev.sh` reads exact recorded resources and writes a retention plan. It
does not disable ingress or stop execution. The operator must fence admission and
execution first while retaining ledgers and all uncertain resources. Keep QDEV's
paid-path isolation installed; unsetting its feature flag can select the ordinary
provider path.

`delete-qdev.sh` is a separate destructive action. Its default is a dry run. It
requires a separate delete approval and an exact retention-attestation hash for
execution. Approval and attestation values are operator prerequisites, not a
cryptographic authorization service. The entire inventory must match the fixed
service/name map, organization, region, and unique IDs before any resource call.
Accounting and witness are retained. A malformed or misclassified row refuses the
entire operation. `teardown-qdev.sh` is retired and always refuses.

Run only fake CLI tests during development:

```sh
cd /private/tmp
QDEV_OPS_TEST_STORE_PARENT=/absolute/writable/workspace \
  bash /absolute/path/to/scripts/qdev-ops/test-qdev-ops.sh
```

The parent must already exist outside the current working directory and this
script directory. The harness creates and removes its own synthetic store, uses
a fake `neonctl`, and never receives real credentials. It exits on fixture setup
failure before any cleanup glob is reachable.

`node --test scripts/qdev-ops/test-setup-safety.test.mjs` independently injects
failure into each fixture-directory allocation and verifies that no cleanup glob
or service command runs. This suite supplies no service credentials either.

## Install the isolated runtime journal schema

The production launcher requires `qjourney_event`, `qdev_admission_claim` and
`qdev_retained_admission` in the **new QDEV application/journal database**. They
are separate from the financial accounting database. Startup does not run DDL.

Render the exact runtime constants from the reviewed checkout (no credentials,
database connection or service operation is needed):

```sh
node --import tsx scripts/qdev-ops/render-runtime-schema.mjs > /absolute/reviewed-qdev-runtime.sql
shasum -a 256 /absolute/reviewed-qdev-runtime.sql
```

The renderer has no execution mode. Keep the SQL hash with the exact source SHA
in the installation record. Do not apply it to either tester database, the
accounting database, or a target selected from a default `DATABASE_URL`.

After scoped owner authorization, the installation operator verifies the exact
new application project/database ID against the recorded inventory and creates
a private libpq service named `qdev_20261029_journal` for that target. Its service
and password files stay in operator custody; no connection URL or password is
put on a command line, in source, or in the release manifest. With the selected
file paths available only in the operator environment, apply the reviewed SQL
atomically, with ambient database defaults cleared:

```sh
env -i PATH="$PATH" PGSERVICEFILE="$QDEV_PG_SERVICE_FILE" \
  PGPASSFILE="$QDEV_PG_PASS_FILE" PGSERVICE=qdev_20261029_journal \
  psql --no-psqlrc --set=ON_ERROR_STOP=1 --single-transaction \
  --file=/absolute/reviewed-qdev-runtime.sql
```

The runtime role needs `SELECT, INSERT` on those three tables and `USAGE` on
`qjourney_event_seq_seq`. Grant these only to the exact role in the new
installation record; it needs no DDL, UPDATE, DELETE or TRUNCATE privilege.
The existing app migrations, capability-control schemas and separate financial
schema keep their own reviewed installation steps. This renderer does not
install or activate them, create a cohort, issue a grant or reserve money.

Focused verification uses a randomly named disposable PostgreSQL 17 database:

```sh
MYEVE_ISOLATED_COHORT_TEST_DATABASE=postgresql://postgres@127.0.0.1:PORT/postgres \
  node --import tsx --test scripts/qdev-ops/runtime-schema.test.mjs
```

It proves actual journal append/recovery, exclusive preparation claims,
append-only guards, restricted runtime privileges and preservation of existing
history when the rendered schema is reapplied. With no test URL, the database
case is reported skipped; the render/refusal control still runs.
