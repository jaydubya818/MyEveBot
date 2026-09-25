# JEV V0.5 CHALLENGE LOCALLY QUALIFIED

Stage 1 only. All provider results used for qualification are deterministic fixtures. Live Jev calls: **0**. No owner data, shared database, production change, deployment, or behavioral influence.

## Source and preservation

V0 baseline: `d54f152eafdac40d2293281b1046e343bf65cd8b`. V0.5 branch: `feat/jev-decision-intelligence-v05-challenge`. This report is bound to its containing commit; the final external attestation records matching local/remote HEAD and clean status. Main and V0 were not merged or changed. The original user checkout retains its pre-existing unrelated changes.

The original 500-case draft, reviews, rejected-draft manifest and failed Stage 1 report remain intact. Its 462 agreed labels and only three surviving adversarial cases are methodology evidence, not qualified benchmark performance. V0 contract, dataset and shadow implementation are byte-preserved by tests. Historical V0 live evidence was copied byte-for-byte only for a separately labeled UI comparison.

## Dataset accounting

| State | Count |
|---|---:|
| STANDARD | 184 |
| CHALLENGE | 249 |
| TAXONOMY_STRESS | 57 |
| UNREVIEWED | 0 |
| REJECTED_LEAKAGE | 152 |
| REJECTED_DUPLICATE | 0 |
| REJECTED_INVALID | 173 |

**815 authored = 184 Standard + 249 Challenge + 57 Taxonomy Stress + 325 rejected + 0 unreviewed.** This includes 500 historical cases and 315 newly authored cases. Neutral IDs PASS; admitted provider-visible label leakage 0; near-duplicate audit PASS. Each case has an explicit state and retained rejection reasons.

Rejections: 150 legacy contexts with category guidance plus two newly authored guiding contexts; 166 original hard/adversarial cases not reused because their difficulty was unqualified, plus seven new obvious self-label shortcuts. No rejected-ID or rationale leakage was sent to providers; IDs and all private annotations are excluded from provider requests. No full normalized input duplicates. Ten near matches within the new corpus are declared contrastive families; none meet the configured near-match threshold against V0 or the old draft. No cases were downgraded after review to fill targets.

## Challenge quality

| Difficulty | Count | Share |
|---|---:|---:|
| MODERATE | 52 | 20.9% |
| HARD | 114 | 45.8% |
| ADVERSARIAL | 83 | 33.3% |

Adversarial survival: **83/92 = 90.22%** of all newly authored adversarial cases, including adversarial stress constructions. Boundary diversity, class coverage, independent review, difficulty distribution and ≥60 adversarial gates all PASS. New class counts: Fact 33, Observation 58, Hypothesis 30, Decision 42, Commitment 26, Preference 17, Insight 43. Preference remains the smallest Challenge class; macro metrics and per-class support must accompany accuracy.

Standard has only 184 defensible unchanged easy/moderate cases, below the directional target. It is a limited legacy baseline: no Preference or Insight examples, and all cases are in arts/heritage/fieldwork. Standard Seven is supported but adds little value and is not in the proposed live plan. No counts were padded to hide these limitations.

## Ground truth

Rubric: `knowledge-taxonomy-challenge-rubric:v1`, **PROVISIONAL EXPERIMENTAL**. SHA-256: `4d6e330835ead247e07425be6e2a8d37b3206254487d22334b03efa569cff78c`. Difficulty rubric was frozen before authoring: `knowledge-challenge-difficulty:v1`.

New-cycle raw author/reviewer label agreement: **307/315 = 97.46%**; disagreements: **8**. Ambiguity flag on either side: **49/315 = 15.56%**. Stress admission: **57/315 = 18.10%**, including disputed, ambiguous and rubric-sensitive cases. Agreement is reported honestly, not used as a 95% acceptance target.

Insight author/reviewer label agreement is **51/51 = 100%**. That does not make all 51 usable: 44 have defensible agreed primary labels, one is rejected as a shortcut, 43 enter Challenge, and seven remain rubric-sensitive Stress cases. Thus both Insight minimum-count gates pass. Label agreement, defensibility and primary admission are distinct measures.

Human review packet: [human-review.json](human-review.json). No human adjudication has been claimed. Three fresh author agents and three separate fresh review agents handled the new 315 cases. Review batches each contain 105 examples, deterministically shuffled with seed `2026092102`; no batch contains two members of a contrastive family. Reviewers received only rubric, neutral ID, candidate and bounded context. They did not see author choices, difficulty, families, V0 errors or provider results.

Ground-truth review model calls: **underlying count unavailable**. Auditable agent invocations: **3 new review agents; 3 historical review agents; 6 total**. Exact inherited model identifier unavailable. Review input tokens, output tokens and cost: **unavailable**, not zero. No separate external review API was invoked. Jev benchmark calls and spend: **0 / $0**. These activities are separate.

| Boundary | Newly authored | Challenge | Stress |
|---|---:|---:|---:|
| FACT ↔ OBSERVATION | 44 | 40 | 4 |
| OBSERVATION ↔ INSIGHT | 53 | 44 | 9 |
| OBSERVATION ↔ HYPOTHESIS | 34 | 30 | 4 |
| INSIGHT ↔ HYPOTHESIS | 33 | 29 | 4 |
| DECISION ↔ COMMITMENT | 39 | 30 | 9 |
| PREFERENCE ↔ DECISION | 40 | 30 | 10 |
| INTENT ↔ COMMITMENT | 37 | 25 | 11 |

Boundary counts overlap. Full all-authored and new-cycle breakdowns are in [quality.json](quality.json). Forty-three stress cases carry MULTI_CONCEPT, showing a structural limit of single-choice classification. Some Insight/Preference and Insight/Decision overlaps remain deliberately unresolved. **KNOWLEDGE TAXONOMY SUFFICIENTLY DEFINED FOR THIS EXPERIMENT** applies only to the admitted primary cases under the provisional rubric; it does not endorse a canonical taxonomy change.

## Length, cues and coverage

| Cohort | Candidate chars median / p95 | Context chars median / p95 |
|---|---:|---:|
| STANDARD | 53 / 70 | 44 / 61 |
| CHALLENGE | 62 / 105 | 187 / 257 |
| TAXONOMY_STRESS | 86 / 132 | 171 / 248 |

Challenge contexts are longer than Standard, but difficulty is defined by attribution, corrections, negation, conditions and semantic contrasts, not token length. Stress context median is shorter than Challenge. Contrastive families preserve minimal meaningful changes. Only one of 249 Challenge candidates matches the narrow diagnostic cue vocabulary ("observed", in a Hypothesis case); this does not prove absence of every lexical shortcut.

Challenge spans 19 synthetic domains; largest is software, 39/249 (15.7%). Speaker coverage: owner 152, agent 21, third party 35, document/meeting 41. Stress spans 11 domains. Temporal diagnostics are rough, non-exclusive: Challenge past 25, future 23, conditional 21, corrected/superseded 51; untagged current statements remain present. Raw speaker/domain and length distributions are retained in quality.json.

## Harness and UI

V0 reproduction, Standard Six/Seven, Challenge Six/Seven and Taxonomy Stress are READY through the existing runner. Six-class calls keep the exact original definitions; seven-class calls use `knowledge.classification:v2-challenge`. Inputs are only candidate, bounded context and contract definitions. Mutation tests cover private metadata and leakage. Run validation binds frozen cohort IDs, labels and contract/dataset/rubric hashes; live execution also requires a source commit/provider/model manifest. Invalid models/probability semantics stop the experiment.

Fake-provider qualification PASS, including correct/wrong/high-confidence wrong/low-confidence/Insight/timeouts and confident disputed Stress choices. Primary metrics, difficulty/boundary summaries, matched 206 non-Insight comparison, seven-class confusion, macro precision/recall/F1, confidence bins and seven thresholds are supported. Threshold errors per 1,000 are synthetic-distribution projections. Unknown cost/usage remain null. Macro metrics average all contract classes, assigning zero to undefined class metrics; inspect support before comparing Standard or matched seven-class macro F1.

Stress has choice distributions, confidence ≥90/95/99, author-only/reviewer-only/both/neither agreement and high-confidence disputes. Accuracy and threshold functions reject Stress, including when mixed with primary rows. The UI has no Stress simulator or correctness labels.

UI PASS: experiment comparison, cohort selection, quality/survival, difficulty, boundaries, Insight, threshold simulator, desktop, mobile, keyboard, detail/filter/back/refresh, loading, empty, error and retry. Scoped axe WCAG 2A/2AA/2.1AA found zero violations for primary and stress on both viewports. Browser errors and unexpected HTTP failures: zero in the main flows; failure-state testing intentionally injected 503. Chat and other navigation surfaces passed. The frozen corpus appears in zero client chunks (32 scanned); only requested evidence pages/details are returned.

## Regression

| Check | Result |
|---|---|
| decisionIntelligenceTests | 110 |
| eveTests | 701 |
| coreContracts | 134 |
| typescript | PASS |
| capabilityDefinitions | 135 |
| authoredTools | 99 |
| skillRoutingChecks | 93 |
| skillRankOne | 50/57 (existing baseline) |
| builderManifest | 146 prunable files; release 255 |
| executorSources | 529 |
| executorUnknown | 0 |
| eveBuild | PASS |
| builderBuild | PASS |
| providerFreeGeneratedBuild | PASS |
| generatedFiles | 975 |
| knowledgeForgetScenarios | 28 |
| canonicalInsightCalls | 0 |
| desktop | PASS: 1440×900 |
| mobile | PASS: 390×844 |
| accessibilityViolations | 0 |
| clientCorpusMatches | 0 |
| diffCheck | PASS |
| secretPatternScan | PASS |
| liveJevCalls | 0 |
| ownerDataTransmitted | 0 |

All 110 Decision Intelligence tests are included in the 701 Eve total. Core contracts: 134. Builds used no provider credentials; the generated template reused the existing dependency tree with its original nesting and root lockfile. The initial generated build could not resolve hoisted Next because that root lockfile was absent; correcting only the temporary build layout produced PASS. No dependency changes were made.

The test-only web-auth fixture now uses the current clock instead of a fixed date that expired during this work. Production authentication behavior is unchanged. Most changed files are retained dataset/review/audit evidence; implementation changes are confined to Decision Intelligence and local qualification helpers. Existing UI changes wrap the preserved V0 view and add a focused experimental panel.

Local PostgreSQL was isolated and contained only synthetic fixtures. Existing canonical migrations were reused; none were added. Action Gateway, Routine, Computer, Federation and approvals are untouched. No owner sampling, fast path, fallback activation, hidden learning or Insight runtime classification was introduced.

Evidence logs and screenshots: `/private/tmp/jev-v05-qualification`. [local-qualification.json](local-qualification.json) records their SHA-256 hashes. The dataset freeze manifest remains an immutable record of the earlier dataset-freeze phase; this qualification record completes the later harness/UI/regression phase.

## Live authorization boundary

Live Jev remains unauthorized. Prior V0 spending approval does not apply. The separately proposed plan is documented in [live-plan.md](live-plan.md). Stop for new authorization before any live call.
