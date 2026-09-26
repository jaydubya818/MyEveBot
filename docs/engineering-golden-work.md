# Golden Work: isolated internal implementation

This branch implements a bounded internal engineering workflow. **It is not a qualified external Alpha or an approved Production release.** The qualification dossier distinguishes live executor evidence, real PostgreSQL/Docker tests, provider simulations and blocked live GitHub gates.

## Supported scope

One owner-bound primary Agent, one private qualification repository, one Claude Code executor, bounded UTF-8 Node CLI source files, protected black-box input/output checks, and a human-approved draft PR. A configured profile declares exact allowed source paths, acceptance criteria, required CI names, authorized reviewers, a pinned executor image, finite Runs/model calls, budget and deadline.

Merge, deployment, production access, repository administration, secrets/workflow mutation, arbitrary MCP actions and automatic executor failover are outside the adapter surface. Relay is not in the engineering execution path. The prior peer implementation is preserved.

## Durable ownership and execution

`WorkStore` owns intent, versioned criteria and control generations. `ExecutionStore` persists the contract, Runs, attempts, retained candidate content, publication decisions/effects, evidence and immutable Result snapshots. Optimistic versions, exclusive expiring SQL worker leases and Work generation checks fence stale writers. Immutable transition history retains meaningful state changes; unchanged GitHub observations only refresh current truth and do not duplicate whole histories.

The worker progresses persisted phases independently of the browser. It polls authoritative GitHub checks/reviews, starts fresh bounded Runs for CI failure and explicit in-scope review checks, retains candidate files and Git object identity before removing executor resources, and runs protected verification. A human takeover invalidates the prior generation. Give Back reconciles the current branch and starts a new Run automatically; it does not force-push over a human change.

The local supervisor restarts a failed worker process. This restart mechanism must still be exercised in the complete live no-babysitting run; reconstructing a worker object in a test is not equivalent qualification.

## Executor and verifier boundaries

Claude Code 2.1.282 runs as UID 1000 with a read-only root filesystem, finite CPU/memory/PIDs, an isolated volume and internal network. It has no publication, database, provider, organization or production credential. The only network service is a proxy that accepts the Messages route and forwards it to a dedicated bounded model broker.

The broker authenticates an attempt-specific HMAC token, checks the current Work generation/attempt/deadline, validates the exact model and allowed provider features, and atomically reserves conservative cost and request count in PostgreSQL before each provider call. It holds the provider credential outside the executor. Unknown usage retains the full reservation. Reported cost is explicitly **reservation coverage**, not a claim of exact provider or infrastructure spend.

The verifier executes candidate programs in separate network-disabled containers with read-only candidate files. The trusted supervisor compares exit code and stdout against owner-configured expected values. Candidate output cannot directly write evidence or set PASS. Timeouts and unavailable results remain UNKNOWN. Evidence binds the candidate, base, criteria version, canonical profile hash, environment/image, check, producer, attempt, timestamp and artifact hash. JSON hashes are canonical across PostgreSQL jsonb ordering.

This milestone deliberately supports small CLI contracts, not arbitrary application test suites, package installation or repository-provided test runners. Extending that boundary requires separate qualification.

## Publication and current truth

The trusted GitHub adapter rechecks private repository identity, current push authority, base/head, candidate artifact identity and allowed changed paths. It creates Git objects, a dedicated Work branch and one draft PR. Updates are never forced. Exact initial candidate approval is durable; the owner can separately authorize bounded updates within the same unchanged contract.

A stable effect identity is recorded before publication. An ambiguous write remains EXTERNAL STATE UNKNOWN. A later observation can confirm the exact candidate and draft PR without replaying the write. If it cannot, Work needs human reconciliation. No model statement can convert the effect into success. These engineering effect IDs are retained in the Work execution record; they are not asserted to be canonical chat Action Gateway IDs.

Readiness compares the current candidate/head, current protected evidence, latest required CI attempts, addressed review checks, authority, decisions, unknown effects, control and deadline. An observation older than 60 seconds cannot produce Ready for Review. The UI clears its readiness claim when refreshing current state fails. Results retain the evidence and observations that justified their particular immutable version.

## Review continuation contract

Unstructured, unauthorized, out-of-scope or ambiguous review requests become Needs You. For this bounded milestone an authorized reviewer can explicitly attest that a black-box check is within an existing criterion:

```json
{
  "scope": "within-existing-criteria",
  "criterionId": "the-existing-criterion-uuid",
  "instruction": "Reject fractional quantities with the existing invalid-quantity response.",
  "check": {
    "program": "quantity.mjs",
    "input": "1.5",
    "expectedOutput": "{\"error\":\"invalid_quantity\"}\n",
    "expectedExitCode": 0
  }
}
```

The program must be an already allowed path. The new protected review check must pass before that review is considered addressed. This is an explicit human attestation, not a model's semantic guarantee that arbitrary prose stays within scope.

## Local setup and reproducible checks

Do not reuse another task's environments. Provision a disposable PostgreSQL 18 container bound to `127.0.0.1:55468`. Apply the entire ordered migration manifest. Current additions are `0039_engineering_work.sql`, `0040_app_settings.sql`, and `0041_engineering_execution.sql`; canonical 0036–0038 remain unchanged.

Build `apps/eve/scripts/engineering/Dockerfile`, inspect its actual digest and place that pinned image in the approved repository profile. The fixture tests record the exact locally qualified image digest. Rebuilt images require updating and requalifying the profile.

The runtime requires `MYEVE_ENGINEERING_MODE=dogfood`, a private absolute-path `MYEVE_ENGINEERING_CONFIG` file matching `runtimeSchema`, the exact synthetic owner/active primary Agent, `MYEVE_ENGINEERING_GITHUB_TOKEN` only in trusted server/worker processes, a dedicated `MYEVE_ENGINEERING_BROKER_SECRET`, and model Gateway authentication only in the trusted worker. Do not put credentials in the profile or the executor image/workspace.

The runtime config must also contain `approvedBase`: the owner-approved base SHA and a reviewed manifest of every base file's path and SHA-256. For the Golden fixture, the SHA is pinned in code to `db5d95cf3d1dadf04a118f38bd5b388a5a226c31`. Intake checks that `main` still points there and that all five UTF-8 files match the separately pinned manifest **before creating or admitting Work**. There is no manifest default. A moved base, changed bytes, extra file, changed issue/profile, or missing manifest blocks admission.

For the approved local GitHub App qualification, the config's `githubApp` object supplies the non-secret App ID, installation ID, Keychain service and Keychain account. The trusted host reads the App PEM from macOS Keychain into memory, signs a short-lived JWT, and requests an installation token restricted to the one configured repository and explicit read/write permissions. Token/key values are never written to Work, the executor or logs. The static token setting above remains a local compatibility path for earlier fixtures; the live approved run uses the App path.

`test/golden-live-local.mjs` is an explicit-opt-in local harness for `jaydubya818/myeve-golden-work-qual`. It starts task-owned loopback PostgreSQL/Next/worker processes, and only loads the Vercel **development** OIDC value into the trusted worker. The repo has a pre-existing `quantity-ci` check and 11 tests. The harness's recorded `parse-int-fraction` first-Run fault deliberately leaves fractional parsing wrong so GitHub CI can fail on a real published revision; the next Run must repair it. The protected first-Run checks intentionally omit that fractional case; CI remains mandatory for readiness. This is a disclosed fault injection, not an unexplained coding failure.

Once the App is installed, run `GOLDEN_GITHUB_APP_ID=<non-secret-id> GOLDEN_GITHUB_INSTALLATION_ID=<non-secret-id> node --import tsx scripts/propose-golden-base-manifest.mjs` from `apps/eve`. It performs read-only GitHub calls and prints a proposed JSON manifest only when `main` still points to the approved SHA and the bounded five-file shape is present. Review all paths and hashes independently, save that JSON in a private absolute-path file, and set `GOLDEN_APPROVED_BASE_MANIFEST` to that file when first creating the live harness config. The harness will not auto-approve the current GitHub tree or silently upgrade an existing config without a manifest.

The GitHub App private key can be imported with `swift scripts/engineering/import-github-app-key.swift /path/to/downloaded-key.pem` from `apps/eve`. The importer verifies Keychain readback and only then removes the downloaded PEM. It does not pass the key through shell arguments. GitHub installation tokens expire; the trusted runtime refreshes them before expiry. This local harness is not a hosted worker or organization boundary.

The worker requires `MYEVE_ENGINEERING_DATABASE_URL` to identify its own loopback `golden_*` database. It ignores ambient `DATABASE_URL` for worker storage and refuses a Vercel Production environment. Run `node scripts/engineering-worker-supervisor.mjs` from `apps/eve`. The browser/server uses its separately configured isolated SQL connection. The included browser fixture provides a loopback Neon protocol bridge solely for tests.

From `apps/eve`:

```sh
node --import tsx test/engineering-work.integration.mjs
node --import tsx test/golden-work.integration.mjs
npm test
npm run typecheck
npm run db:migrations:check
```

`golden-work.integration.mjs` uses **simulated GitHub and executor events**, real PostgreSQL and real protected Docker verification. It is not a live GitHub run. `golden-executor.live.mjs` requires explicit `GOLDEN_LIVE_EXECUTOR=1`, a development-only credential fixture, and uses real Claude/Gateway calls under an $8 reservation ceiling. `golden-ui-fixture.mjs` requires explicit `GOLDEN_UI_FIXTURE=1` and visibly labels all provider fixtures as simulations. Do not point any of these scripts at customer or production data.

## Required completion gate

The approved disposable private GitHub repository, existing `quantity-ci` workflow and independent owner reviewer are now identified. The publisher App registration, installation and local key import must finish before the final live run. That run must prove actual issue intake/publication/CI failure/review continuation, process restart, auth loss, event delay/duplicates, browser disconnection and terminal readiness without manual orchestration. No merge or production deployment is authorized by local test success.
