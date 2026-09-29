# Canonical live private-alpha evidence dossier — 2026-09-29

**PRIVATE ALPHA: PARTIAL.** Both web deployments and production migrations succeeded; activation and the real journey remain blocked by pending approvals and provider provisioning. See [authorized database and worker continuation](continuation.md) for the latest backup, migration rehearsal and connected-worker evidence. The inventory below records the earlier baseline.

**Initial assessment:** Canonical deployment and the real Golden Journey have not run. Existing Sofie and Relay endpoints are healthy on older source. This dossier is the live qualification record, including explicit unrun gates; local checks below are not live acceptance.

Integration owner: this private-alpha release chat, for Jay. One `codex/private-alpha-release` branch per affected repository. Base commits were fetched and matched remote main and peeled milestone tags before source work. Dirty primary checkouts were not used or modified. No historical feature branch was resurrected. Relay remains unchanged. Factory release candidate `33fd5c97fdafbf740c92261b52b0d9b76a46ecd6` is pushed and remotely verified on its dedicated release branch; it is not merged or activated. Any release successor must be committed, pushed, remotely verified and qualified before deployment; candidate source is not automatically the deployed baseline.

## Source and actual deployment

See [source manifest](source-manifest.json) and [deployment observations](deployment-observations.json).

| Repository | Verified canonical main / milestone target | Actual live source observed |
|---|---|---|
| MyEve | `f1dca8051c2e963a2ba2d902c5803b1f8c7a7f72` | `7c1e10777429278d99e5172720768ac967c5410a` |
| Relay | `a61f0ef697b02cf22da72ff2904c584d7faa026a` | `3fdeeb4ce43ef34ff88c8abdf308c77d4ef83f0d` |
| MyFactory | `af6f37102a28c1da2b3990ed58f921174298a9c2` | New alpha supervisor not started |

Existing target: Vercel team `jaydubya818`, Sofie project `sofie-personal-agent` with root `apps/eve` and Node 24; Relay project `relay`. Reuse their existing Neon databases and Blob configuration after verified backup, migration preflight and restore validation. Canonical Vercel configuration disables automatic main deployment in both repositories; use an intentional deployment after source qualification. Do not infer deployment from a main merge.

Sofie `/login` and `/eve/v1/health` return 200, while `/api/beta/work` and `/api/beta/results` return 404 on the existing deployment. Relay `/api/health` and `/api/health/ready` return 200. HTTP liveness and Vercel Ready do not qualify the alpha.

## Capability inventory from canonical source

| Area | Canonical source / configuration | Live qualification |
|---|---|---|
| MyEve | Vercel Next/Eve app; beta composition originally restricted to local qualification | New source not deployed |
| Relay | Existing separate Vercel project, crypto/federation configuration, maintenance cron | Old source healthy; canonical source not deployed |
| MyFactory | Local supervisor, SQLite v8, authenticated V2 dispatch, signed results and independent offline verification | Default paid execution disabled; new explicit startup candidate prepared |
| Database / migrations | MyEve 67 files through 0071, immutable lineage bridges; Relay 29 entries through 0028 | Target ledger/role access and backups not read this session |
| Authentication | Signed owner sessions; distinct partner owner/password config; legacy deployment-account routes reject partner | Primary auth keys present by metadata; partner keys absent |
| Files | Private Blob configuration present; authenticated owner routes and immutable revisions | Storage access not exercised |
| Memory | Canonical scoped records, correction/history and retrieval; Supermemory key configured | Cross-session real-model recall not run |
| Knowledge | Owner records plus explicit business/Work grants; no implicit shared deployment context | Two-owner live test not run |
| Goal OS / continuation | Canonical Goal service, retained Task/Work bindings, exact continuation responses | Beta runtime activation candidate; live continuation not run |
| Inbox / Needs You | Canonical correlation, scoped attention and exact retained owner response | No real inbound event or continuing Work yet |
| Results / Proof | Canonical candidate/provenance/evidence projections, truthful PARTIAL states | No live producer/candidate/result; do not promote |
| Provider/model | Pinned OpenAI Responses model, Keychain reference, Work ledger, UNKNOWN stop and protected completion | Keychain item absent; zero real model operations |
| Computer / browser | Existing governed sandbox/Orgo/local bridge implementations; optional | Not enabled or exercised for this release |
| Apps | Composio, Linear, Relay server configuration names exist | No critical app assumed ready from key presence |
| External effects | Exact owner approval, scope/policy/current candidate checks and uncertainty reconciliation | First effect approval and exactly-once test not run |
| Two owners | Private, explicitly shared business, bounded Work context implemented | Partner onboarding and live negative/positive matrix not run |

## Narrow release fixes prepared

MyEve applies the prepared patch already present in canonical `docs/verification/beta-integration/alpha/private-alpha-runtime.patch`: explicit `MYEVE_BETA_MODE=private-alpha` uses the canonical application database after configured auth/owner and finite repository/Work limits. Qualification remains disposable and forbidden in production. Existing scheduling and business scope composition select the same explicit runtime. No migration, owner grant, provider dispatch or sharing authority is added.

MyFactory adds an opt-in startup entrypoint and pinned provider configuration through its existing V2 gateway. It excludes fixture workers/verifiers and authority overrides, requires result signing, pins the worker model, and caps live Work at $1.35/600 seconds/three productive operations plus one protected completion. Default startup remains disabled. See MyFactory `docs/private-alpha/README.md` and `provider.json` on the dedicated release branch.

Blast radius: MyEve changes composition/configuration plus tests/governance/documentation; Factory changes startup, model selection and additional admission ceilings plus tests/governance/documentation. These fixes prepare existing capability activation. They do not complete the deployed worker connection.

## Explicit configuration

Proposed application settings, not applied to Vercel:

```text
MYEVE_BETA_MODE=private-alpha
MYEVE_ALPHA_REPOSITORY=jaydubya818/myeve-golden-work-qual
MYEVE_ALPHA_MAX_WORK_USD=1.35
MYEVE_ALPHA_MAX_WORK_SECONDS=600
DATABASE_URL=<existing server-side database credential>
MYEVE_OWNER_ID=<existing configured primary owner; preserve identity>
MYEVE_ACCESS_PASSWORD=<existing secret>
MYEVE_SESSION_SECRET=<existing secret>
MYEVE_PARTNER_OWNER_ID=<distinct approved partner identity>
MYEVE_PARTNER_ACCESS_PASSWORD=<distinct secret provisioned by owner>
```

No secret values belong in this file. Do not fill them in source. Preserve Jay's existing owner identity; historical docs indicate `owner`, which still needs configuration readback rather than inference.

Intended enabled scope: authenticated private/shared product state, Files/Memory/Knowledge, Goal/Inbox/Needs You/Result/Proof, and one bounded Factory execution after qualification. Phone, payments, broad channels/providers, optional Computer and unqualified Apps are deferred. Existing deployment environment flags have not been mutated; this is not a claim that optional capabilities are already disabled there. The deployed configuration needs an explicit audited allowlist before activation.

## Concrete blockers and remaining engineering

1. Automatic approval review rejected exporting **all production environment secrets to temporary files**. Nothing was exported. A narrower request to use only the existing database credentials for protected backups and migration validation/application is pending. Prefer scoped in-memory use; no bulk export workaround was attempted.
2. The canonical engineering runtime rejects Vercel production, the Factory adapter requires loopback, and `scripts/factory-worker.ts` only accepts its fixed disposable database. The beta Factory endpoint additionally allows only fixture qualification modes. These are actual code boundaries, not missing environment variables. Complete a reviewed hosted-product/local-worker composition using canonical admission, shared durable state and current authorization before enabling execution. Do not expose localhost publicly, bypass gates, reuse synthetic evidence as LIVE, or relabel legacy Linear intake as this V2 journey.
3. Provider Keychain metadata lookup found no item at `keychain://com.myeve.myfactory.q37/openai-provider`. No value was read. Provision in macOS Keychain Access: Password Item name `com.myeve.myfactory.q37`, account `openai-provider`, password the provider key. After provisioning, validate model access without a generation call, and obtain explicit approval immediately before the first model operation.
4. Partner identity and a distinct credential require Jay. Use canonical environment-backed partner onboarding and explicit business membership/grants; never share existing private objects automatically.
5. Result, Proof and Goal progression still need real evidence and owner continuation. No Ready promotion or external-effect approval is requested prematurely.

## Real Work preparation and preflight

Canonical fixture bundle SHA-256 `6e72f003b10d9e37d4d4df6cd8e57c44cb8e25556b2ac10b180f078f31d45b1b`; base `024bab53fbde4577deab812a1e9705f8118b176f`. A clean isolated clone at `/private/tmp/private-alpha-live-fixture` has no remotes. Only `quantity.mjs` may change. Four valid and six invalid input cases plus a file-existence check currently fail because the implementation is absent. Protected acceptance uses canonical test bytes independently of the candidate. No model was used to fill in the solution.

Provider model `gpt-5.4-mini-2026-03-17` and standard rates ($0.75/M input, $4.50/M output) were checked against [official model documentation](https://developers.openai.com/api/docs/models/gpt-5.4-mini). With 400,000 input context and 8,192 output cap, full per-call reservation is $0.336864, including a separate protected completion slot. Four calls reserve $1.347456 within $1.35. Provider reachability with authentication, model access, secret resolution, live supervisor mode and active Work cancellation must still be verified before approval. The price card expires and cannot be silently refreshed on an admitted Work. Hosted paid tools remain rejected by the gateway. Billing classification is not a launch blocker.

## Qualification and evidence

See [machine-readable qualification](qualification.json) and [raw local checks](checks/). MyEve: 1,883 application PASS / 61 gated skips, 141 root PASS,15 builder PASS with types/manifest PASS, configuration3 PASS, types/governance PASS,67 migration files validated, webpack production build PASS. Factory:138 PASS / one opt-in installed-CLI skip, producer types/governance/build PASS. No tests used production credentials or a real model. Initial test typing/strip-only syntax failures were fixed before final successful checks; initial failures are not live incidents.

The Golden Journey, Memory correction/retrieval, Goal continuation, Needs You auto-resume, two-owner isolation, Today real-state views, Daily Brief, restart, deployed desktop/390px and accessibility are **NOT_RUN**. Inbox and Computer remain optional follow-ups until their actual configured paths are qualified. Local regression evidence cannot satisfy these gates.

Live safety counters and avoidable coordination debt are **unmeasured**, not zero. No real provider operation or external effect was attempted. No authority-expanding production change was performed. Do not infer cross-owner safety from an unexecuted test.

## Backup, recovery and rollback

Backup/restore is NOT_VERIFIED in this session. Before migration, verify target database identity/ledger and provider backup/PITR retention; take a protected logical backup and restore to a disposable database where practical. Validate migration checksums and exact lineage with canonical `migration-runner.ts` / `published-main-bridge.ts`. Use the runner with a transaction-capable PostgreSQL driver for multi-statement blocks; never directly apply files or rewrite historical ledger entries. Relay uses its canonical Drizzle migration runner.

Retain previous Vercel deployment IDs in deployment-observations.json. Application rollback is only to a schema-compatible source after migrations. Never erase applied migration history. Quiesce Work admission before worker restarts; retain exact request/writer identity, UNKNOWN ledger exposure, candidate custody and external-effect uncertainty. Read back the same attempt instead of redispatching. Runtime signing/client keys and SQLite need protected persistent storage, separate from repository source and temporary qualification checkouts.

## Resume order

Resolve scoped database access; finish reviewed hosted/local worker composition; provision provider/partner secrets; validate backups and target migrations; commit/push/remotely verify all release successors and integrate qualified main; deploy exact canonical commits; run real preflight; obtain the first model approval; execute one bounded Sofie Work; verify Result/Proof; obtain exact external-effect approval; then complete the continuation, memory, restart, two-owner, Today/Brief and browser/accessibility matrix. Optional channels/Computer do not hold core launch. Do not claim PRIVATE ALPHA READY until the real path is usable.
