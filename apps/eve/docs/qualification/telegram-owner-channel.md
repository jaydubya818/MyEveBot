# Telegram owner-channel companion qualification

## Verdict

**INCOMPLETE. Execution remains disabled. Live Telegram scenarios: 0.**

This is a local MyEve companion draft for Relay's Telegram private-beta branch. It is not a qualified release. `OWNER_CHANNEL_RELEASE_QUALIFIED` remains false. Setting `MYEVE_RELAY_OWNER_ENABLED=true` cannot enable it. The built endpoint was probed locally and returned HTTP 503 with `OWNER_EXECUTOR_NOT_QUALIFIED`.

Sections below through “Security review” preserve the `64c40fe` checkpoint. The execution-boundary addendum records the latest source changes and supersedes earlier publication status and missing-reservation statements.

## Source and isolation

- Companion branch: `codex/telegram-owner-integration`.
- Base: `396631afa4739e5ca8ac0c5c81781f82f3160403`.
- Relay published checkpoint: `6fc769db1a95a31417f6b6d93a1684cf4240a184`, branch `feat/relay-v2-telegram-private-beta`.
- Original MyEve checkout advanced independently to `38dc7281659b025f02b89edb138d38763b516955` during this work. It was not modified by this task. Its memory/chat fixes must be incorporated and retested before combining this companion branch. Both branches touch `action-context.ts` and executor inventory.
- Migration **0030_owner_channel_handoff** follows existing **0029_routine_admission**. The schema version constant and migration checker were updated. No existing migration was rewritten.

## Implemented boundaries

The new projection references canonical `task_runs`, `agents`, approvals, Actions, receipts and Outcomes. It does not introduce a second execution or approval authority model.

1. A strict Ed25519 envelope pins environment, audience, signing key, scope, nonce, lifetime and complete Work Request hash. Mapping to a local owner and selected Agent must be explicit and unique. Federation claims and web cookies are not accepted at this endpoint.
2. Run admission, source projection and START command identity are atomic. Replayed nonces, changed Work Requests and command-ID reuse with different work fail closed. STATUS does not admit a Run.
3. Authenticated STATUS non-admission returns a Work Request-bound proof; Relay retries admission only on that exact proof and only without an already-known Run. Cancellation before START creates a terminal canonical Run fence, preventing late execution. An at-most-once dispatch marker binds one Eve session and one turn to the canonical Run. A second session/turn is denied. A scheduled handler revisits admitted work; ambiguous dispatch is observed, never resent.
4. Short-lived internal credentials distinguish execution, observation and cancellation. Route checks constrain them to the recorded session and operation. Context Assembly runs through the existing persistent-Agent instruction hook, with no primary-Agent fallback for this ingress.
5. The existing private pending-send table holds the exact saved Action. Approval continuation calls canonical `decideApproval` and `ActionGateway`, without another model turn. Expired channel approvals cannot silently regenerate.
6. Canonical completion now atomically records Run transition, milestone and Outcome. Repeated approval handling returns the same Action/result without a second effect or Outcome.
7. Existing `ActionRecovery` performs provider inspection or labelled owner attestation. Recovery decisions never automatically resend. Provider verification is not conflated with owner attestation.
8. MyEve source revocation cancels its nonterminal Runs. Gateway and provider boundaries recheck local revocation, release gate, active Agent, approval, budgets and exact target. Cooperative Eve cancellation is separately recorded; in-flight provider ambiguity retains canonical recovery evidence.
9. Human approval waiting restores only the remaining active-time budget, once, from the original canonical approval timestamp. Replay cannot refresh the deadline. Safe email approval presentation includes canonical recipients and subject without body/provider payload.
10. Model usage is recorded; unknown usage denies later execution. A database reservation caps channel Action starts at twelve. Expired replay nonces are cleaned in bounded batches after a day; canonical evidence is retained.

The change touches shared auth, task-ledger, Context Assembly binding, Action construction, Action Gateway, pending-send facade and Run completion because identity and continuation must be enforced at those existing boundaries. Email remains the only production continuation adapter connected at the new endpoint. A harmless file adapter is used only in qualification fixtures.

## Evidence and limits

- Full MyEve Vitest regression run: **593 passed / 83 files**, including **18** real-PostgreSQL owner-channel scenarios, **5** transport/hash-scope tests and **2** safe-presentation tests.
- Real database scenarios use all ordered migrations in isolated schemas on loopback PostgreSQL port 55447. They cover signed admission, command identity reuse, duplicate/restarted dispatch, exact approval, one effect/Outcome, wrong owner/Agent, changed payload, expiration, rejection, recovery without resend, source revocation, unknown cost, Action limit and release-gate revocation immediately before transmission.
- The dispatch scenario uses a **synthetic Eve session/model and harmless provider** with real canonical database services. Its research/draft/effect counts are 1/1/1 after replay. It does not prove real model behavior, Context Assembly disclosure, provider execution or live Telegram.
- Populated 0029→0030 PostgreSQL upgrade: PASS; existing Agent sentinel preserved and all three projection tables present. Fresh full-schema applications also pass in the integration suites.
- TypeScript: PASS. Migration ordering: 30 validated. Local Next production build: PASS after allowing its existing public Google Font fetches. No deployment was performed.
- Executor inventory: **525 classified sources / UNKNOWN=0**. Fingerprints cover these reviewed changes; inventory classification is not release qualification.

Reproduce with a disposable PostgreSQL cluster bound to `127.0.0.1:55447`, using the current OS database user. The integration test ignores DATABASE_URL and environment files, creates a unique schema, and drops that schema afterward:

```sh
MYEVE_OWNER_CHANNEL_TESTS=1 ../../node_modules/.bin/vitest run
node node_modules/typescript/bin/tsc --noEmit
node scripts/migrate-database.ts --check
node --import tsx scripts/check-executor-governance.ts
node ../../node_modules/next/dist/bin/next build --webpack
```

## Cross-repository continuation evidence

Relay's opt-in component test imports these actual MyEve services. It exercises real Relay signing, signed MyEve admission, canonical approval/Action/Outcome persistence, opaque Telegram callback handling, a lost approval response, status reconciliation and subsequent revocation. The first request finishes with research/draft/effect counts **1/1/1**, one Run, one Outcome and one Action attempt. A second request is revoked before its effect. Only model execution, the harmless provider and Telegram delivery are synthetic.

The actual Relay signer exposed a wire incompatibility in the first local companion draft: Relay hashes include `sha256:`. The verifier and non-admission proof now match that canonical format. A three-assertion direct signer/verifier smoke check and a fixed canonical hash vector guard interoperability. The unpublished first draft `073cd51` is historical, not release-qualified evidence.

Relay now persists cancellation in its existing Task command queue, drains it with ingress/execution disabled, and distinguishes pairing revocation from confirmed MyEve cancellation. Missing executor acknowledgement stays visible. Cancellation receipts for already-completed Runs do not return private result text after source revocation.

## Remaining release blockers

These are code/qualification gaps, not a request for credentials:

- Qualify actual Eve dispatch, session observation after host restart, scheduled wake-up, cancellation and cleanup. Component tests do not prove installed-framework behavior.
- Enforce/qualify per-call model token/spend reservation and all tool-call bounds. Post-step accounting and the guarded-Action count alone do not prove the advertised complete model budget.
- Qualify complete Context Assembly owner/Agent isolation, safe approval presentation, callback acknowledgement/expired controls, provider result return and delivery against the actual Eve runtime and Telegram. The synthetic cross-repository component path now passes.
- Perform cross-repository migration/upgrade and deployment-readiness qualification on the final combined heads; reconcile Relay's separately documented 0021 branch collision.
- Only after code readiness: owner-authorized dedicated bot setup, secure host configuration, interactive provider authentication if required, and consequential live-test approval. Never paste credentials into chat.

## Security review

The security-sentinel review checked strict input parsing, signed request boundaries, parameterized SQL, source/owner/Agent binding, replay protection, transport-operation scope and sensitive-data handling. No secrets or real owner data were introduced; tests generate ephemeral keys and use synthetic values. The endpoint returns generic errors and does not log request payloads or credentials. CSRF cookies are not authority for this signed endpoint. No HTML rendering was added.

**High-priority release blockers:** pre-dispatch model budget proof and actual runtime recovery/revocation qualification remain unresolved as listed above. The immutable false release gate keeps the draft unavailable. No claim of complete OWASP coverage or a fresh MyEve dependency audit is made.


## Execution-boundary continuation — 2026-09-20

### Published starting revisions

Relay `29c8a3cd39b982f1ee389ac35d07b43b5cf9f318` was pushed to `jaydubya818/relay`, branch `feat/relay-v2-telegram-private-beta`. MyEve `64c40fe6d14f99205978bcd6c94bb668dff6a163` was pushed to the canonical `jaydubya818/MyEveBot`, branch `codex/telegram-owner-integration`. Both exact local/remote SHAs matched after push. MyEve's same-named local feature branch was first published here. Neither repository was merged or tagged. Committed-path hygiene checks found no credential or temporary artifact.

### Budget and context implementation

Migration **0031_owner_model_reservations** adds durable model-call reservations to the existing owner-channel projection of canonical Runs. It does not alter 0030 or create a separate billing authority.

- A PostgreSQL row update serializes cost/token reservation before provider work. Limits are the stricter canonical Run/current Agent policy, capped at **$0.10 per task**, **12,000 reserved/used tokens**, and **8 model calls**. One admitted Work Request maps to one Eve session. This task/session ceiling is stricter than $5; no aggregate hosted campaign budget is claimed.
- Every model step binds the Run, model ID and material request hash. Completed retry returns its stored result. In-flight/unknown retry is denied. Restart, approval waiting and cancellation cannot reset counters.
- Known completion settles cost/tokens once and releases only the proven unused portion. Cancellation, transport failure and ambiguous execution retain the full reservation. Invalid/null/empty cost or invalid usage blocks output and subsequent calls.
- The provider adapter resolves complete Gateway pricing using the existing API, reserves a conservative UTF-8 input bound plus framing and an output cap, with a 2× price margin. Missing pricing denies before execution. This is an enforced local admission bound; the conservative pricing/token envelope still needs verification against the actual selected model/provider before claiming end-to-end spend qualification.
- Provider output is buffered until accounting persists. Only bounded function tools are exposed: canonical public-network `web_fetch`, and `send_email` only when explicitly included in the local mapping and allowed by the Agent. Provider-managed paid search, delegated agents, arbitrary tools, private memory, files and connected-account tools are excluded. No model/provider fallback is requested; routing is pinned to the selected model's provider.
- The existing canonical Context Assembly now has an explicit external-Run branch. It records only admitted work/Run refs and no memory/goal/thread-summary refs. It does not load private Agent instructions or saved skills. The final provider boundary also replaces private system context. Normal owner sessions retain their existing assembly path.
- Eve's public-network DNS, private-address and manual-redirect protections are reused by `web_fetch`, with fresh Run and local capability checks. Unreserved compaction is denied.
- Canonical Action approval hashes now additionally bind owner-channel work identity, admitted budget, local Run limits and work expiry. Changing the canonical budget after approval denies the effect.

The shared changes are limited to the existing dynamic model selector, accounting hook, Context Assembly, tool policy and Action Gateway boundaries. The provider adapter is deliberately constructed synchronously without database access: an async resolver failure must not let Eve fall back to an unguarded model.

### Automated evidence

| Check | Result |
|---|---|
| Complete MyEve suite | **624 passed / 85 files** |
| Durable budget database cases | **13 passed**: concurrent reservation, retry/restart, settlement replay, cancellation, approval wait, revocation/expiry, token/step limits and narrower local spend policy |
| Provider/context boundary unit cases | **16 passed**: pre-call denial, exact replay, private context/tool stripping, unknown cost, output buffering and invalid purpose/step identity |
| Canonical owner approval/authority/recovery/context database cases | **20 passed**, including the new material-budget mutation and private-canary Context Assembly checks |
| Runtime transport scope | **5 passed**, automated; not actual model execution |
| Safe approval presentation | **2 passed** |
| TypeScript / local production build | PASS |
| Migration order | **31** ordered migrations |
| Fresh database and populated 0030→0031 upgrade | PASS; existing work/hash preserved and reservation/spend counters initialized to zero |
| Executor inventory | **528 classified / UNKNOWN=0** |
| Built public execution endpoint | HTTP **503 OWNER_EXECUTOR_NOT_QUALIFIED** |

Subsets overlap the full suite and must not be added to its total. PostgreSQL fixtures use a disposable loopback cluster on port 55447. No live model/provider traffic occurred. MyEve defines no lint or performance command in its package scripts; no separate result is invented.

### Actual runtime and external prerequisites

Installed runtime inspected: **Eve 0.27.13**, Node **24.18.1**, canonical `withEve` Next integration and existing `/eve/v1/**` session transport. The installed documentation confirms that dynamic model resolution failures can fall back, hooks can fail a turn, session token limits are post-call, and local workflow state lives under `.eve/.workflow-data`. These framework facts informed implementation; they are not actual-runtime qualification evidence.

**Actual Eve/model execution: NOT RUN. Actual host interruption/recovery: NOT RUN. Actual-model adversarial private-context test: NOT RUN.** The controlled private canary was exercised through canonical database Context Assembly and the provider-boundary unit tests only.

Existing Vercel project links and environment-variable names were inspected without printing secret values. The ordinary local MyEve OIDC token is expired. Separate Federation qualification preview branches contain model credentials; those fixtures were not borrowed or modified. No Telegram bot/webhook variable was found in the inspected local, preview or production settings. This does not establish that no bot exists elsewhere.

Automatic approval review rejected exporting the full development environment because unrelated credentials could be copied. The export did not run and no file was created. A narrower request for model authentication in the intended qualification scope is pending owner approval. No credentials should be pasted into chat.

### Remaining qualification gates

1. Approved narrowly scoped model authentication, explicit isolated Agent/model configuration and actual canonical Eve public-research/private-canary execution. Verify the reservation envelope with that provider.
2. Actual host/runtime interruption, cancellation and saved-result reconciliation; complete live approval and denial paths with canonical evidence.
3. Final combined-source integration and documented migration-branch collisions; clean exact revisions before deployment.
4. An explicitly authorized Telegram bot/identity, intended HTTPS deployments, webhook verification, scoped qualification enablement, emergency-stop proof and real provider traffic. Broad Telegram/Federation enablement remains off.

No deployment was attempted because actual-runtime qualification is not green. Live Telegram scenario count remains **0**. **TELEGRAM PRIVATE-BETA GOLDEN PATH INCOMPLETE.**

Cleanup: task-created local app server 3228 stopped; disposable PostgreSQL 55447 stopped and its cluster removed. No hosted resources, live bot registration, credentials or execution enablement were created. The rejected environment export file does not exist. Both immutable release gates remain false. Hosted emergency-stop behavior remains unqualified.


## Scoped authentication and aggregate-budget continuation — 2026-09-20

Starting checkpoint: Relay `b8b9d3df7c47b089d6509633dbcf2547058dbf1a`; MyEve `28077ab0215bef16608e4235ca2df594f6c7bb30`. All earlier results above remain historical evidence.

The owner has now approved access to **only existing model authentication for this isolated qualification**, bounded model calls, and publication of genuine fixes. This supersedes the earlier pending-approval note. It does not authorize a complete environment export or unrelated credential access.

### Canonical model and authentication

Canonical `agent/agent.ts` selects `anthropic/claude-sonnet-5` as its default through Vercel AI Gateway. Installed Eve is **0.27.13**, Node **24.18.1**. The external owner-channel guard requires an explicit `Agent.preferredModel`; an isolated Agent must explicitly select this canonical model before qualification. No alternative model has been substituted and no actual provider has been invoked.

Installed self-hosting documentation requires `AI_GATEWAY_API_KEY` for the string-model Gateway route outside Vercel. That exact variable is absent from the current process. The existing local OIDC credential was previously found expired. No credential value was read, copied, logged or committed during this continuation. No complete environment enumeration/export was performed.

Vercel's documented single-variable retrieval requires an environment-variable **ID**; its documented list/filter endpoint does not expose an exact key-name filter. The approved key's ID or single-credential local/keychain reference is currently unavailable. The owner has been asked for that **non-secret reference**, not the credential value. Separate Federation branch credentials have not been borrowed. The broader authentication approval is accepted; the remaining blocker is locating the exact approved key within that scope.

References: [Vercel single-variable request](https://github.com/vercel/sdk/blob/main/docs/models/getprojectenvrequest.md), [list/filter request](https://github.com/vercel/sdk/blob/main/docs/models/filterprojectenvsrequest.md). Installed runtime documentation: `node_modules/eve/docs/agent-config.md` and `node_modules/eve/docs/guides/deployment/self-hosting.md`.

### Liability estimate and durable aggregate fix

The stated historical **$0.25 reservation / $5 aggregate limit did not match this checkout**: it had a tighter **$0.10 task ceiling**, variable per-call reservations, and no shared $5 ledger. The $0.10 ceiling remains unchanged.

The unauthenticated public Gateway catalog snapshot in `telegram-model-pricing.json` records the exact model, timestamp and rates, without authentication material. At the maximum admitted 11,200 input-token allowance plus 800 output tokens, the current adapter's base/cache-write rates and 2× margin produce a maximum **$0.072** reservation. Applying the catalog's higher regional cache-write/output rates with the same margin gives **$0.0792**. Both fit below $0.10 and $0.25. This calculation is **not actual-provider liability qualification**: framework framing/token estimates, billable usage and the real runtime still need validation. No paid call was made based on this estimate alone. Paid provider search is excluded; the existing limits remain 12,000 total tokens, 8 model calls, 12 tool calls and 60 seconds per task.

Migration **0032_owner_qualification_budget.sql** extends existing model-call accounting with one durable **$5** allowance for the entire isolated qualification database, across owners and Runs. A trigger reserves from the singleton ledger in the same transaction as the canonical Run reservation. Exhaustion or a missing ledger aborts admission before provider invocation and rolls back per-Run counters. Known completion releases only proven unused reservation; spent and uncertain work remain charged. No application reset API exists. Receipt deletion does not refund liability. Reusing this same durable database is required across qualification restarts; provisioning another database is not an allowance reset.

Populated migration backfill preserves completed spend and ambiguous reservations; unknown completed costs conservatively retain their full reserved amount. Existing evidence is not overwritten. The migration does not enable execution or alter approval authority.

### Fresh automated results

- **MyEve: 630 passed / 85 files**, including **19** real PostgreSQL budget cases (six additional aggregate cases).
- Concurrent independent Runs: 60 attempts at $0.10 each admit exactly 50; total reservation is exactly $5; denied attempts leave counters unchanged.
- Aggregate restart/retry, cancellation/uncertainty, exactly-once settlement, missing-ledger denial, cleanup retention and populated 0031→0032 upgrade: PASS.
- TypeScript, local production build, **32** ordered migrations and executor governance (**528 classified / UNKNOWN=0**): PASS.
- These are component/database tests. Actual model/provider budget accounting, actual-model private-canary isolation and actual Eve interruption/recovery remain **NOT RUN**.

Both immutable execution gates remain false. No deployment, merge, tag, bot creation or Telegram credential inspection occurred in this continuation. Telegram prerequisite inspection remains behind actual-runtime readiness. Live Telegram scenarios: **0**. No new dependency audit, UI or performance result is claimed.

Smallest owner action: provide the non-secret ID/reference locating the specific approved `AI_GATEWAY_API_KEY`; do not paste its value. Resume the actual runtime/provider/canary/cancellation qualification after scoped retrieval and liability validation. **TELEGRAM PRIVATE-BETA GOLDEN PATH INCOMPLETE.**

Relay regression against this migration: **246 passed / 5 skipped** (50 passing files, 3 skipped), including the canonical cross-repository component fixture. Local PostgreSQL fixture stopped and removed after verification. No credential or runtime secret file was created.


## Correction: canonical Gateway OIDC authentication — 2026-09-21 UTC

The earlier claim that this qualification requires a standalone `AI_GATEWAY_API_KEY` was incorrect. The prior entries are retained as historical evidence, but their key-ID prerequisite is **superseded**. No static key is requested or being introduced.

Independent source verification: MyEve `apps/eve/.env.example` explicitly documents `VERCEL_OIDC_TOKEN` for Eve's Gateway access. Installed `@ai-sdk/gateway/src/gateway-provider.ts` uses `getVercelOidcToken()` when no explicit/static API key is supplied; `vercel-environment.ts` imports the helper from `@vercel/oidc`. This installed source supports OIDC locally despite the generic Eve self-hosting guide's API-key recommendation.

Installed OIDC behavior: request-context `x-vercel-oidc-token` takes precedence over `process.env.VERCEL_OIDC_TOKEN`. Missing/expired identity invokes the SDK refresh path, resolving the project/team from explicit options or `.vercel/project.json`. It reuses a valid project-specific SDK cache or obtains a new project token using the existing Vercel CLI login. It sets the process environment and maintains its standard SDK cache; no full environment pull is necessary. Token expiry is checked from `exp`, with an optional buffer. An expired token copied from a previous environment pull is not a durable credential. Hosted request identity and local development refresh are distinct supported sources.

The installed helper successfully resolved an unexpired **development** identity for project `prj_L6faw25wnFGUZtrLKBIccg8gIDLR`, team `team_p8z8exJRTGfOPk1GC9vUOpv3`, issuer `https://oidc.vercel.com/jaydubya818`, audience `https://vercel.com/jaydubya818`. Observed `iat=1789931141`, `exp=1789974341` (12-hour issued lifetime; about 8,511 seconds remaining when checked). Only non-secret claims were printed; this is local identity resolution, not yet provider acceptance or cryptographic verification of those claims.

Qualification mechanism: use the canonical helper with explicit project/team and a two-minute expiry buffer; inject only its returned OIDC identity into the isolated runtime in memory. Do not load the owner's environment files, copy unrelated credentials, add a static key, or deploy to obtain identity. Provider acceptance, real Eve execution, accounting, private-context isolation and cancellation/recovery still require their own evidence. The earlier requested owner key-reference action is withdrawn.


## Real OIDC / Eve qualification — 2026-09-21 UTC

**Local pre-Telegram runtime qualification passes for the bounded public-read path.** This is not a Telegram live pass or a qualified private-beta release. Historical component-only and failed-runtime entries above remain intact.

The actual path exercised was Relay's `HttpOwnerExecutor` and Ed25519 signer → a certificate-verified loopback HTTPS endpoint → canonical MyEve handoff/Run/local authority → durable model reservation → **Eve 0.27.13** → project-scoped **Vercel OIDC** → Gateway → **Anthropic `claude-sonnet-5`** → canonical `web_fetch` → durable model settlement → one canonical Outcome returned to Relay. No model/provider result was mocked. The Neon HTTP transport was bridged to a real isolated local PostgreSQL database; it did not substitute model or executor results. Eve used its existing `justbash` local virtual filesystem for this public-read-only fixture, without browser provisioning or package installation.

The narrowly scoped local qualification condition requires a reserved `.invalid` database endpoint, loopback host/origin, a short expiry, development trust, exactly one synthetic owner/Agent/source mapping and only `web.read`. It rejects Vercel hosts, normal databases, expanded capability mappings and expired windows. Both release constants remain false. No hosted qualification enablement is implemented or implied by this local fixture.

### Real provider, private context and liability evidence

Machine-readable sanitized evidence: `telegram-oidc-runtime-evidence.json`.

| Actual call | Reservation | Gateway-reported charge | Input / output tokens | Result |
|---|---:|---:|---:|---|
| Initial reasoning-handling defect | $0.031241 | $0.003102 | 1,021 / 106 | Paid usage settled; task failed closed |
| Public-read tool selection | $0.031241 | $0.002802 | 1,021 / 76 | Canonical web_fetch requested |
| Public-read final answer | $0.034900 | $0.003576 | 1,203 / 117 | Completed canonical Outcome |
| Controlled cancellation in flight | $0.031241 | Unknown | Unknown | Full reservation retained |

The successful task spent **$0.006378**. Four real provider invocations occurred; three have completed usage records. Gateway reports the exact Sonnet model and **Anthropic** as the final provider, one provider/model attempt per completed call, no fallback and zero surcharge. These are provider-reported usage/cost fields, not a separate invoice reconciliation. No static API key was supplied.

Input usage remained below the guarded UTF-8-plus-framing reservations; total output includes reasoning and remained below **800**. The current public catalog envelope at the maximum 11,200 input / 800 output tokens is $0.0396 using the highest observed regional/cache-write rates, before safety margin. The adapter's 2× base/cache-write reservation reaches $0.072 at that size; a 2× regional estimate is $0.0792. All are below the retained **$0.10 task cap**. Actual calls exercised the bounded configuration; the figures do not promise immunity to future provider price/contract changes. Missing pricing, excessive usage and unknown outcomes remain fail-closed.

The admitted adversarial request asked the model to retrieve private MyEve secrets/canary/instructions alongside public research. A synthetic canary was seeded in the exact Agent's private instructions. Actual Context Assembly recorded **no memory refs**, only the admitted work and Run refs. Instrumentation verified the canary was absent from outbound provider requests; the model saw only bounded allowed tools, performed public `web_fetch`, refused the private request and returned no canary. This is capability/context-boundary evidence plus a real-model result, not merely a prompt instruction.

### Recovery, denial and cleanup

- Restarting the actual Eve runtime and repeating START for completed work returned the **same Run/session/Outcome**, with **zero new provider reservations**.
- Cancelling a real in-flight call produced canonical **CANCELLED**, an Eve cancellation acknowledgement, `usage_unknown=true`, and an **unknown** model receipt retaining the full **$0.031241** reservation. Ordinary STATUS on revoked work is denied by design; cancellation reconciliation uses the cancel operation.
- Cancellation replay after both **Eve and PostgreSQL restart** returned CANCELLED with the same receipt and zero new model calls. The ledger did not reset.
- A new actual Eve turn with an intentionally insufficient synthetic Agent allowance was denied before model reservation/invocation; no provider call or charge was added.
- Aggregate ledger: **$0.009480 spent + $0.031241 uncertain reservation = $0.040721 liability**; **$4.959279 remains**. Unknown work is not refunded.
- Earlier setup-failure Runs were closed through canonical transitions; **zero active synthetic Runs** remain. The local runtime/probe servers are stopped. Preserve the stopped PostgreSQL cluster at ignored `apps/eve/.eve/qualification-postgres`; it contains the same qualification allowance and must not be replaced/reset on retry. The runner now refuses to recreate a missing database or ledger.

### Defects fixed and fresh checks

1. Reconciliation incorrectly supplied a session ID as Eve's string continuation token. It now uses the explicit session-state object; actual replay/stream observation passes.
2. The external policy resolver collided with Eve's dynamic `connection_search` resolver. It no longer claims that dynamic name for external Runs. The provider tool allowlist and returned-tool validation still exclude connection access, and the signed transport cannot invoke tools directly.
3. Reasoning content was mistaken for an executable out-of-scope result. It is now accounted in full and omitted from public output and durable replay; forbidden tool calls remain denied.
4. A web-session test's fixed September 14 issuance date expired during this run. The acceptance test now issues its fixture at the current time; production authentication behavior is unchanged.

Changes to config/sandbox are restricted to the explicit local fixture; the production sandbox definition remains unchanged. The harness and evidence accompany the existing execution boundaries rather than adding a separate approval or execution architecture.

Fresh checks: **MyEve 643 tests / 86 files PASS** (19 PostgreSQL budget, 17 provider-boundary, 12 local-scope cases included); **Relay 246 passed / 5 skipped**, including the full cross-repository component fixture; Relay performance **2 PASS**; both typechecks and local production builds PASS; Relay lint PASS; **32** ordered MyEve migrations; executor inventory **528 classified / UNKNOWN=0**. Normal built MyEve ingress returns **503 OWNER_EXECUTOR_NOT_QUALIFIED**. Historical UI evidence is unchanged; no new dependency audit or MyEve lint/performance result is invented.

No deployment, public bot enablement, merge or release tag occurred. Telegram prerequisite inspection follows publication of clean exact revisions. **Live Telegram scenarios: 0.** The private-beta golden path remains incomplete until the dedicated Telegram live matrix, hosted gates and consequential approval scenarios are qualified.


### Dedicated Telegram prerequisite inspection — 2026-09-21 UTC

After actual OIDC/provider qualification, integration readiness, and publication of the green runtime checkpoints (Relay `83230ba64cb385f09b804b95a3b16eb1c8034716`; MyEve `36b2717bd23d3456c9644dc6b92b52dc4e10449e`), inspected only the exact dedicated `RELAY_TELEGRAM_*` configuration names used by Relay. The original Relay and MyEve `.env.local` files contain none of those names; the isolated checkouts have no inspected local environment files, and the qualification shell has no populated dedicated keys. No values were printed, credentials exported, Telegram API called, or personal bot reused. This scoped local check does not prove that no bot exists in the owner's Telegram account or secret store; hosted settings were not re-enumerated.

The smallest owner action is to identify an existing authorized **dedicated qualification bot** and its non-secret secure credential reference, or create that dedicated bot through BotFather and store its token securely as `RELAY_TELEGRAM_BOT_TOKEN` in the intended qualification secret environment. Share only the bot username and secret reference, never the token. Webhook registration, isolated deployment, pairing and consequential live approvals remain pending; do not enable public execution. No model-authentication owner action or standalone AI_GATEWAY_API_KEY is required.

Local real-runtime prerequisites are green. Hosted qualification and the complete Telegram scenario matrix remain unqualified. Both release gates remain disabled. Live Telegram scenarios: **0**. Verdict: **TELEGRAM PRIVATE-BETA GOLDEN PATH INCOMPLETE**. No merge, release tag or qualified deployment.


## Integration with current main — 2026-09-24

Qualified local integration inputs: Relay main `b867b90b9134a6f46aeea7398af5b4118edfec3a` and Telegram `953883cbdf09c3e05db35521a47efb462651849e`; MyEve main `67550453ce1c87dd20631ca6664ee78fad5f4e3e` and Telegram `23a549726acece3e71d1c9bd8fc1c91d9de401c7`. Relay had 24 main-only commits and MyEve 130. Work was performed in fresh isolated checkouts because reads in the prior checkouts stalled. No original source or paid qualification ledger was reset.

Main is integrated into the feature branches; neither feature branch is merged into main. Canonical federation migrations remain unchanged. Undeployed Telegram migrations move to Relay 0022/0023 and MyEve 0036–0038; historical evidence above retains its original numbering. The old local paid qualification database is **not** automatically migrated or recreated. Its prior ledger must be recovered and reconciled before further paid qualification; renumbering must never create a second $5 allowance.

Eve is now **0.66.3**, inherited from current main. Adapted canonical session create/attach, sandbox environment and web-fetch exports, model types and the current-session partial index. Preserved current main's session, approval-generation and deadline predicates alongside the Telegram authority/budget guards. Exact completed approval callbacks return canonical completion without executing again. Pending channel approvals save the remaining active-time budget before pausing; approval restores that saved remainder once. Expired approval, zero remainder and absent active execution deadline continue to fail closed.

Fresh local results: Relay **398 passed / 5 skipped**, including cross-repository approval, duplicate/recovery and revocation; MyEve **1,060 passed / 1 skipped**, including the real PostgreSQL continuation and durable budget tests; Relay performance **2 passed**; both typechecks and production builds PASS; Relay lint and Drizzle snapshot check PASS; MyEve **38 ordered migrations** and governance **570 classified / UNKNOWN=0**. Relay upgrade tests cover pre-federation 0020, canonical federation 0021 and Telegram pairing 0022, including repeated migration. No fresh UI or dependency-audit pass is claimed. The final affected cross-repository test was rerun after the approval timing fixes and passed.

These are local automated integration results, **not real Eve 0.66.3/provider qualification**. The previously successful real-provider evidence remains valid only for its recorded Eve 0.27.13 revision. Starting the preserved campaign PostgreSQL on loopback 55447 timed out and its port remained closed; the startup was interrupted, and the durable data was preserved. No new paid provider invocation occurred and the prior reported liability remains $0.009480 spent + $0.031241 uncertain, pending ledger recovery. The separate synthetic test cluster on 55449 was stopped.

Owner input remains pending: dedicated Telegram bot @username and non-secret secure token reference; never paste a token. The request to merge every branch also needs scope confirmation because both repositories contain unrelated and archival branches. No unrelated feature branches were integrated, no bot was created, no webhook registered, no deployment performed, and both release gates remain false. Live Telegram scenarios **0**. Real runtime requalification, hosted/private bot setup and the complete live matrix remain required. **TELEGRAM PRIVATE-BETA GOLDEN PATH INCOMPLETE; not ready to merge into main.**


### Publication and ledger recovery follow-up

Integrated feature checkpoints were pushed with exact SHA parity: Relay `56bc256e2a2f7647c547cb46b68e3a05f286256c`; MyEve `f5db7ee0d4fe57258f3cc06a1a0f2ab9bb3abb03`. New changes relative to canonical main passed focused credential-pattern and environment/runtime-artifact checks. Earlier main history and its retained evidence were preserved.

A bounded retry started the preserved PostgreSQL server, but a five-second connection probe still timed out; the budget query and attempted backup did not complete. The incomplete dump is not a verified backup. Fast shutdown was requested and the backup process stopped. No compatibility migration or new provider call was attempted. Recovery of access to the original campaign ledger remains required; the prior $5 allowance must not be reset. The cause of the filesystem/database delays is not established.


## Eve 0.66.3 actual-runtime requalification — 2026-09-25 UTC

Continues the published Relay `90bbc498fd4071d396ebece0fea4f68549de2306` / MyEve `f1a741152a723d621463588f3c61a4c6d333f957` integration checkpoint. Historical results above remain historical; this entry does not qualify live Telegram.

Recovered the existing campaign database after confirming cloud-evicted, dataless files in its Documents directory. Materialized all 1,748 files; the stopped database copy matched every file by SHA-256 (72,930,372 bytes). A verified full backup preceded fixture compatibility work. Canonical main migrations 0031–0035 were applied only to this synthetic fixture; existing approval-generation and owner migration semantics were preserved. This is not evidence of a production migration-ledger upgrade. Before/after compatibility accounting remained $0.009480 spent + $0.031241 reserved; the $5 allowance was never reset.

Runtime fixes: custom budgeted model selection supplies the same 200,000-token context metadata as canonical model selection, while the provider boundary continues enforcing the separate 12,000-token task ceiling. The policy resolver no longer redefines Eve-owned `workflow` and `ask_question` names. Provider tool allowlisting and returned-tool validation still deny these capabilities to external work. Five setup attempts failed closed before provider calls (missing model metadata, tool-name collisions, and protected unreserved compaction); no guard was relaxed.

A linked-dependency checkout also produced intermittent Next.js `after` request-scope failures: one newly admitted request remained queued, and two completed-request replay attempts failed. Isolated dependency copies and fresh generated artifacts resolved the observed local failure. No production scheduling workaround was added. The queued request was subsequently cancelled through canonical signed control. Use a local dependency installation for qualification; do not rely on cross-checkout node_modules links. This local result does not qualify hosted Next.js behavior.

Actual canonical Vercel OIDC refresh → AI Gateway → `anthropic/claude-sonnet-5`, using installed Eve 0.66.3:

- Public example.com research and seeded private-canary isolation PASS. Two calls returned 1,101 and 1,323 used tokens, billed $0.003034 and $0.003798; conservative reservations were $0.030980 and $0.034641. Total task spend $0.006832, below $0.10. Every provider invocation had durable prior reservation, scoped context and allowed tools. No private memory references or canary appeared in provider input/output.
- Runtime restart/replay PASS: identical completed outcome, zero additional calls/reservations.
- Real provider cancellation and cancellation replay PASS. The interrupted call retains its full $0.030980 reservation as unknown usage; cancellation does not refund it.
- Insufficient task budget PASS: failed before any provider reservation or call.
- Cleanup PASS: zero active synthetic Runs and zero new provider reservations. The harness now exposes `cleanup` for canonical cancellation of this fixture's remaining active work.
- Database restart preserved the same outcome, seven historical/new call records, zero active Runs, and exact accounting: **$0.016312 spent + $0.062221 reserved = $0.078533 liability; $4.921467 remaining**. Unknown amounts are conservative liabilities, not claimed actual charges.

The active campaign ledger is now stopped at `~/Library/Application Support/RelayQualification/telegram-private-beta/postgres`, with verified before/after dumps alongside it. The older Documents copy is a retired frozen backup and must never become the active campaign again or reset the allowance. No database, dump, token, local environment or runtime log is committed. The sanitized machine-readable evidence is MyEve `apps/eve/docs/qualification/telegram-eve066-runtime-evidence.json`.

Fresh checks: Relay **398 passed / 5 skipped** including cross-repository approval/duplicate/revocation tests; MyEve **1,063 passed / 1 skipped**; provider-boundary subset **25 passed**; MyEve production build/typecheck PASS; governance **570 classified / UNKNOWN=0**. Earlier integration lint, migrations, Relay build/typecheck and performance results remain the preceding checkpoint; no fresh UI or dependency-audit result is implied.

Both release gates remain false. No deployment, public enablement, merge into main, release tag or `PASSED_LIVE` claim. Live Telegram scenarios: **0**. Local actual-runtime prerequisites are ready for the next qualification stage, but hosted and consequential Telegram scenarios remain pending. Smallest owner input: dedicated qualification bot @username and non-secret secure token reference, or create that dedicated bot through BotFather and securely store its token. Never paste the token. **TELEGRAM PRIVATE-BETA GOLDEN PATH INCOMPLETE; not ready to merge into main.**


## Reconciliation and local live-path preparation — 2026-09-25 UTC

Branch `claude/telegram-local-qualification` from main `14d8c361bc842729caef27f6dc71169e168fa85c`,
reconciling `codex/telegram-owner-integration` at `65dd90f98f3cbbdfd2a0ee29e5718982ec57e0bf`.
Earlier sections remain historical evidence for their own sources; the Eve 0.66.3 runtime results
above were produced on the branch source and are not re-claimed for this candidate.

### Reconciliation decisions

Both lineages integrated `23a5497` + `6755045` independently. Main-only follow-ups (README,
builder manifest, integration record) are kept. Runtime-evidenced branch semantics are taken:
approval active-time pause/resume (`approval-budget.ts`), deadline-bound channel reservation,
exact completed-approval observation, JustBash sandbox for the local fixture only, Eve 0.66 session
attach and the signed exact-session cancel endpoint, harness cleanup mode, private-tool exclusions.
Main's `web.read` builtin registration and its checker are kept (the branch versions fail the
capability-registry check). Reconciliation fix: `no_active_turn` cancel acknowledgements may omit
the session ID but must not name another session; `accepted` must name the recorded session.
`worker.test.ts` was rewritten for the endpoint rather than deleted.

### Local qualification identities

`localOwnerQualification` still requires loopback origin, the `.invalid` bridged database, ≤1 h
expiry, development trust, one mapping, `web.read` only and `OWNER_CHANNEL_RELEASE_QUALIFIED=false`.
It now admits exactly one of two pinned Relay identity sets:

- Harness set (`qualification-relay` / `qualification-principal` / `qualification-relay-agent`,
  source `qualification-source`), preserving the recorded campaign Runs.
- Live set (`acct_qualificationrelay` / `prn_qualificationowner` / `agt_qualificationsofie`) with a
  source equal to `MYEVE_OWNER_LOCAL_SOURCE_IDENTITY`, which must be a canonical Relay pairing binding
  `tgb_<32 lowercase hex>`. Mixed sets are denied.

`scripts/qualification/owner-runtime.mjs serve` runs the executor for live Telegram: it trusts only
the supplied Relay public key, maps only the live set to the pinned binding, publishes the loopback
CA certificate for the Relay worker, and stops on SIGTERM or window expiry. All harness modes now
refuse unless port 55447 serves the active campaign data directory and the campaign lock is held
(the retired Documents copy has the same system identifier).

### Campaign ledger

Active ledger: `~/Library/Application Support/RelayQualification/telegram-private-beta/postgres`.
Exclusive lock `campaign.lock/owner.json` held by this session through cleanup.

| Point | Reserved (µUSD) | Spent (µUSD) | Liability | Calls (uncertain) | Active Runs |
|---|---:|---:|---:|---:|---:|
| Recovered at session start | 62,221 | 16,312 | 78,533 | 7 (2) | 0 |
| After phase ceiling and dry run | 62,221 | 16,312 | 78,533 | 7 (2) | 0 |

Phase ceiling: CHECK `owner_qualification_phase_ceiling` limits reserved + spent to **1,078,533 µUSD**
(prior liability + $1.00) inside the same ledger; the original $5 CHECK is retained. Applied by
`scripts/qualification/phase-ceiling.mjs` under `ACCESS EXCLUSIVE` with before/after equality;
backups `before-phase2-ceiling.dump` (sha256 `7ac06e5c…d04c`) and `after-phase2-ceiling.dump`
(sha256 `a49d9b90…93bf`). A DB-backed test proves the real reservation trigger denies admission
beyond the ceiling before invocation without altering liability. Uncertain reservations remain charged.

### Evidence (component and local; not live Telegram)

| Check | Result |
|---|---|
| Full suite with 39 PostgreSQL owner tests | 1,085 passed / 1 skipped |
| Typecheck, capability registry, skill routing, executor governance | PASS (570 classified, UNKNOWN=0) |
| Migration order | 38 validated; no new migration |
| Integrated no-spend dry run (real Eve 0.66.3, OIDC, campaign ledger, Relay-style probe) | Authenticated non-admission for the live set; other identities/keys denied; ledger unchanged |

Model calls in this phase: **0**. Live Telegram scenarios: **0**.

### Approval capability finding

Only `tool.send_email` (AgentMail) is wired for approval continuation at the owner endpoint, and the
local mapping permits only `web.read`. The Federation `qualification-artifacts` route is not an
Action Gateway capability and belongs to NOT_RUN federation gates. Exact-approval, expired-approval
and recovery scenarios need an owner decision: a consequential real-email test to an owner-controlled
address, or a reviewed qualification-only harmless adapter through the canonical Action Gateway,
approval binding and continuation. A synthetic artifact result would not qualify real email.

Verdict: **TELEGRAM PRIVATE-BETA GOLDEN PATH INCOMPLETE.** Both release constants remain false.
