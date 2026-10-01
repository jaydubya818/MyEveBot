# Second live failure: admission-proposal semantics

Both live attempts remain failed historical qualifications. Neither Work or remaining budget is reusable. No third live operation is authorized or executed by this repair.

## Evidence and cause

Attempt 1 returned valid JSON start as text; its strict normalization regression is retained. Attempt 2 (`dd60ac6b-5718-4844-be97-39b88eadf6ce`, revision/generation 2/2) instead returned blocker prose because no route was admitted. One reconciled Sofie call cost $0.001446; Factory commands, routes, writers and executions were zero. Controller/consumer stopped. The unchanged Work row remains active/agent; the durable conversation waits for input. The exact sanitized response and context are in [the regression fixture](../../../apps/eve/lib/engineering/fixtures/second-live-factory-blocker.json).

The reconstructed provider request matches the recorded SHA-256 `0aa12cc00b5c6a4f8c79e7bc432f6aaf24da80023588226e37e2a679991c272e` and recorded 8,560-byte bound. This proves which system instruction, tool description, Current Truth and empty data-only Recall were sent. The old system said return a start proposal or explain a blocker; the tool said Start or reconcile; Current Truth included Native NEEDS_ADMISSION and no executable Run. Together these left request-versus-execution semantics ambiguous. Sofie's response explicitly cited that context. The request does not prove the model's internal reasoning or guarantee future model behavior.

## Canonical contract

PROPOSING AUTHORITY IS NOT POSSESSING AUTHORITY. Existing `engineering_factory` with operation `start` means REQUEST ADMISSION. It may be proposed for selected, owner-resumed UNROUTED Work with exact version/generation. No already-admitted route, executable Run or writer is a prerequisite for the proposal. The backend independently validates Work, intent, availability, resource policy, limits, deadline and writer conflict. Blocker prose stays non-executable.

| Term | Existing evidence; authority boundary |
| --- | --- |
| UNROUTED | No persisted admitted route. A bounded admission request may be proposed. |
| ROUTE_PROPOSED | Model proposal, queued canonical request, or backend PROPOSED decision. None grants execution. |
| ROUTE_ADMITTED | Trusted RouteAdmissionService decision and Gate B; do not infer remote START. |
| FACTORY_PREPARED | Authenticated nonproductive producer snapshot. No remote execution yet. |
| FACTORY_STARTED | Canonical writer/dispatch identity and readback, not model prose. |

These are explanatory labels for existing contracts, not new persisted state. Q37 requires a nonproductive prepared identity before Gate B can admit the bound writer. The tested order is proposal/queue → policy evaluation → nonproductive PREPARE → Gate B admission → writer/START. Reordering preparation after admission would weaken the existing identity binding and was not done.

The shared contract is used by the model wrapper, tool description, capability description and persistent instructions. Private-alpha Current Truth removes the irrelevant native-admit instruction while retaining all route/writer/accounting facts. Normalization, ActionGateway, Work/intent checks, queue deduplication, admission, Gate B/C, writer lifecycle, spending, UNKNOWN and verification implementations are unchanged.

## Zero-model qualification

- Attempt 2 regression failed twice against pre-repair behavior (missing request semantics and misleading native context); both pass after repair. The exact original request hash and blocker non-execution tests pass.
- Attempt 1 strict JSON normalization and installed SDK generate/stream tests pass. Focused A/B, tool and queue suite: 48 PASS.
- Captured connected suite: 23 PASS. Fresh UNROUTED Work goes through the installed SDK tool callback into canonical queue, backend policy, nonproductive PREPARE, Gate B, exactly one writer/dispatch, signed custody, independent Docker verification, Result and final synthetic explanation. Duplicate proposal keeps the same command; no writer/route/dispatch exists before consumer admission. Actual dispatch readback is asserted.
- Model route/writer/dispatch/budget claims confer zero authority. Unsupported repository, cancelled Work, unavailable budget, unavailable Factory, DIRECT/HUMAN/JUDGMENT routing, stale tokens and malformed/extra-authority proposals fail closed. UNKNOWN, cancellation/recovery, completion reserve and deduplication checks pass.
- Installed CLI connected suite: 17 PASS with controlled loopback Responses. No real-provider credential or model operation is used.
- Application: 1,947 PASS, 45 environment-gated skips. Root regression, Gate B/C, routing, Current Truth, migration integrity, typecheck, capability/skill governance and production webpack build PASS. Governance: 731 classified sources, UNKNOWN=0.

A test-only type narrowing was corrected after typecheck. The new negative budget fixture initially attempted an invalid zero Agent ceiling; it now uses a valid ceiling below a held synthetic reservation. Database and budget protections were not changed. Original diagnostic logs remain protected locally.

Local fixture publications and synthetic provider requests in qualification artifacts are test traffic, not external effects or real-model usage. A future live response can still refuse or fail; no fallback or retries are inferred from local PASS.

## Release boundary

Canonical main advanced to `fff8feef84ccfa8e43c81201653dab08182adacd` with independently qualified Computer changes whose production rollout awaits separate approval. Git was reconciled normally without force push. The exact isolated semantics-repair candidate is now deployed with real execution approval disabled. The shared production alias and unrelated Computer activation remain unchanged. Deployment receipts, preserved-history comparisons and the fresh paused Attempt-3 envelope are linked below.

Protected raw evidence: `/private/tmp/alpha-second-live-20261001`; test diagnostics: `/private/tmp/alpha-second-repair-20261001`. [Hashes](historical-evidence-hashes.json) retain the raw database and encrypted workflow trace identities; those protected payloads are not copied into source. [Investigation](investigation.json) separates observed failure from inference.

## Concurrent-main reconciliation

The repair candidate is `f29cb42676b13612d5566c7dc974a2552877f3f9`, already pushed and remotely verified. It is based on `3ad2113` and excludes the separate Computer rollout. Canonical main advanced to `fff8fee`; it was merged normally on the existing release workstream. Both capability declarations/imports and all governance entries were preserved; no force push or history rewrite is permitted.

The combined source passed 1,990 application tests (53 gated skips), 23 connected captured-handoff checks, root regression, 73 ordered migration checks, build, typecheck, capability/skill checks and governance (737 sources, UNKNOWN=0). See [integration artifacts](main-integration/). Typecheck initially overlapped Next's generated-type replacement during build; rerunning after build passed without a source change. These compatibility checks do not authorize the separate Computer production rollout. The isolated private-alpha deployment uses the exact qualified repair candidate `f29cb42676b13612d5566c7dc974a2552877f3f9`, with real execution disabled and no approved Work binding.


## Deployment and Attempt 3 ready for authorization

[Deployment](third-deployment.json) `dpl_8pctKpLouK8tgKnD5fNDPgLxdLbc` is READY at [the isolated private-alpha URL](https://sofie-personal-agent-67gmb8arp-jaydubya818.vercel.app), with exact source `f29cb42676b13612d5566c7dc974a2552877f3f9`. [Deployed checks](third-http-preflight.json) pass health, project access and owner-authentication enforcement; unauthenticated Factory admission and Result access are denied. Positive admission and complete PREPARE/START are qualified through captured/synthetic local integration, not through a paid deployed operation. [Factory health](third-runtime-health.json), [provider eligibility](third-provider-preflight.json), and [source/runtime manifest](third-source-manifest.json) pass. Provider preflight used authentication/endpoint metadata only; no generation was performed. Shared production alias `sofie-personal-agent.vercel.app` remains on `dpl_GXhSL7ooxnYeoYgjNkDG7udhhPPx`.

Both failed Works were compared after new-Work preparation: [Attempt 1](third-attempt1-preservation.json) and [Attempt 2](third-attempt2-preservation.json) have unchanged historical rows, one reconciled Sofie call each, and zero Factory commands/routes. Their controllers/consumers are stopped and deadlines expired. Their unchanged active/agent database rows are not a claim of cancellation or permission to resume. Neither old envelope may be reused.

[New paused Work](third-work.json): **`7e4b305b-72e5-40f7-95e1-150456b84c66`**, revision/generation **1/1**. Its first-model approval gate denied execution as required. Sofie operations, Factory operations, route runs and pending commands are all zero. Additional real model operations for this repair: **0**.

Fresh envelope requiring separate explicit approval:

- Objective: implement positive-integer stdin validation in `quantity.mjs`, returning JSON `{quantity:n}` or `{error:"invalid_quantity"}`, and independently verify it.
- Repository: `jaydubya818/myeve-golden-work-qual`; only `quantity.mjs` may change.
- Model: `openai/gpt-5.4-mini`; project-scoped Vercel OIDC → AI Gateway → OpenAI only; no fallback.
- Maximum 5 model operations: 2 Sofie, 2 productive Factory, 1 Factory completion; maximum 1 candidate attempt.
- Maximum 600 seconds from first Sofie reservation. Maximum enforced $1.35 total: $0.30 Sofie / $1.05 Factory.
- Protected reserves: Factory completion $0.336864; final Sofie explanation $0.15.
- Effects: one canonical resume, local candidate commit, signed custody, independent protected verification, canonical Result, Proof of Work and final explanation.
- External publication disabled; no candidate push, PR, merge, deployment or sharing. UNKNOWN or any stop condition fails closed without retry outside this envelope.

All required zero-model qualification gates pass. **READY FOR THIRD LIVE ATTEMPT: YES, pending explicit owner authorization.** Work remains paused. Approval would permit one canonical resume and exact binding to the resulting current revision/generation; this document itself grants no authority. Qualification expires `2026-10-02T23:59:59Z` and must remain valid at admission. Local PASS proves the handoff exists but cannot guarantee the next stochastic model response or a successful real candidate.
