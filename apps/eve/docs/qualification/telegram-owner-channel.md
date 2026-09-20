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
