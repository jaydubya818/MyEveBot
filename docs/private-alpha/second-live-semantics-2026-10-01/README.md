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

Canonical main advanced to `fff8feef84ccfa8e43c81201653dab08182adacd` with independently qualified Computer changes whose production rollout awaits separate approval. Reconcile Git normally without force push. Deploy the exact isolated semantics-repair candidate, not those unrelated activation changes, with real execution approval disabled. Deployment receipts, preserved-history comparisons and a fresh paused Attempt-3 envelope will be recorded after zero-model deployed qualification.

Protected raw evidence: `/private/tmp/alpha-second-live-20261001`; test diagnostics: `/private/tmp/alpha-second-repair-20261001`. [Hashes](historical-evidence-hashes.json) retain the raw database and encrypted workflow trace identities; those protected payloads are not copied into source. [Investigation](investigation.json) separates observed failure from inference.
