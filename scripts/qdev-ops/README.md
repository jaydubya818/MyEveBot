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
