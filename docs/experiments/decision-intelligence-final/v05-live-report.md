# Jev V0.5 live evaluation — completion report

**JEV V0.5 CHALLENGE MIXED**

**INSIGHT BOUNDARY NEEDS CLARIFICATION**

**INSIGHT NEEDS MORE TAXONOMY WORK**

**REFINE TAXONOMY FIRST**

The seven-class experimental contract produced useful selective classification, but the six-class contract retained high-confidence errors, Fact/Observation remains a weak boundary, and some taxonomy-disputed inputs received near-certain choices. This is evidence for further design work, not activation. No V1 was implemented.

## Source

- Branch: `feat/jev-decision-intelligence-v05-challenge`
- Qualified/local HEAD: `6a067090f4e8e215264c8d4c6b90150bd816cbe2`
- Remote HEAD: `6a067090f4e8e215264c8d4c6b90150bd816cbe2` (verified before inference; historical live-run verification retained in its external archive)
- Worktree: CLEAN
- V0 baseline: `d54f152eafdac40d2293281b1046e343bf65cd8b`
- Source, frozen cohort membership, labels, rubric and pre-Jev human-review packet were not modified.

## Provider, pricing and request accounting

Provider: Jev via Vercel AI Gateway. Every inference request used `/v4/ai/evaluation-model`, `typesafe-ai/jev`; normalized responses reported that same model. No material route change was reported. A stable route name does not establish identical model weights; V0 reproduction supplies the behavioral comparison.

Pricing rechecked: **2026-09-21T05:28:17.105079Z**. [Official Vercel model listing](https://vercel.com/ai-gateway/models/jev) showed free input/output through September 25, 2026. Promotion ACTIVE. Estimated incremental spend **$0.00**. Actual billed spend **unavailable**, not asserted to be zero. Paid authorization required: NO. No response reported positive monetary cost; billing was not independently reconciled.

| Run | Requests | Completed | Retries | Run ID |
|---|---:|---:|---:|---|
| canary | 14 | 14 | 0 | `ee91fa28-2b8d-480f-84ee-2679c7ce15a6` |
| reproduction | 210 | 210 | 0 | `293b3ad5-2f93-4337-b3f3-ea37df476cb8` |
| six | 206 | 206 | 0 | `e31927e6-4ff2-41a3-84d1-61b5f8533da9` |
| seven | 249 | 249 | 0 | `0a8db3e4-7d40-4be6-92b0-d5e6f6124648` |
| stress | 57 | 57 | 0 | `a7438d26-d413-42db-84b7-eacda88c00ee` |
| **Total** | **736** | **736** | **0** | |

One worker; maximum three-second request timeout; SDK retries zero; no semantic-error reruns. Requests and decisions are one-to-one. Canary is excluded from benchmark aggregates. The qualified CLI prints a planning `liveAuthorized: false` field before reading its authorization file; execution then validated the separate authorization and recorded live artifacts. The source was not changed.

Canary: PASS for typed results, complete seven-outcome probabilities, highest-probability semantics, Insight, metrics ingestion and synthetic-only outbound serialization. 11/14 matched the frozen labels; semantic correctness was not used to tune or relabel. Expected labels, IDs, difficulty, boundary tags, rationales, review metadata and owner data were absent from all outbound requests.

## V0 reproduction and drift

| Measure | Historical V0 | Reproduction |
|---|---:|---:|
| Accuracy | 98.10% | 98.10% (206/210) |
| Completion | 100% | 100% |
| ≥95% errors | 0 | 0 |
| p50 latency | 266.91 ms | 247.51 ms |
| p95 latency | 383.14 ms | 356.39 ms |
| Mean confidence | 96.55% | 96.64% |

Material drift: **NO observed** in this reproduction. All 210 categorical predictions were unchanged. Mean confidence changed by +0.095 percentage points; the maximum individual absolute confidence change was 10.0 points. Median remained 100%. p50/p95 improved approximately 7.3%/7.0%; these single-run latency differences do not establish a durable speed change. Completion/provider drift: none observed.

## Scored Challenge results

| Measure | Challenge Six | Challenge Seven |
|---|---:|---:|
| Accuracy | 86.41% | 89.56% |
| Macro precision | 86.39% | 90.82% |
| Macro recall | 89.72% | 90.41% |
| Macro F1 | 86.74% | 90.14% |
| Completion | 100.00% | 100.00% |
| End-to-end correctness | 86.41% | 89.56% |
| Examples | 206 | 249 |
| ≥90% accuracy | 96.92% | 100.00% |
| ≥95% accuracy | 97.17% | 100.00% |
| ≥95% coverage | 51.46% | 43.37% |
| Errors ≥90% / ≥95% / ≥99% | 4 / 3 / 0 | 0 / 0 / 0 |

### Adversarial headline — Challenge Seven

**83 examples; 73 correct; accuracy 87.95%.** Accuracy at ≥90% confidence: **100% (36/36)**; at ≥95%: **100% (29/29)**. High-confidence errors ≥90/95/99: **0/0/0**. ≥95% adversarial coverage: **34.94%**. These selected sample sizes are small.

| Difficulty | Count | Accuracy | Median confidence | Mean confidence | ≥95% errors |
|---|---:|---:|---:|---:|---:|
| MODERATE | 52 | 92.31% | 95.00% | 88.06% | 0 |
| HARD | 114 | 89.47% | 90.00% | 83.93% | 0 |
| ADVERSARIAL | 83 | 87.95% | 86.00% | 79.51% | 0 |

### Per-class metrics — Six

| Class | Examples | Precision | Recall | F1 |
|---|---:|---:|---:|---:|
| decision | 42 | 100.00% | 76.19% | 86.49% |
| fact | 33 | 70.45% | 93.94% | 80.52% |
| observation | 58 | 95.65% | 75.86% | 84.62% |
| hypothesis | 30 | 88.24% | 100.00% | 93.75% |
| commitment | 26 | 96.00% | 92.31% | 94.12% |
| preference | 17 | 68.00% | 100.00% | 80.95% |

Confusion matrix: expected rows, predicted columns.

| Expected | decision | fact | observation | hypothesis | commitment | preference |
|---|---:|---:|---:|---:|---:|---:|
| decision | 32 | 1 | 0 | 0 | 1 | 8 |
| fact | 0 | 31 | 2 | 0 | 0 | 0 |
| observation | 0 | 10 | 44 | 4 | 0 | 0 |
| hypothesis | 0 | 0 | 0 | 30 | 0 | 0 |
| commitment | 0 | 2 | 0 | 0 | 24 | 0 |
| preference | 0 | 0 | 0 | 0 | 0 | 17 |

### Per-class metrics — Seven

| Class | Examples | Precision | Recall | F1 |
|---|---:|---:|---:|---:|
| decision | 42 | 90.70% | 92.86% | 91.76% |
| fact | 33 | 80.00% | 84.85% | 82.35% |
| observation | 58 | 95.92% | 81.03% | 87.85% |
| hypothesis | 30 | 100.00% | 93.33% | 96.55% |
| commitment | 26 | 100.00% | 80.77% | 89.36% |
| preference | 17 | 89.47% | 100.00% | 94.44% |
| insight | 43 | 79.63% | 100.00% | 88.66% |

Confusion matrix: expected rows, predicted columns.

| Expected | decision | fact | observation | hypothesis | commitment | preference | insight |
|---|---:|---:|---:|---:|---:|---:|---:|
| decision | 39 | 1 | 0 | 0 | 0 | 2 | 0 |
| fact | 0 | 28 | 2 | 0 | 0 | 0 | 3 |
| observation | 0 | 5 | 47 | 0 | 0 | 0 | 6 |
| hypothesis | 0 | 0 | 0 | 28 | 0 | 0 | 2 |
| commitment | 4 | 1 | 0 | 0 | 21 | 0 | 0 |
| preference | 0 | 0 | 0 | 0 | 0 | 17 | 0 |
| insight | 0 | 0 | 0 | 0 | 0 | 0 | 43 |

## Boundary analysis — Challenge Seven

| Boundary | Examples | Accuracy | Errors | Median confidence | ≥95% errors |
|---|---:|---:|---:|---:|---:|
| FACT_OBSERVATION | 40 | 70.00% | 12 | 79.00% | 0 |
| OBSERVATION_INSIGHT | 44 | 93.18% | 3 | 97.00% | 0 |
| OBSERVATION_HYPOTHESIS | 30 | 96.67% | 1 | 84.00% | 0 |
| INSIGHT_HYPOTHESIS | 29 | 96.55% | 1 | 92.00% | 0 |
| DECISION_COMMITMENT | 30 | 93.33% | 2 | 90.00% | 0 |
| PREFERENCE_DECISION | 30 | 93.33% | 2 | 96.00% | 0 |
| INTENT_COMMITMENT | 25 | 84.00% | 4 | 83.00% | 0 |

Boundary tags overlap. Fact/Observation is the weakest major boundary at 70% (12/40 errors); no ≥95% errors occurred there under the seven-class contract. Full boundary metrics for both contracts are in analysis.json.

## Six versus seven — same 206 non-Insight cases

| Measure | Six | Seven |
|---|---:|---:|
| Correct / total | 178/206 | 180/206 |
| Accuracy | 86.41% | 87.38% |
| Macro F1 over the same six scored classes | 86.74% | 90.39% |

Accuracy delta: **+0.97 percentage points**. Eleven previous errors became correct; nine previously correct cases became errors; 169 remained correct and 17 remained wrong. There were 11 new Insight predictions on non-Insight cases: Observation 6, Fact 3, Hypothesis 2. The full 89.56% seven-class score also includes 43/43 correct Insight cases, so its improvement over 86.41% Six is not a pure decision-space effect.

The seven-class contract changes both outcome space and rubric wording. This comparison cannot causally isolate adding Insight. For comparability the table averages the same six class F1s; the qualified helper’s all-seven macro F1 on this Insight-free matched subset is 77.48%, because the empty Insight class contributes zero. That value is preserved in analysis.json and must not be confused with either the common-six average or the full seven-class 90.14% macro F1.

## Insight

43 examples. Precision **79.63%**; recall **100%**; F1 **88.66%**. There are 43 true positives, 11 false positives, no false negatives. Mean confidence on expected Insight: **94.72%**; median **99%**; range **55–100%**; ≥90: 37/43; ≥95: 34/43; ≥99: 23/43. All 11 Insight false positives had confidence below 85% (maximum 76%). Insight-related errors ≥90/95/99: **0/0/0**.

Top false-positive source: Observation (6), then Fact (3), Hypothesis (2). Top false-negative destination: NONE. Explicit confusion directions: Observation→Insight 6; Insight→Observation 0; Hypothesis→Insight 2; Insight→Hypothesis 0; Fact→Insight 3; Insight→Fact 0.

Independent author/reviewer Insight label agreement was 100% (51/51), but seven rubric-sensitive Insight-authored cases were kept in Stress and one primary-quality shortcut was rejected. This does not resolve the canonical Insight boundary. **INSIGHT NEEDS MORE TAXONOMY WORK**: selective results are promising, but precision, attribution/inference overlaps and forced certainty on disputed inputs make immediate canonical adoption premature.

## Threshold simulations

**Synthetic challenge distribution estimate.** Errors per 1,000 = observed errors above threshold / all cohort examples × 1,000. This projects accepted wrong classifications only; it makes no claim about fallback errors or real-world traffic. Stress is excluded.

### Challenge Six

| Threshold | Coverage | Accuracy above threshold | Errors | Fallback | Errors / 1,000 |
|---|---:|---:|---:|---:|---:|
| 0.70 | 85.92% | 90.40% | 17 | 14.08% | 82.52 |
| 0.80 | 76.21% | 95.54% | 7 | 23.79% | 33.98 |
| 0.85 | 69.42% | 95.80% | 6 | 30.58% | 29.13 |
| 0.90 | 63.11% | 96.92% | 4 | 36.89% | 19.42 |
| 0.95 | 51.46% | 97.17% | 3 | 48.54% | 14.56 |
| 0.97 | 45.63% | 97.87% | 2 | 54.37% | 9.71 |
| 0.99 | 33.50% | 100.00% | 0 | 66.50% | 0.00 |

### Challenge Seven

| Threshold | Coverage | Accuracy above threshold | Errors | Fallback | Errors / 1,000 |
|---|---:|---:|---:|---:|---:|
| 0.70 | 76.71% | 97.38% | 5 | 23.29% | 20.08 |
| 0.80 | 67.07% | 98.20% | 3 | 32.93% | 12.05 |
| 0.85 | 58.63% | 100.00% | 0 | 41.37% | 0.00 |
| 0.90 | 51.41% | 100.00% | 0 | 48.59% | 0.00 |
| 0.95 | 43.37% | 100.00% | 0 | 56.63% | 0.00 |
| 0.97 | 34.54% | 100.00% | 0 | 65.46% | 0.00 |
| 0.99 | 24.10% | 100.00% | 0 | 75.90% | 0.00 |

No threshold is activated or selected for V1. Seven’s first zero-error threshold is 0.85, but selecting it because it happened to have zero errors would overfit this finite benchmark. Even 0/108 errors at 0.95 permits an approximately 2.74% one-sided 95% binomial upper error bound; the adversarial 0/29 subset permits approximately 9.81%. Six needs 0.99 to reach zero observed errors, retaining only 69/206 cases. Stress cases are not included in either coverage denominator.

## Taxonomy Stress — no accuracy

57 examples; 57 completed. **Accuracy: N/A.** Median confidence **70%**, mean **73%**. ≥90: **15/57 (26.32%)**; ≥95: **12/57 (21.05%)**; ≥99: **6/57 (10.53%)**.

Choice distribution: decision 13, fact 1, observation 4, hypothesis 3, commitment 14, preference 12, insight 10.

Agrees with author only: **2**; reviewer only: **4**; neither: **46**; both: **5**. Author/reviewer choices match in 49/57 cases, including shared null/ambiguous choices. Null is not a Jev outcome: “neither” is not evidence that a third semantic label was independently judged correct.

Reviewer-disagreement plus confidence ≥95%: **4/8 disputed cases**. At ≥99%: **2/8**. These are all such cases:

| ID | Author | Reviewer | Jev | Confidence |
|---|---|---|---|---:|
| challenge_0008 | AMBIGUOUS | preference | preference | 100.00% |
| challenge_0044 | observation | insight | insight | 98.00% |
| challenge_0102 | AMBIGUOUS | commitment | commitment | 99.00% |
| challenge_0103 | AMBIGUOUS | preference | preference | 95.00% |

**challenge_0008** — I am hoping to mentor the next cohort; working with beginners suits me.
Context: Coordinator: Are you accepting the mentor role today? Owner: I need to think about that. I am hoping to mentor the next cohort; working with beginners suits me.
Reviewer rationale: Expresses the owner’s affinity for working with beginners while withholding role acceptance.

**challenge_0044** — The bus wait, not the train leg, is where the recorded journeys spread out.
Context: My trip log has six entries for this route. The train leg took 42–45 minutes each time. Door-to-door totals ranged from 68 to 119 minutes; the long totals coincided with longer waits for the same connecting bus.
Reviewer rationale: Identifies bus waiting as the component associated with variation in total journey duration.

**challenge_0102** — I intend to clear the queue tonight; you can count on having all the reports by nine.
Context: Customer asked whether the reports were guaranteed for the board pack. The account owner replied with this sentence, but the queue contains an unestimated number of reports and no prior service deadline is recorded.
Reviewer rationale: The explicit assurance that the customer can count on delivery constitutes a promise regardless of feasibility.

**challenge_0103** — Priya prefers calls, but I prefer written summaries and have kept them as our default.
Context: Priya told the group she prefers phone calls. The owner responded that written summaries would remain the team default and that she personally prefers them.
Reviewer rationale: The central owner statement explicitly endorses written summaries as a personal and continuing default preference.

Two ≥99% cases combine intent/affinity or intention/assurance with author ambiguity. The chosen Preference/Commitment readings are defensible; these are not scored model errors. The risk is that a near-certain class choice fails to convey competing taxonomy interpretations. The 98% bus-wait Insight versus author Observation illustrates the synthesis boundary directly.

## Does Jev know when it does not know?

**Partly on this frozen scored task; not reliably enough to use confidence alone as an autonomous ambiguity detector.**

| Set | Median confidence | Mean confidence |
|---|---:|---:|
| V0 reproduction | 100.00% | 96.64% |
| Challenge Seven MODERATE | 95.00% | 88.06% |
| Challenge Seven HARD | 90.00% | 83.93% |
| Challenge Seven ADVERSARIAL | 86.00% | 79.51% |
| Taxonomy Stress | 70.00% | 73.00% |

Confidence decreases with semantic difficulty: **YES in these aggregate summaries**. The sets differ in composition and the V0 contract differs, so this is descriptive rather than a causal or calibration claim. Standard was not run. Challenge Six median/mean: 96.00%/87.74%; Challenge Seven: 90.00%/83.32%.

Correct-versus-error confidence separates meaningfully: Six median 97% vs 71% (means 90.40% vs 70.82%); Seven median 93% vs 57% (means 86.17% vs 58.88%). All Seven errors are ≤81%. However, Six has errors at 96–98%, and Stress includes four disputed ≥95% cases. Jev’s selected-class probability is not the probability that the taxonomy is unambiguous. These results do not establish calibrated real-world probabilities.

Confidence-bin counts/observed accuracy for each contract:

**Six**

| Confidence bin | Count | Observed accuracy |
|---|---:|---:|
| 0.00–0.70 | 29 | 62.07% |
| 0.70–0.80 | 20 | 50.00% |
| 0.80–0.90 | 27 | 88.89% |
| 0.90–0.95 | 24 | 95.83% |
| 0.95–1.00 | 106 | 97.17% |

**Seven**

| Confidence bin | Count | Observed accuracy |
|---|---:|---:|
| 0.00–0.70 | 58 | 63.79% |
| 0.70–0.80 | 24 | 91.67% |
| 0.80–0.90 | 39 | 92.31% |
| 0.90–0.95 | 20 | 100.00% |
| 0.95–1.00 | 108 | 100.00% |

## Every high-confidence Challenge error

Six: ≥90 **4**, ≥95 **3**, ≥99 **0**. Seven: **0 / 0 / 0**. The following assessments are post-Jev secondary review, not adjudication. All four remain errors under the frozen primary labels.

### challenge_0156: decision → preference, 96.00%

Classification: **MODEL_ERROR**. Review status: **NOT_REQUESTED**.

Use short daily practice for the exam plan.

Context: Agent: I drafted a daily plan and a weekend plan for this exam. Owner: Use short daily practice for the exam plan. Keep the daily version.

The owner selects the daily version among two concrete plans. Preference misses the explicit adoption; the frozen Decision label remains well supported.

### challenge_0298: observation → hypothesis, 91.00%

Classification: **CONTEXT_INSUFFICIENT**. Review status: **GROUND_TRUTH_REVIEW_REQUIRED**.

The delivery driver is unloading at the alley entrance.

Context: From the stockroom window I can see the van backed up to the alley door and two crates on its ramp.

The context directly shows a parked van and crates, but does not explicitly show the driver unloading. Hypothesis is defensible under a strict direct-observation reading. Request secondary ground-truth review without changing the primary Observation label.

### challenge_0313: observation → fact, 98.00%

Classification: **CONTRACT_AMBIGUITY**. Review status: **GROUND_TRUTH_REVIEW_REQUIRED**.

According to Noor, the archive closed at six today.

Context: Noor waited outside while I retrieved my bag. At 18:00 she texted, “The attendant has just locked both entrance doors and turned away the last visitor.”

A contemporaneous third-party observation is also presented as confirmed information. The original six-class Fact/Observation definitions do not resolve this evidential-status overlap cleanly. Preserve the scored error and request review.

### challenge_0315: observation → hypothesis, 98.00%

Classification: **POSSIBLE_GROUND_TRUTH_ISSUE**. Review status: **GROUND_TRUTH_REVIEW_REQUIRED**.

Both filling stations are sending their labels to the same printer right now.

Context: During the floor walk, I watched an A batch followed by a B batch emerge from P3. The other printer’s display is dark. I have not checked today’s routing settings.

Seeing A and B batches at P3 supports the current output pattern; inferring both stations’ routing from it is less direct. The context explicitly says settings were not checked. Preserve the Observation label and request review of the observation/inference boundary.

No high-confidence case required MULTI_CONCEPT or OTHER as its primary error category. Mixed-concept uncertainty is represented separately in Stress. See `post-jev-review.json` for all four cases, eleven Insight false positives, all twelve Stress ≥95% cases, and the exact disputed subsets. The pre-Jev review packet remains untouched.

## Performance and usage

| Run | p50 ms | p95 ms | Completion | Failures | Timeouts | Rate limits |
|---|---:|---:|---:|---:|---:|---:|
| V0_REPRODUCTION | 247.51 | 356.39 | 100% | 0 | 0 | 0 |
| CHALLENGE_SIX | 248.32 | 325.35 | 100% | 0 | 0 | 0 |
| CHALLENGE_SEVEN | 256.12 | 389.59 | 100% | 0 | 0 | 0 |
| TAXONOMY_STRESS | 254.57 | 395.00 | 100% | 0 | 0 | 0 |

Gateway requests **736**; decisions attempted **736**; completed **736**. Transport-reported input tokens **372,791**; output tokens **52,794**. Numeric input/output usage was present on all 736 responses, including canary. Output usage is retained in the safe transport audit because the qualified normalized SDK result exposes only input usage. No raw headers, credentials or diagnostics were retained.

## Frozen dataset quality

Total authored 815; Standard 184; Challenge 249; Taxonomy Stress 57; rejected 325; unreviewed 0. Challenge adversarial 83; survival 90.22%; raw author/reviewer agreement 97.46%; ambiguity rate 15.56%; Insight label agreement 100%; Insight Challenge count 43. Rubric **PROVISIONAL EXPERIMENTAL**. No membership or label changes after predictions. Standard is narrow and lacks Preference/Insight, so no redundant Standard live calls were added.

## UI and regression

Immutable live evidence loaded locally into Manage → Decision Intelligence: **PASS**. V0 original, V0 reproduction, Six, Seven, Stress, and the separate 14-case canary are distinguishable by run/size. Each API analysis exactly matches its immutable evidence analysis. Dataset quality, difficulty, boundaries, Insight, high-confidence error inspection and analysis-only thresholds: PASS. Stress exposes no accuracy or simulator.

Desktop 1440×900, mobile 390×844, keyboard/filter/detail/back/refresh, run switching, labels/focus and scoped axe WCAG 2A/2AA/2.1AA: **PASS**. Unexpected console errors **0**; unexpected failed responses **0**; accessibility violations **0**; document-level mobile overflow **NONE**. Screenshots and browser reports accompany this report.

701 Eve tests passed against unchanged source during the benchmark, including 110 Decision Intelligence tests. After the benchmark, 134 core contracts and 28 synthetic local PostgreSQL Knowledge/owner-isolation/Forget scenarios passed; canonical Insight classifier calls remained zero. No further inference occurred during UI checks: the local transport blocked evaluation and external model traffic.

## Behavioral, privacy and external-activity invariants

- Mode SHADOW; authority ADVISORY ONLY; behavioral influence NONE.
- Sofie behavior, canonical Knowledge, canonical Insight, Action Gateway, Routine Admission, Computer authority and Federation authority changed: NO.
- Real owner Knowledge/conversations/Goals/Files/production data transmitted: 0 each; synthetic examples only.
- Jev inference requests: 736. Other model/provider inference calls: 0. The local UI uses in-process Gateway fixtures; existing development OIDC authentication was refreshed, without creating a key/project/resource.
- Email sends, messages, phone calls, Computer Sandboxes, Federation calls, deployments, purchases and new external resources: 0 each.
- Shared database and production access: NONE. Only the existing isolated synthetic local PostgreSQL database was used.
- No owner sampling, production shadow traffic, fast path, fallback routing, canonical taxonomy change, merge or deployment.

## Conclusions and next step

**JEV V0.5 CHALLENGE MIXED.** Seven shows useful accuracy and confidence separation with no ≥90% errors, but Six has three ≥95% errors, the Fact/Observation boundary is only 70% under Seven, and Stress reveals confident forced choices. Calling this uniformly strong would hide those limitations.

**INSIGHT BOUNDARY NEEDS CLARIFICATION.** The provisional rubric supports many defensible cases, but observation versus inferred synthesis, attribution, and mixed intent remain relevant semantic questions. This does not retroactively invalidate the frozen primary labels.

**INSIGHT NEEDS MORE TAXONOMY WORK.** Recall is excellent, but 79.63% precision and disputed high-confidence synthesis warrant review before making Insight a runtime decision contract.

**REFINE TAXONOMY FIRST.** Resolve the separate post-run review packet and define how future classification represents uncertainty or mixed concepts. A new, independently frozen validation set would then be needed before any V1 design decision. Neither a six-class nor seven-class fast path is recommended for implementation now. Candidate threshold: **NONE**. No behavioral activation occurred.

The evidence is preserved for human review. This work order ends here.


This is the preserved live-run report. Integration qualification and source identities are recorded separately.
