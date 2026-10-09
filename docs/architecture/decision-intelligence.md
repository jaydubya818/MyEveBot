# Decision Intelligence

**Probabilistic intelligence proposes. Deterministic policy governs.**

Decision Intelligence is optional experimental infrastructure. Its only V0 contract is `knowledge.classification:v1`, always SHADOW, with behavioral influence NONE. A provider returns advisory data, never executable behavior or authority. Removing the subsystem must leave MyEve functional.

## Four layers

| Layer | Responsibility |
| --- | --- |
| Human | Intent, priorities and consequential authority |
| Agent | Reasoning, planning, bounded tool use and execution |
| Decision Intelligence | Bounded, typed probabilistic signals; V0 evaluation only |
| Deterministic systems | Authentication, authorization, capability ceilings, Action Gateway, approvals, control leases, verification, recovery and audit |

```text
Owner / Agent → canonical Knowledge write → retrieval / context → Agent

Synthetic candidate → versioned decision contract → DecisionProvider
                    → normalized evidence → metrics → Manage

Agent → Action request → Action Gateway → allow / require approval / deny
Routine → deterministic admission → Run → Agent → Action Gateway
Owner / Agent → ControlLease → ComputerSession
External Agent → Relay grant → local authority → Action Gateway
```

There is no return path from evaluation evidence to Knowledge or any authority chain. Decision Intelligence may become a bounded fast path for non-consequential classification and routing. It must never become the source of authorization for consequential Actions. Future promotion requires a separate reviewed work order, evidence-derived thresholds, privacy review and safe canonical fallback. V0 has no promotion control.

Agent reasoning is open-ended and contextual; decision evaluation is narrow and probabilistic. Classification asks what something appears to be. Policy determines what is allowed. Verification checks explicit criteria; a second model prediction is not verification. Evaluation output is not automatically Knowledge, Memory, an owner Result, Activity, business evidence, or Agent context. Operations measures subsystem health; this surface measures experimental quality.

## Canonical baseline and taxonomy

Baseline: `88370d0662c7824445b59779a8b8e8b21abfa10b`. `createKnowledge` validates the explicitly supplied kind and persists it with existing owner/provenance semantics. Owner forms and Agent tools supply classifications; there is no independently callable six-class canonical model. The benchmark does not recreate one. Canonical accuracy, latency and cost are unmeasured.

Canonical Knowledge retains seven kinds. V0 uses a typed subset: Decision, Fact, Observation, Hypothesis, Commitment and Preference. Insight remains canonical and is `SKIPPED_OUT_OF_SCOPE` before enablement, sampling, provider or privacy checks. It is never remapped or sent externally. An Insight label in the benchmark fails validation instead of silently dropping a row.

## Boundaries and privacy

The core `DecisionProvider` is independent of Vercel SDK types. Requests contain only candidate text, the question and six definitions. Expected labels, canonical labels and example identifiers never enter provider state. External results require runtime validation. Raw responses, exceptions and diagnostics are not UI data.

Real-owner shadow evaluation is deliberately unavailable in V0. The observer rejects owner-sourced candidates regardless of sampling. Canonical writers have no Decision Intelligence import. Local tests run the existing writer against both a database double and isolated PostgreSQL, then evaluate the synthetic candidate independently. This proves persistence equivalence without installing a live owner-data hook.

The synthetic dataset is reviewed source, not production data. A bounded privacy screen also rejects credential-like markers. This screen is defense in depth, not a claim that regexes can authorize arbitrary owner data for transmission.

## Evidence storage

V0 uses immutable JSON artifacts rather than a migration or queue. `MYEVE_DECISION_EVIDENCE_DIR` is an optional server-only directory of qualified synthetic runs. Reads are bounded to ten files, each at most 2 MB, with at most 500 rows. Artifacts carry contract/dataset hashes, run UUID, timestamp, source, environment, classifications, probabilities, timing and reported usage/cost. Expected labels and IDs must match the source-controlled dataset. Unknown fields, owner data and subject references are rejected. Inspection text comes from the approved synthetic fixture, never an artifact's arbitrary text.

Only authenticated deployment owners can read the API under MyEve's existing web-auth convention. Synthetic benchmarks are deployment-scoped and contain no owner data; no owner selectors are accepted. There is no live owner evidence store or cached Knowledge content, so Forget, corrections and supersession cannot leave a backdoor content copy here. Owner Data and backups do not include these developer-managed experiment artifacts in V0. Retain qualified runs and reports intentionally; discard failed development artifacts. Live evidence retention is zero because no live evidence is collected. A future owner evidence store requires explicit scope, Forget and retention integration.

The local filesystem is suitable for local qualification and packaged read-only artifacts. It is **not** a durable serverless write store. Do not point it at shared private data or assume runtime files survive deployment. No HTTP mutation endpoint, schedule, autonomous benchmark, new credential or external resource is introduced.

## Failure isolation and limits

The shadow observer defaults disabled with 0% sampling. Synthetic runs explicitly enable it with deterministic sampling, a maximum decision count, one worker by default (maximum four), bounded input and timeout. It has no retries or backlog. Duplicate candidates are skipped within a bounded run. A timed-out uncooperative provider retains its concurrency slot until settled. Error codes contain no provider messages or candidate text. Canonical work is never awaited by this observer.

Metrics distinguish valid labeled accuracy, completion and end-to-end correctness. Missing cost, tokens, confidence or canonical measurements remain unavailable. Confidence is not a guarantee. Threshold simulation is local analysis of bounded evidence and cannot update configuration or persistence.

## Product and Builder

Manage → Decision Intelligence is a read-only native Manage section with provider status, contract scope, synthetic/fixture labels, metrics, calibration, class performance, confusion matrix, filtered evidence, inspection and threshold simulation. No separate application icon, mandatory onboarding, Connected App, Skill, Agent, capability registry or conversational model is created.

Builder includes provider-neutral UI/core by its existing default manifest rules. Fresh deployments require no Jev credential or configuration and display a useful empty state. Benchmark commands run only when explicitly invoked. Fake providers are test infrastructure, never a configurable production provider.

## Supported Jev adapter

The only experimental SDK dependency is inside `jev-provider.ts`. It uses the existing Gateway's evaluation model and six-way Choice primitive, with no second Gateway instance in production. Enablement requires `MYEVE_DECISION_INTELLIGENCE_ENABLED=true` and existing Gateway credentials; this configuration alone never schedules or initiates evaluation. Synthetic runs must be explicitly invoked by a developer. Real owner candidates remain rejected.

Confidence means the probability assigned to the selected class. The full distribution and selected outcome are preserved after SDK validation, including declared rounding precision. Missing distribution, token usage or monetary cost remains unavailable. No evaluation value can alter Knowledge, authority, models or thresholds.
