# JEV V0 EXPERIMENT PROMISING

Stage 2 completed on September 20, 2026. This conclusion supports further research, not behavioral activation. SHADOW / ADVISORY ONLY / behavioral influence NONE.

## Source and authorized scope

- Branch: feat/jev-decision-intelligence-v0
- Local HEAD and verified remote HEAD: d54f152eafdac40d2293281b1046e343bf65cd8b
- Feature worktree: CLEAN before every live phase and after qualification. No code change, commit, push, merge or deployment in Stage 2.
- Provider: Jev, through existing Vercel AI Gateway; route typesafe-ai/jev.
- Decision: knowledge.classification:v1.
- Dataset: knowledge-classification-v1; hash 1d784eda44d38b3e63b44be4277a8c7c39604f663eccac0a807a8fd02c61e25d.
- Full benchmark: 210 examples, 35 per class. Canonical categories 7; evaluated categories 6; Insight OUT OF SCOPE.
- Source: synthetic only. Real owner data transmitted: NO.
- Run ID: d2263f0f-a636-4dcc-bba5-506e822d10a5.

The immutable committed adapter, evaluation harness and metrics were imported by an external orchestration runner. The source gate checked exact local and remote SHA plus an empty Git status before each phase. No modified application code was benchmarked. Outgoing Gateway bodies were checked against the approved synthetic text set and exact Choice question/definitions; expected labels, canonical labels and fixture IDs were absent. Qualification used 1 request, canary 12, benchmark 210: 223 total, one worker, zero retries. Every request used the authorized route and returned HTTP 200. No automatic rerun occurred.

The canary covered two examples from each class: 12/12 completed and correct. Live responses matched the SDK Choice/probability assumptions. Usage was reported. Deliberately failing live requests were unnecessary; error semantics remain covered by Stage 1 mocked tests. Existing development OIDC authentication was refreshed; no API key, project, resource or environment setting was created or changed. Other environment values were neither persisted nor used.

## Quality

Overall Jev accuracy: **206/210 = 98.10%**. Completion: **210/210 = 100%**. End-to-end correctness: 98.10%.

Canonical accuracy, Jev/canonical agreement, both correct, canonical only correct, Jev only correct and both wrong: **N/A**. The canonical writer accepts owner/Agent-supplied types; no independent canonical prediction was measured. Internal zero counters for absent comparisons are not comparative evidence.

| Class | Examples | Precision | Recall | F1 |
| --- | ---: | ---: | ---: | ---: |
| decision | 35 | 100.00% | 100.00% | 100.00% |
| fact | 35 | 100.00% | 94.29% | 97.06% |
| observation | 35 | 92.11% | 100.00% | 95.89% |
| hypothesis | 35 | 100.00% | 94.29% | 97.06% |
| commitment | 35 | 100.00% | 100.00% | 100.00% |
| preference | 35 | 97.22% | 100.00% | 98.59% |

Confusion matrix: rows are expected labels; columns are Jev predictions.

| Expected / predicted | Decision | Fact | Observation | Hypothesis | Commitment | Preference |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| decision | 35 | 0 | 0 | 0 | 0 | 0 |
| fact | 0 | 33 | 2 | 0 | 0 | 0 |
| observation | 0 | 0 | 35 | 0 | 0 | 0 |
| hypothesis | 0 | 0 | 1 | 33 | 0 | 1 |
| commitment | 0 | 0 | 0 | 0 | 35 | 0 |
| preference | 0 | 0 | 0 | 0 | 0 | 35 |

## Confidence and calibration

Confidence is the SDK-validated probability of the selected class, not TypeSafe's separate confidence metadata. Distributions are preserved without renormalization.

| Band | Count | Mean confidence | Observed accuracy |
| --- | ---: | ---: | ---: |
| 0–<70% | 5 | 52.40% | 60.00% |
| 70–<80% | 6 | 73.83% | 66.67% |
| 80–<90% | 9 | 84.89% | 100.00% |
| 90–<95% | 14 | 92.79% | 100.00% |
| 95–100% inclusive | 176 | 99.47% | 100.00% |

Higher confidence correlates with correctness in this sample: all four mistakes are below 80%, whereas all 199 predictions at or above 80% are correct. This is evidence of useful ranking, **not established probability calibration**. Low-confidence bands contain only 5 and 6 cases; the 210 examples are balanced, authored synthetic development data, not a representative held-out sample. The mostly obvious wording and one run cannot establish production reliability or rare-error rates. No threshold is recommended for activation.

High-confidence errors at ≥95%: **0 of 176 predictions**. Every incorrect prediction was inspected; none meets the high-confidence-error criterion. The preserved high-confidence-errors.json is intentionally empty, rather than omitting that check.

## Threshold simulation — analysis only

| Threshold | Selected / 210 | Coverage | Accuracy above threshold | Errors | Fallback |
| --- | ---: | ---: | ---: | ---: | ---: |
| 70% | 205 | 97.62% | 99.02% | 2 | 2.38% |
| 80% | 199 | 94.76% | 100.00% | 0 | 5.24% |
| 90% | 190 | 90.48% | 100.00% | 0 | 9.52% |
| 95% | 176 | 83.81% | 100.00% | 0 | 16.19% |
| 97% | 170 | 80.95% | 100.00% | 0 | 19.05% |
| 99% | 154 | 73.33% | 100.00% | 0 | 26.67% |

Only the six authorized thresholds were analyzed. None was activated or written to runtime configuration.

## Error analysis — all four disagreements

### fact_012: fact → observation (73.00%)

> The uploaded file contains 250 rows.

The finite file row count is an externally checkable fact, but it is also something measured. Both definitions apply. This exposes missing precedence between Fact and Observation; provider blame alone is not justified.

### hypothesis_013: hypothesis → observation (49.00%)

> We have not tested whether a preview reduces accidental publication.

The sentence states that a test has not happened; it does not directly assert the proposed causal relationship. Labeling the whole sentence Hypothesis rather than its embedded proposition is debatable. Dataset wording and contract granularity are plausible causes; Jev itself expresses uncertainty.

### hypothesis_025: hypothesis → preference (64.00%)

> We think the trial period is too short, but need evidence.

“Too short” is evaluative and can express a preference; “we think” and “need evidence” suggest uncertainty but do not specify an explanation or prediction. Dataset ambiguity and a thin Hypothesis definition plausibly contribute.

### fact_030: fact → observation (74.00%)

> The sample's measured mass on the certified report is 250 grams.

The certified report supports the Fact label, while the explicit phrase “measured mass” directly matches Observation. Taxonomy/contract overlap is the main plausible cause.

Largest directed confusion: Fact → Observation (2), Hypothesis → Observation (1), Hypothesis → Preference (1). Required pair checks:

- Fact ↔ Observation: 2 Fact → Observation, 0 reverse. Overlapping “externally true” versus “noticed or measured” definitions explain plausible ambiguity.
- Observation ↔ Hypothesis: 1 Hypothesis → Observation, 0 reverse. The failed example describes absence of testing rather than directly asserting a hypothesis.
- Decision ↔ Commitment: 0 in either direction. Clear synthetic choice/promise wording separated well; this is not proof for mixed real-world statements.
- Preference ↔ Decision: 0 in either direction. Again, harder overlapping statements remain untested.

These are disagreements with the authored labels, not four proven provider defects. Labels, definitions, model settings and benchmark data were not changed to improve the score; no corrected rerun was performed.

## Performance, usage and cost

| Measurement | Full benchmark | All phases |
| --- | ---: | ---: |
| Gateway requests | 210 | 223 |
| Decisions attempted | 210 | 223 |
| Decisions completed | 210 | 223 |
| Failures / timeouts / rate limits | 0 / 0 / 0 | 0 / 0 / 0 |
| Input tokens, provider-reported | 87,610 | 93,014 |
| Output tokens, transport usage | 14,354 | 15,243 |
| Latency p50 | 266.91 ms | N/A; benchmark reported separately |
| Latency p95 | 383.14 ms | N/A; benchmark reported separately |

Latency includes the adapter evaluation round trip, excludes canonical persistence, and is not a comparison with canonical Agent classification. Output tokens are preserved in the sanitized transport accounting; the normalized DecisionResult contract stores input tokens only. The original character-based input estimate was low; actual reported usage is shown above.

Pricing was rechecked immediately before the first request at [Vercel's Jev listing](https://vercel.com/ai-gateway/models/jev). Promotion active: YES; free input/output, listed end September 25, 2026. **Estimated total incremental model spend: $0.00. Actual billed spend: N/A**, not exposed by the qualified SDK result and not independently reconciled against billing. No charge was reported in observed usage. Approved maximum: $0.25; no observed or projected cap exceedance. Public free pricing is not substituted for actual billing telemetry. The UI correctly displays “Not reported” for experiment cost.

## UI and behavioral qualification

Real synthetic Jev evidence loaded into Manage → Decision Intelligence: PASS. Provider Jev; Gateway Vercel AI Gateway; synthetic dataset; SHADOW; ADVISORY ONLY; influence NONE; six of seven categories; Insight excluded. API metrics exactly match the recorded benchmark summary, including class performance, confusion matrix, confidence, reliability, latency and unavailable cost. Every authorized threshold's selected/error counts match the evidence. Disagreement filter returns 4; high-confidence-error filter returns 0; inspection, Back, refresh and keyboard slider pass.

Desktop 1440×900: PASS. Mobile 390×844: PASS, no document overflow. Accessibility: PASS, zero WCAG 2/2.1 AA axe violations in Decision Intelligence at either size. Final correctly configured browser run: zero console errors, zero uncaught page errors, zero failed responses. Screenshots were visually reviewed.

The local production UI initially required synthetic web authentication and its separate Eve backend; missing services caused local setup failures. Starting the backend and correcting the isolated PostgreSQL restart port resolved them without application changes. Final browser acceptance passed. No failed local setup run was treated as successful qualification.

Post-benchmark real PostgreSQL checks: PASS, 28 scenarios for seven types × disabled/agreement/disagreement/failure; stored Hypothesis remains Hypothesis against a Fact-at-100% shadow result; Insight produces zero provider calls; owner isolation and canonical Forget pass. All database state was isolated local synthetic state.

Sofie changed: NO. Canonical Knowledge changed: NO. Insight changed: NO. Action Gateway, Routine Admission, Computer authority and Federation authority changed: NO. No production owner sampling was enabled. UI qualification used a synthetic Gateway credential and network blocking, not the live OIDC credential; no further evaluation calls were made.

## External activity and recommendation

Owner data transmitted: 0. Shared database access/mutation: NONE. Production changes: NONE. Deployment: NONE. New provider resources: 0. No Preview, Neon, Sandbox, Routine, Federation or Phone activation. No V1 implementation or threshold promotion.

**JEV V0 EXPERIMENT PROMISING.** Keep V0 shadow-only. A separately authorized next experiment should independently adjudicate the four ambiguous labels, specify precedence for Fact versus Observation and assertion versus embedded hypothesis, then evaluate a new held-out synthetic challenge set with mixed and uncertain wording. Preserve this result unchanged. Do not infer production calibration or promote a threshold from this dataset.
