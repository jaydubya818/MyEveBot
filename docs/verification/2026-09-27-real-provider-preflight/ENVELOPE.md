# Blocked live qualification plan — NOT AUTHORIZATION

## Exact path and billed effects

The intended path is MyEve Factory route/admission → connected PREPARE/START → exact WorkOrder and attempt → `JobManager.executePrepared` → `packages/agents.runCodex` → installed `codex exec` → loopback `SpendGateway` → OpenAI `POST /v1/responses` → proposed GPT-5.5 snapshot. PREPARE/READ/STOP, signing, local Git, receipt admission and offline protected Docker verification create no provider inference charge. Every gateway outbound request can bill input/cached-input/output (including reasoning); retries and CLI follow-up turns are separate operations. Result summaries produced by the same CLI also consume operations. Fresh Sofie/model explanations or native repair may create separate paid effects through MyEve's existing common/model budget; they are not automatically charged to the Factory ledger.

At 8f5, `server.ts` exposes only backend-injected **localSpendFixture**, requires injected worker/verifier and restricts upstream to loopback. `dispatch-control.ts` returns DISABLED without a fixture; `jobs.ts` blocks default Codex without a gateway. The gateway class can accept HTTPS, but no qualified connected production configuration wires it to a real provider. Do not pass an HTTPS endpoint as a local fixture or call the gateway directly to evade connected admission.

The child CLI ignores user config, has isolated HOME/CODEX_HOME and receives only a gateway child token. The upstream provider key stays in the gateway process. Existing ambient CLI authentication is neither the intended key source nor proof of scope or spend authority. Neither a real API call nor a credential-authentication probe was made.

## Credential handoff — HUMAN_ACTION

No dedicated intended provider identity, project, secret reference or expiry is supplied/configured in this pinned producer. Availability for this qualification is therefore **not established**; the task did not search/copy personal credential stores.

Once producer release invariants are fixed, the account owner must identify a dedicated OpenAI project/service identity with access to the exact model and sufficient billing, specify the intended non-secret secret-manager/environment reference for the gateway alone, and provide non-secret project/identity identifiers, endpoint/region, key permissions and expiration/revocation time. Keep the secret in the approved credential store; do not paste it into chat, Git, evidence, the child CLI or the fixture. Restrict the credential to the necessary Responses capability where supported, disable other capabilities in the gateway, and define prompt revocation after this one qualification. Account caps remain defense in depth, not the Work ceiling. A scoped credential and a separate bounded live authorization are both required; neither repairs the present completion/UNKNOWN gaps.

## Price reference and conservative arithmetic

Observed **2026-09-28 00:07:08 UTC**. OpenAI's [GPT-5.5 model page](https://developers.openai.com/api/docs/models/gpt-5.5) lists $5 input, $0.50 cached input and $30 output per million tokens; available snapshot `gpt-5.5-2026-04-23`, context 1,050,000 and max output 128,000. Input above 272,000 changes the whole session to 2× input and 1.5× output. Regional processing adds 10%. The [pricing page](https://developers.openai.com/api/docs/pricing) also identifies separately charged hosted tools. [Prompt caching documentation](https://developers.openai.com/api/docs/guides/prompt-caching) specifies no extra GPT-5.5 cache-write charge. See [machine-readable card](price-card.json). Effective date beyond this observation is not published; refresh before approval. Default nonregional direct endpoint only; no fast/priority/flex/batch substitution.

Conditional planning example, **not a qualified cap**: 64,000 total billable input tokens and 8,192 total output tokens per operation, no cache discount in reservations. Each reserve is `64,000 × $5 / 1M + 8,192 × $30 / 1M = $0.565760`. Three operations total `$1.697280`; 10% contingency gives `$1.867008`, rounded upward to a proposed `$1.90` Work ceiling. Phase plan: one coding/patch request; one post-tool/result-finalization request; one fresh explanation if paid. Signing, artifact collection and deterministic verification are unpaid. No repair/retry is included: failure stops with retained evidence. Additional model calls, including tool continuations, require denial once the phase count is exhausted. This is a planning calculation, not proof that the CLI can complete in those calls.

These small input bounds are **not proven** by the current gateway's JSON-byte-length check. Provider framing/hidden content and billable usage are not bounded by a provider token limit before dispatch; excess usage is noticed after the response. Reserving the complete advertised model window instead is conservative: at long-context rates and 8,192 output tokens, `$10.868640` per call, `$32.605920` for three calls before margin, above the producer's existing $20 maximum. Do not raise that maximum. Qualify a smaller actual billable input bound before calling the $1.90 proposal safe.

The gateway currently settles all input at the uncached rate and ignores cached-token breakdown. That can conservatively overstate usage-based spend, so its `actualMicrousd` must not be represented as invoice-exact cached billing. Qualify the intended accounting semantics before LIVE. The public price reference is established; the exact live runtime card and account applicability remain pending.

## Tool exclusions

Only text Responses and local file/shell tools required to change the allowed file may be used. No hosted search, hosted shell/container, code interpreter, image/audio/video, file search/storage, MCP, remote URLs, cloud sandbox, external package installation or external command networking. The producer disables web search and rejects known hosted tools/modalities and non-default tiers. Its allowlist also accepts `tool_search`; the first live envelope must explicitly exclude it unless its exact execution/billing semantics are qualified. Local custom/function tools must not create external billed effects. Provider-only authentication belongs in the gateway, not a tool subprocess.

## Fixture and identity

| Item | Pinned value / current limit |
| --- | --- |
| Consumer source | b15905f273b7a1c62f1a840de92ab6caa78f21dd; this tranche changes documentation/evidence only |
| Producer local candidate | 8f5e3774129b5f9f4b1c9655ffbbb531cd20fa0f; canonical d956 remains unchanged |
| Factory | Proposed dedicated factory-q37-live-01; no live authority installed |
| FactoryVersion | **UNQUALIFIED / NOT PINNED FOR LIVE**; signed configuration does not include price card, context/output caps, operation count or completion plan. A separately immutable, validated budget policy must bind these to the exact attempt; do not invent an attested version. Historical LOCAL_SPEND_FIXTURE version is 73bb9ac6924974163c558a5e5d692e30fa64cbe77eab77d22c64599e6eea108d, with injected synthetic Codex; it cannot be reused as a live version. |
| Repository | /private/tmp/q37-readiness-qualification/live-fixture; private local synthetic Git repository with no remote |
| Base | 024bab53fbde4577deab812a1e9705f8118b176f |
| Bundle | ../2026-09-27-live-readiness/live-fixture.bundle; SHA256 6e72f003b10d9e37d4d4df6cd8e57c44cb8e25556b2ac10b180f078f31d45b1b |
| Allowed change | quantity.mjs only; all other fixture files fixed |
| Objective | Trim stdin; print JSON quantity for a positive integer, otherwise JSON invalid_quantity, following the retained Node ESM fixture contract |
| Acceptance | Ten exact checks in ../2026-09-27-live-readiness/live-fixture.json; exact signed attempt receipt; terminal/quiescent writer; immutable candidate; protected verification PASS; retained PARTIAL Result and truthful explanation |
| Verification | `node --test test/quantity.test.mjs` plus the retained ten protected input/output checks, using existing read-only offline Docker verifier against the exact candidate SHA |
| Artifacts | Local candidate commit; signed result, manifest, source/config identities; Gate C receipt; protected check evidence; durable Result; per-operation usage/request identities and final ledger; cleanup record |
| Artifact limits | ≤200 text files / 500 KB tree; ≤100 KB/file; ≤4 MiB artifact; ≤12 MiB result envelope |
| Budget | Authorized live **$0**; proposed **$1.90**, NOT QUALIFIED; cumulative across the Work, no reset |
| Operations | Authorized live **0**; proposed **3** across all phases, NOT ENFORCED |
| Attempts | Proposed **1** Factory attempt; no repair, automatic retry, fallback or blind redispatch |
| Duration | Proposed **600 seconds** including completion; provider-call timeout and cleanup must fit; no automatic extension |
| Allowed effects | Isolated local candidate/evidence, signing, offline protected verification, PARTIAL Result; model effects only after a future explicit live authorization |
| Forbidden effects | GitHub/push/PR publication, Relay, deployment, merges, account/repo changes, secrets, workflow changes, unrelated files, paid hosted tools |

The original fixture and bundle were rechecked without modifications. No provider request occurred. The same-Work/FactoryVersion/operation-count/caps/cleanup full dry run cannot PASS until the release blockers are fixed. Existing loopback integration used injected synthetic Codex and different caps/price; the installed-CLI test used a failing fake provider. Neither is the requested full dry run.

## Stop conditions and cleanup

Stop before any new outbound request on owner revocation, unqualified/mismatched/expired price, missing/failed credential, reservation denial, any UNKNOWN exposure, incomplete accounting, FactoryVersion/source/config mismatch, unexpected model/provider/tool, invalid artifact, duplicate execution, authority conflict, failed acceptance, exhausted operation count, deadline or ceiling. No budget increase, operation-count increase, Work-ID reset, credential substitution or automatic retry.

1. Revoke temporary admission authority and deny new gateway operations; persist cancellation through the existing Work ledger and producer STOP path.
2. Stop the exact Factory attempt/process group; read authenticated terminal/quiescent proof before releasing writer custody. Credential revocation is not quiescence proof.
3. Reconcile every operation with authoritative provider response identity/usage. Retain all UNKNOWN and unresolved reservations; never infer refund from a timeout, cancellation or missing response.
4. Retain signed receipt, candidate, verifier evidence, immutable identities, operation accounting and cleanup log. Preserve historical custody and PARTIAL status.
5. Close gateway/provider listeners and task-owned verifier containers/workspaces only after evidence retention. Verify no task-owned process, container or gateway listener remains; do not touch retained/shared resources.
6. Revoke the dedicated temporary credential/grant through the account owner. Report unresolved remote effects honestly; stop without another attempt.

Local probe cleanup PASS is retained in probe.json. Live cleanup remains NOT_RUN. To unblock: qualify the existing producer boundary's phase/operation/UNKNOWN policy and real connected configuration, then use the intended scoped credential metadata, obtain authorized independent review and rerun an identical controlled full envelope. Do not create a second budget architecture.
