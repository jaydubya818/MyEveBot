# MyEve Knowledge Taxonomy Findings — pre-dataset audit

Source: qualified V0 commit `d54f152eafdac40d2293281b1046e343bf65cd8b`. Current main remains its parent `88370d0662c7824445b59779a8b8e8b21abfa10b`. This audit precedes challenge authoring and any V0.5 Jev call. It does not redefine canonical Knowledge.

## What canonical code actually specifies

| Kind | Normative evidence | Limits |
| --- | --- | --- |
| Fact | `agent/tools/record_fact.ts`: durable owner-scoped factual assertion, confidence/provenance; not guesses, observations or preferences | No operational rule establishes when a measurement stops being an Observation and becomes a Fact |
| Observation | `agent/tools/record_observation.ts`: something noticed, evidence rather than an automatically trusted preference; positive occurrence count and observation times | A count or measured value can also be externally true; no precedence rule |
| Hypothesis | `lib/knowledge-types.ts`: open/supported/rejected/inconclusive/promoted lifecycle; optional test description and decision trigger in `lib/knowledge.ts`; integration fixture predicts an improvement and proposes a comparison | No standalone canonical classifier; test metadata is not mandatory; prose boundary with Insight is unspecified |
| Decision | `record_decision.ts`: explicit durable decision, rationale, alternatives, reopen condition and provenance; title and decision timestamp required | Choosing an action may also create an obligation; no mixed-statement primary-label rule |
| Commitment | `record_commitment.ts`: explicit obligation; do not infer broad commitments from casual language; subject required, due date optional | Intention or planning alone is not sufficient; subjects are not restricted to the owner |
| Preference | `lib/knowledge.ts`: key/value/scope/source type required; explicit user, approved observation or system default; approved observation must resolve for the same owner | Observations must not silently become preferences. Owner scoping of a record is not a general rule for the grammatical speaker of quoted content |
| Insight | `lib/knowledge.ts` and migration 0011 require `generatedAt`; lifecycle active/stale/superseded/contradicted. `test/knowledge.integration.mjs` labels “Concise drafts reduce revision cycles.” as Insight with `derived_from` provenance | No normative prose definition, support threshold, derivation algorithm, minimum source count or rule distinguishing synthesis from hypothesis |

All kinds can carry `supports`, `contradicts`, `derived_from`, `mentioned_in`, or `confirmed_by` links. Provenance is optional in canonical creation, including Insight. Therefore `derived_from` alone does not identify Insight, and an Insight must not be described as necessarily proven, causal, multi-source, or more certain than a Fact. `generatedAt` records generation time; it is not proof of semantic type.

## Insight audit answers

- **What qualifies?** Canonical writers accept an explicit `insight` kind with a generation timestamp. A derived interpretive assertion appears in an integration fixture. The code does not define a complete natural-language membership criterion.
- **Versus Observation:** Observation is explicitly something noticed and has occurrence metadata. Insight has generation metadata. No semantic promotion/aggregation rule is supplied.
- **Versus Fact:** Both share the same lifecycle and can be supported or contradicted. A factual assertion can also be generated or derived. The code does not supply exclusive boundaries.
- **Versus Hypothesis:** Hypothesis has a testing lifecycle and optional test description. The example Insight is itself an explanatory assertion. The repository does not specify how much support changes one into the other.
- **Evidence/source semantics:** Shared provenance vocabulary, optional links, no Insight-specific evidence threshold. Evidence context can inform a reviewer but cannot establish an invented canonical rule.
- **Can one statement contain both?** Yes, natural-language examples can contain an observation, inference and commitment together. Canonical records have one explicit kind; the code has no primary-clause or precedence algorithm. Mixed cases without a clearly isolated target must remain ambiguous.

## Experimental implications

The seven-class contract needs a visibly provisional interpretation or an authoritative owner-provided definition before labels can be defensibly frozen. Do not silently call an inferred interpretation canonical. The audit records this as a product-taxonomy finding, not a provider limitation.

Underspecified utterances, contradictory clauses, unattributed quotations and mixed candidates without a defined primary target should be retained as AMBIGUOUS with alternative labels and rationale, excluded from primary metrics and from the six-class control when Insight is plausible. Reviewer disagreement must not be repaired after seeing provider outputs.

A distinct seven-class contract must not be conflated with adding an extra choice alone: any clarified six-class definitions in v2 are a second experimental variable. Report matched non-Insight performance and this confound. The v1-compatible control must use the exact original v1 question and definitions.

The source audit above preceded authoring. A 500-case draft has now completed blind AI review and failed dataset quality qualification, as recorded below. No eligible live dataset has been frozen. No V0.5 live Jev calls have been made.

## Approved provisional experimental rubric

Approved by the owner for this experiment. This is a **PROVISIONAL EXPERIMENTAL RUBRIC**, not an existing canonical definition. It applies only to `knowledge.classification:v2-challenge` and its synthetic label review:

| Kind | Proposed experiment wording |
| --- | --- |
| Fact | A durable factual assertion presented as established information, rather than a fresh noticing, tentative explanation, choice, obligation or owner preference |
| Observation | A directly noticed or measured occurrence or pattern, reported as evidence without adding an explanatory interpretation |
| Hypothesis | An uncertain explanation or prediction put forward for testing rather than treated as an established interpretation |
| Decision | An explicit choice that has been made; a discussed option, intention or hypothetical choice alone is insufficient |
| Commitment | An explicit promise, agreement or obligation attributable to a stated subject; casual plans and wishes alone are insufficient |
| Preference | An explicit owner way-of-working preference or an explicitly approved/default owner preference; a quoted other person's preference is not automatically the owner's |
| Insight | A generated interpretation or synthesis that draws meaning or a relationship from stated evidence, rather than only reporting an occurrence; it does not imply certainty, proof or causation |

No minimum source count, numeric confidence cutoff or automatic promotion from one kind to another is proposed. If Insight versus Hypothesis/Fact still cannot be resolved from the bounded context, reviewers should mark AMBIGUOUS. The same applies to mixed candidates lacking an isolated target, bare temporal fragments and other-person statements whose canonical treatment is unclear. Do not use “last clause wins,” “Insight takes precedence,” or another hidden primary-label rule.

## Approved independent AI review protocol

1. Author candidate, bounded context, proposed label, label confidence, difficulty, boundary tags and rationale without any V0.5 Jev output.
2. Freeze a blinded packet containing only class-neutral IDs, candidates and context, plus this approved rubric as separate reviewer instructions.
3. A distinct reviewer supplies label/confidence/rationale without seeing author labels, difficulty, boundary tags or provider predictions. Identify the reviewer as human or independent AI truthfully.
4. Exact HIGH/MEDIUM label agreement with neither pass ambiguous becomes AGREED. Label mismatch remains REVIEW_DISAGREEMENT; explicit ambiguity remains AMBIGUOUS; LOW confidence remains LOW_CONFIDENCE. Preserve overlapping exclusion reasons and both judgments. Exclude all from primary accuracy. No post-Jev relabeling.
5. Validate similarity, coverage and leakage; freeze dataset, review packet, rubric and hashes before asking for live authorization.

Use fresh isolated Codex review agents. Record AI INDEPENDENT REVIEW, model availability, date, rubric hash and exact blinded inputs. This is not human adjudication. Produce a compact human packet of excluded, multi-concept and unresolved Insight cases. Track ground-truth review separately from Jev usage.

Rubric identifier: `knowledge-taxonomy-challenge-rubric:v1`. Frozen UTF-8 file SHA-256: `4d6e330835ead247e07425be6e2a8d37b3206254487d22334b03efa569cff78c`. See `rubric.json`. Agreement metrics and Insight readiness will be appended after blind review.

## Draft 01 findings — not eligible for evaluation

AI INDEPENDENT REVIEW: three fresh isolated agents each received only neutral IDs, candidate/context and the frozen rubric. Exact model identifier was not exposed; each result records this limitation and its review date. No external review API was invoked. Agent usage/cost is unavailable, not zero, and is separate from Jev (zero calls).

500 authored; 462 agreed HIGH/MEDIUM primary candidates; 38 excluded for ambiguity; 7 overlapping author/reviewer disagreements; 37 overlapping LOW-confidence cases. Raw label agreement is 98.6%, including agreement on AMBIGUOUS. Agreement eligible for primary scoring is 92.4%. Six-class candidate count is 387; seven-class candidate count is 462. These are construction statistics, not approved live run sizes.

Insight: 75 proposed, 75 independently agreed, zero ambiguous, zero disputed, 100% raw agreement. This does **not** establish robust Insight ground truth: the authored Insight cases are unusually explicit, and the overall corpus fails the adversarial challenge objective. No recommendation to repair canonical Insight semantics follows from this draft.

| Difficulty | Authored | Agreed | Excluded |
| --- | ---: | ---: | ---: |
| EASY | 48 | 48 | 0 |
| MODERATE | 286 | 286 | 0 |
| HARD | 126 | 125 | 1 |
| ADVERSARIAL | 40 | 3 | 37 |

Only 27.7% of the agreed set is tagged HARD/ADVERSARIAL, versus the requested approximately 65% authored target. The initial metadata uses authoring heuristics and requires a manual semantic audit; tags must not be inflated to hide this shortfall. Some context describes how to label the candidate instead of supplying natural conversational evidence. Structural serialization removes hidden metadata, but that alone cannot remove semantic cues already written into context. A lexical context screen flagged 65 candidates for inspection; that is a screening count, not a claim that every match is leakage.

Zero exact or normalized V0 candidate duplicates and zero token-Jaccard matches at the declared 0.60 threshold were found. Lexical distance does not prove absence of semantic rewrites; semantic novelty remains unqualified.

The 41-case human packet retains the 38 excluded cases plus 3 agreed cases flagged for multi-concept inspection, with both judgments and short rationales. `agreement.json` includes all class, difficulty and boundary breakdowns. `draft-manifest.json` hashes the rejected construction snapshot and marks it ineligible for live evaluation. This is **not** the final dataset freeze required by the work order.

Required correction: replace explanatory context with natural bounded evidence; author substantially more independently classifiable hard/adversarial cases; manually audit difficulty/boundary metadata; run a fresh blinded review for every changed candidate/context. Do not alter the existing review outputs to fit replacement examples. Preserve this failed attempt and keep Jev absent from all construction decisions.

A probabilistic model must not be blamed for distinctions that MyEve has not defined clearly enough for independent ground truth. Equally, high review agreement on an overly guided corpus must not be presented as success at adversarial classification.
