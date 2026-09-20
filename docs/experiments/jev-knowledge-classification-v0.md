# Jev Knowledge Classification V0

Status: **JEV DECISION INTELLIGENCE V0 LOCALLY QUALIFIED**. Live Jev benchmark: **NOT RUN**.

No live Jev calls were made. No owner data was transmitted. No production deployment, shared database query/migration or environment change was performed.

## Hypothesis and method

A typed decision provider may offer useful classification quality, confidence information, latency or cost for bounded Knowledge decisions. V0 gathers evidence only; it does not alter the Agent, Knowledge or authority.

Baseline: `88370d0662c7824445b59779a8b8e8b21abfa10b`. Feature branch: `feat/jev-decision-intelligence-v0`.

Dataset `knowledge-classification-v1` has 210 explicitly labeled synthetic examples, 35 each for Decision, Fact, Observation, Hypothesis, Commitment and Preference. Canonical Knowledge has seven categories; Insight is excluded. SHA-256: `1d784eda44d38b3e63b44be4277a8c7c39604f663eccac0a807a8fd02c61e25d`.

Fixtures include straightforward statements, contextual distinctions and ambiguous pairs: choice versus promise, preference versus existing fact, noticed pattern versus causal explanation. Validation rejects empty data, unknown labels, Insight, duplicate IDs, normalized duplicate text and credential markers. Similar taxonomy wording intentionally remains across contrastive examples. Expected labels are authored fixture values, not provider-generated truth. Provider serialization excludes IDs and expected/canonical labels. The dataset is developmental, not a held-out real-world sample; independent human review remains advisable before interpreting live results.

Canonical classification is supplied explicitly by owner/Agent tools. It is not independently measurable without invoking broader Agent reasoning. No substitute classifier is fabricated. Canonical comparison metrics stay N/A.

## Local commands

From `apps/eve`:

```sh
npm run decision:evaluate -- --dry-run
npm run decision:evaluate -- --fixture --output /tmp/myeve-decision-evidence
```

Set `MYEVE_DECISION_EVIDENCE_DIR` to that synthetic artifact directory only for local UI qualification. The runner writes immutable JSON and a Markdown summary. The fake provider uses a text hash to return deliberately imperfect deterministic outcomes; it never reads fixture labels. Fake latency and accuracy are not Jev performance evidence.

## Metrics and denominators

| Measurement | Definition |
| --- | --- |
| Accuracy | Correct / valid completed labeled decisions |
| Completion | Valid completed / attempted decisions |
| End-to-end correctness | Correct / attempted labeled decisions |
| Agreement | Equal canonical/provider labels / valid comparable decisions |
| Precision, recall, F1 | Per-class counts; unavailable denominators shown as N/A |
| Calibration | Labeled valid predictions with reported confidence only; counts alongside accuracy |
| Threshold coverage | Predictions above threshold / attempted labeled decisions |
| Threshold fallback | All remaining attempts, including failures/missing confidence |
| Latency | Provider evaluation, nearest-rank p50/p95; not Knowledge persistence |
| Usage/cost | Reported values only; incomplete values remain unavailable |

Confidence bands are [0,.70), [.70,.80), [.80,.90), [.90,.95), [.95,1]. Simulate .70, .80, .90, .95, .97 and .99. Zero coverage has N/A accuracy. High-confidence errors are wrong labeled predictions at ≥.95. A few hundred synthetic examples cannot establish production calibration.

## SDK compatibility and dependency delta

The owner authorized the minimum supported patch. Installed runtime exports and TypeScript definitions confirm `experimental_evaluate`, `gateway.evaluationModel("typesafe-ai/jev")`, and Choice questions shaped as `{ type: "choice", instructions, criteria }`. The adapter is the only production module importing the experimental API. Existing Agent, Chat, model catalog, Relay and computer-loop model routes are unchanged. Jev is neither a default nor fallback conversational model.

| Package | Before | After | Reason |
| --- | --- | --- | --- |
| ai | 7.0.99 | 7.0.105 | Minimum supported evaluation API; exact app pin |
| @ai-sdk/gateway | 4.0.80 | 4.0.85 | Exact dependency of ai 7.0.105 |
| @ai-sdk/provider | 4.0.14 | 4.0.17 | Exact dependency of ai/Gateway |
| @ai-sdk/provider-utils | 5.0.40 | 5.0.43 | Exact dependency of ai/Gateway |

One direct package and three transitive package names changed (six installed lock entries, including nested copies). Zero unexpected version changes; no major/minor upgrade. npm generated the lockfile. Audit comparison PASS: no new advisory; baseline remains 24 moderate and 1 high. This work does not remediate unrelated baseline advisories.

The SDK validates complete finite probability distributions, sum-to-one within declared rounding precision, and selected maximum (ties preserved). The adapter preserves the selected choice and distribution. UI confidence is **P(selected class)**, not TypeSafe's separate confidence metadata. Missing probabilities mean confidence unavailable. Input-token usage is preserved when supplied. The evaluation usage contract does not expose monetary cost, so cost remains null, never invented. Timeouts are bounded to three seconds, retries disabled, provider warning text suppressed at the adapter boundary, and errors normalized without raw response text.

## Final local qualification — September 20, 2026

| Check | Result |
| --- | --- |
| Provider-neutral contracts, metrics, calibration, thresholds, API, privacy and dataset | PASS; 68 Decision Intelligence tests including 24 real-SDK/mock-Gateway adapter cases |
| Existing AI SDK paths | PASS; 5 targeted tests for generation/routing, streaming, structured output, tool loop, usage and error handling |
| Full Eve unit suite | PASS; 664 tests, 93 files |
| Root core contracts | PASS; 134 tests |
| Real isolated PostgreSQL | PASS; 28 scenarios covering seven kinds × disabled/agreement/disagreement/failure, owner isolation and canonical Forget |
| Hypothesis versus Fact at 100% | PASS; stored kind stays Hypothesis |
| Insight | PASS; SKIPPED_OUT_OF_SCOPE, zero provider calls |
| Eve TypeScript / Builder TypeScript | PASS / PASS |
| Capability Registry | PASS; 135 definitions, 99 authored tools |
| Imported Skill routing | PASS; 93 checks, 50/57 rank one (87.7%), unchanged |
| Builder manifest | PASS; 146 prunable files, all claimed; release 255 |
| Executor inventory | PASS; 525 classified sources; UNKNOWN=0 |
| Eve / Builder production builds | PASS / PASS; no credentials, external fetch blocked |
| Generated provider-free build | PASS; Builder assembled 969 Sarah/Ava files, no Jev configuration; exact qualified dependency layout |
| Dataset | PASS; 210, 35 per class, unchanged hash; duplicate/normalized duplicate, labels, Insight, credential and serialization checks |
| Fixture regeneration | PASS; 210 deterministic results, explicitly LOCAL FIXTURE — NOT JEV PERFORMANCE |
| Manage navigation and authority boundary | PASS; Shadow, advisory only, influence NONE; no activation control |
| Provider/scope/metrics/confidence/class performance/confusion/disagreements/threshold/privacy | PASS |
| Desktop / mobile | PASS; 1440×900 / 390×844, no document overflow; visual inspection completed |
| Accessibility | PASS; zero WCAG 2/2.1 AA axe violations in Decision Intelligence at both sizes; keyboard slider, focus, native tables and labeled controls |
| Filter / inspect / Back / refresh | PASS |
| Loading / empty / error / retry | PASS; one intentional injected 503 in the separate failure-state test |
| Normal browser acceptance | PASS; zero console errors, zero uncaught page errors, zero failed HTTP responses |
| Existing surfaces | PASS; Chat, Goals, Knowledge, Agents, Results, Review, Manage; actual Chat through local mocked Gateway |
| Dependency audit delta / diff / secret scan | PASS / PASS / PASS |
| Live Jev / owner data transmitted | 0 / 0 |
| Shared database / production / deployment | NONE / NONE / NONE |

The earlier shell 503s were missing-service responses, resolved by isolated PostgreSQL and a local Gateway transport fixture. No shared credentials were used. A persisted synthetic chat fixture avoids the existing empty-chat lookup 404. A small local SVG resolves the favicon 404. The generated build initially failed when dependency copies were flattened; retaining the canonical nested installation resolved it without changing dependency versions. Final runs pass.

Local PostgreSQL used only loopback port 55449, with all existing canonical migrations applied. No schema change is introduced. QA scripts live in `scripts/decision-qualification`; their network preload rejects external fetches and evaluation-model calls. Browser tooling is installed outside the repository. Temporary database, generated app, logs, screenshots and evaluation artifacts are excluded from the commit. The original checkout and its unrelated modifications are untouched.

The feature's blast radius is a separate core/adapter/test directory, one read-only API, one native Manage panel plus its navigation entry, one fixture CLI, documentation and local qualification scripts. Existing canonical Knowledge, Action Gateway, Routine admission, Agent definitions, permissions, model routing and Builder source remain unchanged. Synthetic observation is explicitly invoked in qualification; no real-owner runtime hook is installed. The CLI intentionally exposes only dry-run and fake evaluation before Stage 2 authorization.

## Proposed Stage 2 boundary — not authorized or run

Jev through the existing Vercel AI Gateway; decision `knowledge.classification:v1`; dataset `knowledge-classification-v1`; 210 synthetic examples, six categories, Insight excluded, no real owner data. Estimated input is 46,107 tokens for the dataset (character estimate, not measured tokenization). Allowing a separate one-example qualification and up to twelve-example canary gives at most 223 requests and a conservative 50,000-token estimate. One worker, no retries, three-second timeout, stop on route/schema/probability mismatch or excessive failures. Do not automatically repeat a benchmark after fixes.

[Vercel's current model listing](https://vercel.com/ai-gateway/models/jev), checked September 20, advertises free input/output promotional pricing ending September 25, 2026. Estimated maximum model spend under that promotion: **$0.00**. Recheck pricing immediately before any authorized request; stop if it is no longer free and seek a revised budget. Missing SDK cost metadata remains unavailable in evidence even when the public listed price is free. No model performance conclusion is justified yet.

## Findings and recommendation

| Question | Current evidence |
| --- | --- |
| Is Jev more accurate, faster or cheaper? | Unknown; no live calls |
| Does its confidence correlate with correctness? | Unknown |
| Which classes are hardest for Jev? | Unknown |
| Should any threshold be activated? | No |
| Is the experiment conclusion positive? | INCONCLUSIVE until real evidence exists |

Preserve the provider-neutral implementation only if the supported adapter can be qualified without disproportionate complexity. Any live run requires a clean locally qualified commit and separate authorization specifying exact source, provider/model, synthetic example count, estimated tokens and maximum spend. Begin with a qualification request and a six-to-twelve-example canary. Stop on schema, route, probability or material cost mismatch. No automatic re-benchmark after fixes.
