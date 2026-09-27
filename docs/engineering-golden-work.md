# Golden Work: isolated internal implementation

**Canonical Digital Worker integration (2026-09-27):** `codex/digital-worker-integration` combines M1 implementation `90d668f`, its documentation-only `78b6bef` update, and qualified Gate C `96ae446`. [Combined evidence and canonical commit identity](verification/2026-09-27-digital-worker-integration/REPORT.md) record local M1 **PASS** (Result **PARTIAL**), M1 live **NOT QUALIFIED**, Gate C **PASS / CLOSED**, and **zero cross-boundary authority violations / false Ready**. Migration 0053 and Gate C 0054 are unchanged; the legacy remote migration is renumbered byte-for-byte to registered 0055. The dirty older Digital Worker implementation is superseded, with its historical evidence preserved under its owner. Gate B is **PENDING / READY TO IMPLEMENT only from the final integration commit**; live MyFactory and independent verification of Factory output remain **NOT_RUN**. This baseline adds no Factory writer or dispatch authority.


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

## Native Sofie post-admission continuity (local qualification)

Successful authenticated chat admission commits the bounded route, completion contract and writer session together. The route remains recorded QUEUED until repository opening; canonical Current Truth derives it as an active productive Run when current authority and writer custody pass. This does not revive expired or historical authority. No schema change is required.

Work UI, the admission transition receipt and bounded model context use the same projection. `nativeExecution` distinguishes `NEEDS_ADMISSION`, `ADMITTED_READY_FOR_PRODUCTIVE_WORK`, `IMPLEMENTING`, `VERIFYING`, `REPAIRING`, `COMPLETED` and `BLOCKED`; it exposes the Run, writer, completion contract and deterministic next-operation hint. After admission, the first operation is `engineering_direct open`, followed by repository inspection and engineering work. These observations are never authorization tokens.

The same current writer repeating admission receives `ALREADY_ADMITTED` / `NO NEW ADMISSION REQUIRED` after version, generation, scope, policy and writer checks. It creates no second Run, writer or grant. Execution model schemas omit `admit`. Bounded feedback retains the prior tool operation and a limited outcome excerpt; canonical state remains authoritative. One adversarial duplicate can recover into repository opening. Two consecutive paid native admission proposals stop the next provider request deterministically. Such waste is still charged; neither stage capacity nor the ten-call/$1.30 limit increases.

The Software Engineer role, JStack conventions and potato mode carry into productive execution without changing authority. The local authenticated controlled-provider journey covers opening, reading, deliberate failure, separate protected Docker checks, one repair, and immutable PARTIAL Result. The [continuity dossier](verification/2026-09-27-post-admission-continuity/REPORT.md) distinguishes that evidence from the [failed live run](verification/2026-09-27-m1er1-b4801cb-live/REPORT.md). Qualification is **LOCAL only**: no new live provider authority is issued, M1/ER1 is not yet live-qualified, and publication/CI/review remain unqualified.


## Fresh b3bff2b live outcome — BLOCKED

The [authenticated live evidence](verification/2026-09-27-m1er1-b3bff2b-live/REPORT.md) closes the admission → first repository operation regression: one admission, one Run/writer, canonical post-admission context, then `open` and `read README.md`. Software Engineer/JStack/potato instructions remained in every productive payload.

The full journey did not qualify. The actual sequence was `admit → open → read → open → read → read`; the implementation-stage cap denied the next call. After reading, workspace revision remained 1, the plan remained empty, and canonical next-operation guidance still said `read`. Prior tool feedback was present, but the controlled local provider's progression into planning did not predict the real provider's behavior. No implementation, candidate, protected failure, repair, PARTIAL Result or fresh final explanation was reached.

Six reconciled calls cost $0.088092; reservations and UNKNOWN exposure are zero. Temporary provider and common-ledger authority are revoked, the new Work is paused, and temporary resources are stopped. The unused $0.450564 completion hold and all history remain preserved. No prior Work or migration was retried. M1/ER1 remains **NOT QUALIFIED**, and P0 Gap #2B/Gap #2 remain **PARTIAL**. The next blocker is bounded repository-read → plan/implementation progress through the real authenticated continuation path; no fix or new live window is implied by this evidence update.


## Native productive execution controller — LOCAL PASS

The [controller qualification dossier](verification/2026-09-27-productive-controller/REPORT.md) extends the existing bounded native harness. No schema, authority, completion-budget, ledger, writer, Action Gateway, protected-verification or readiness contract is replaced. The shared `executionController` projection supplies these derived phases:

- ORIENT: open the approved base and inspect README plus existing editable target files. New target files are explicitly recorded as absent from the base. Objective and criteria come from the selected Work.
- PLAN: persist a concise intent with affected files, change, independent verification, assumptions and blockers. A blocker stops productive model spending.
- IMPLEMENT: edit an approved target, then submit changed content. Additional reads require a specific unresolved dependency and do not restart orientation.
- VERIFY: wait for independent evidence; the model cannot count its own checks.
- REPAIR: inspect the exact failed candidate evidence, edit once, then submit the changed candidate for protected verification.
- COMPLETE: local verification passed and an immutable PARTIAL Result exists. The reserved fresh read-only explanation remains a separate completion step. This never means Ready for Review.

Scoped `NATIVE_OPERATION` observations use the existing `eve_events` table. Successful reads are bound to content digests, Work/version/generation, Run and writer. Workspace, candidate, protected evidence, Result and common-ledger records remain authoritative. Event replay is idempotent across durable model-call/tool-call identities; provider-reused tool IDs cannot hide loops. Read-only Work/Chat projections never acquire custody or write observations.

After two consecutive operations without meaningful progress, `NO_PROGRESS` includes completed context, phase and expected productive action. The next turn gets one bounded recovery opportunity; a third consecutive no-progress observation stops another model dispatch. Repeated open/read, duplicate admission, invalid phase operations and unchanged writes do not create new authority or source effects. Phase-specific provider schemas narrow the default tool choice; tool-side checks enforce progression even if the provider ignores its schema. Existing stage and total-call limits still win.

The compact per-turn capsule references unchanged source by digest and paths, retains relevant source/changes and bounded failure excerpts with provenance hashes, and omits detailed telemetry from model payloads. Work retains per-job phase observations, model/productive/coordination/no-progress counts, operations, candidate revisions, verification/repair attempts, spend and Work-control interventions. These are Work-level reliability metrics, not employee scoring.

The full authenticated local fixture used ten controlled calls: one admission, eight productive engineering calls, and one fresh explanation (nine productive calls total). There were zero normal-path admission/open/read loops and zero false Ready events. The original full owner instruction fits the unchanged 14,336-byte admitted input envelope. Atomic operations remain separate; the aspirational roughly-five-turn journey has not been achieved.

M1/ER1 is **NOT QUALIFIED live**. The prior failed windows remain preserved and revoked. Current app/security, completion accounting, protected verifier, PostgreSQL projection, governance and build checks pass. Two older standalone test failures reproduce unchanged on `caad506` and are documented in the dossier; they are not counted as passing current-contract tests. A real provider can still fail or exhaust the bounded window. No new live authority or ER2 work is initiated by local success.

## Final 84be8db live outcome — BLOCKED

The [final fresh authenticated qualification](verification/2026-09-27-m1er1-84be8db-live/REPORT.md) reached admission, repository orientation, structured planning, actual source mutation and protected verification failure. The controller drove these transitions with zero admission/open/equivalent-read loops, one Run and one writer.

The post-failure neutral continuation was denied before a seventh provider call: production repair context measured **16040/14336 bytes**. Repair, repaired verification, immutable PARTIAL and fresh final explanation were not reached. The retained first candidate has an immutable FAILED Result; it is never Ready for Review.

Six calls settled at **$0.061718**. Reserved and UNKNOWN exposure are zero. Provider and common-ledger authority are revoked; the new Work is paused and temporary resources stopped. The unused $0.450564 completion hold and all candidate/evidence history remain preserved. The preceding pricing check placed the full conservative economic plan at $1.126410 within $1.30; that did not prove the actual repair payload would fit.

**P0 Gap #2B: PARTIAL. P0 Gap #2: PARTIAL. M1/ER1: NOT QUALIFIED.** The next Q37 blocker is bounded post-verification repair-context assembly and the remaining authenticated repair → protected PASS → PARTIAL → fresh explanation journey. No product-code fix, another window, ER2, or resumption of the paused MVP task was performed. Earlier status sections above remain historical evidence.

## Bounded repair context — LOCAL PASS

The [repair-context dossier](verification/2026-09-27-bounded-repair-context/REPORT.md) reproduces the exact 16040-byte rejected payload and reduces it to **12488 bytes** with **1848 bytes of headroom** under the unchanged 14336-byte ceiling. A repair-specific capsule keeps objective/criteria, exact candidate and changed source, complete failure diagnostics and verifier identity, and minimal current Work/Run/writer/budget state. Repeated history and state prose are omitted.

Compaction is deterministic and uses no model call. Lower-priority plan narrative is reduced before diagnostic excerpts; any excerpt identifies truncation, original/included UTF-8 bytes and retained artifact reference. In the exact live case, all diagnostics remain complete; only the plan narrative is explicitly shortened. Essential oversized context fails before reservation or dispatch with REPAIR_CONTEXT_TOO_LARGE. Repair requests target at most 13000 bytes including existing overhead.

The controller and effect boundaries are unchanged. Local authenticated controlled-provider tests use the preserved failed plan/source and complete inspect → repair write → submit → independent protected PASS → immutable PARTIAL → fresh explanation in ten total calls. Oversized essential evidence creates no extra reservation or call. Full app/root regression, accounting, projection, verifier, typecheck/governance and production build pass.

**Live M1/ER1: READY FOR FINAL REQUALIFICATION, NOT QUALIFIED. Gap #2B and Gap #2 remain PARTIAL.** No live authority was issued, no prior Work resumed, and no ER2 work started.

## Fresh 90d668f live outcome — BLOCKED

The [new authenticated live qualification](verification/2026-09-27-m1er1-90d668f-live/REPORT.md) proves bounded repair context dispatch within 12355–12574 bytes. It reached protected failure and failure inspection, then proposed two writes using stale revision 2 despite current revision 5 in production context. Both returned “Result needs verification before retry”; neither altered the candidate/draft. The session hard-stop ended the attempt after nine paid calls.

Spend is **$0.118796**, with provider reservations and UNKNOWN exposure zero. The new Work is paused and authority revoked; temporary resources are stopped. Two action-level result_unknown records and both rejected proposals remain preserved, separately from settled provider accounting. No repaired candidate, protected PASS, successful PARTIAL or final explanation was reached.

**M1/ER1: NOT QUALIFIED. Gap #2B and Gap #2: PARTIAL.** Next blocker: repair tool/revision continuity and the remaining protected PASS → PARTIAL → fresh explanation path. No harness fix, extra window, peer resumption or ER2 was started.
