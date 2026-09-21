# JEV V0.5 CHALLENGE NOT QUALIFIED

The first 500-case construction draft fails the intended held-out adversarial challenge gate. It is preserved for inspection, **not approved or frozen for live evaluation**. No V0.5 Jev calls were made. No live authorization is requested. No commit or push was made because the work order conditions those actions on successful qualification.

## What failed

The authored difficulty mix was 48 EASY, 286 MODERATE, 126 HARD and 40 ADVERSARIAL, materially short of the requested approximately 50/125/200/125. After independent review, only 3 of the 40 adversarial cases remain eligible. The agreed set is 72.3% EASY/MODERATE. This fails the experiment's purpose even though overall review agreement looks high.

Some context explains how a candidate should be interpreted rather than supplying natural conversational evidence. For example, descriptions of a "standing personal preference" or an "explicit accepted undertaking" make the intended label unusually easy to recover. The serialization tests correctly remove hidden author fields, but cannot fix guidance already written inside candidate context. The context audit flags 65 possible cues; this is a screening count, not a verified leakage count.

The initial author difficulty/boundary metadata also used keyword heuristics. Those tags are provisional and need manual semantic review. No tag-only changes should be used to satisfy the target distribution. These are authoring-quality failures, not failures of Jev or proof that canonical Insight semantics need changing.

## Completed construction evidence

- Provisional rubric `knowledge-taxonomy-challenge-rubric:v1` frozen as `rubric.json`; SHA-256 `4d6e330835ead247e07425be6e2a8d37b3206254487d22334b03efa569cff78c`.
- 500 synthetic cases, with neutral randomized IDs, author judgments and short rationales.
- Three fresh isolated AI INDEPENDENT REVIEW agents; 167/167/166 cases. Reviewers received only candidate, bounded context, neutral ID and rubric. Author labels, tags, difficulty, V0 results and Jev outputs were withheld.
- Review model recorded as inherited Codex model, exact identifier unavailable. Review dates are preserved in each raw result. This is not human ground truth.
- 462 agreed HIGH/MEDIUM cases; 38 excluded cases; 7 overlapping disagreements; 37 overlapping LOW-confidence cases. Exclusion categories overlap and must not be added together.
- Raw label agreement 98.6% includes agreement on AMBIGUOUS. Primary eligibility is 92.4% of authored cases.
- 41-case human packet: all 38 exclusions plus 3 agreed cases flagged for multi-concept inspection. No Jev predictions.
- Reproducible agreement by class, difficulty and boundary in `agreement.json`.
- Hash-bound rejected snapshot in `draft-manifest.json`. Its `eligibleForLiveEvaluation` is false. Snapshot preservation is not the final live dataset freeze.

| Author class | Authored | Agreed | Ambiguous | Disagreement |
| --- | ---: | ---: | ---: | ---: |
| Fact | 76 | 75 | 1 | 1 |
| Observation | 78 | 78 | 0 | 0 |
| Hypothesis | 79 | 79 | 0 | 0 |
| Decision | 53 | 53 | 0 | 0 |
| Commitment | 51 | 51 | 0 | 0 |
| Preference | 51 | 51 | 0 | 0 |
| Insight | 75 | 75 | 0 | 0 |
| Author AMBIGUOUS | 37 | 0 | 37 | 6 |

All classes exceed 40 agreed cases, but numeric coverage is not enough to qualify an overly guided dataset. Insight agreement is 100% on 75 unusually explicit cases; it does not establish stability at the difficult Observation/Insight/Hypothesis boundaries. **Challenge-six readiness: NOT READY. Challenge-seven readiness: NOT READY.** Draft counts of 387 six-class and 462 seven-class cases are not approved benchmark sizes.

## Verification performed

- Preserved V0 contract, dataset and shadow evaluator byte hashes: PASS.
- Independent-review validation: PASS, including mismatched rubric/input rejection, self-review rejection, exact coverage, hidden-field serialization, ambiguity/disagreement/LOW exclusions and metadata validation.
- Full existing Eve unit suite plus initial new review/preservation tests: 673 PASS. Two subsequently added snapshot/reconciliation tests: PASS.
- Core regression suite: 134 PASS.
- Eve workspace TypeScript, capability registry, skill routing and executor inventory: PASS. 135 capability definitions, 99 authored tools, 526 classified sources, UNKNOWN=0.
- Raw candidate exact/normalized comparisons against V0: zero matches. Token-Jaccard screen at 0.60: zero flagged pairs, highest 0.50. Semantic novelty is not qualified by lexical distance alone.
- `git diff --check`: PASS.

The first unit run exposed an existing calendar-dependent auth test: a September 14 session fixture expired during this work. V0.5 changes the test to issue a current session; no authentication implementation changed. The repeat unit run passed. An initial ad hoc check invoked root TypeScript 7 and reported existing VNC type incompatibilities; the supported Eve workspace command uses its locked TypeScript 5.9.3 and passed. No dependency changes were made.

The original user worktree's unrelated changes remain untouched. The V0 worktree remains clean at the qualified commit. Canonical Knowledge, owner-data behavior, actions and routines are unchanged.

## Stage 1 remains incomplete

The v2 contract, challenge harness integration, comparison metrics, challenge UI, desktop/mobile/axe validation, builds/generated deployments and full updated integration qualification have not been completed. Existing V0 tests passing is not a substitute for those gates. The dataset has not earned promotion into those evaluation paths.

Required next work is a new construction revision: replace labeling guidance with natural bounded context, author materially more classifiable hard/adversarial cases, manually validate metadata and semantic novelty, then conduct fresh blind review for every changed input. Preserve the current raw reviews and rejected snapshot. Do not quietly relabel, overwrite, or present this first draft as the final challenge.

Live Jev calls: **0**. Real owner data: **NONE**. Behavioral influence: **NONE**. Ground-truth review used three Codex agents; token/cost telemetry was unavailable and is recorded as null, separately from Jev. No external review-model API was invoked.

To reproduce this draft's statistics and verify that the preserved artifacts match, run from the V0.5 worktree:

```sh
node --import tsx docs/experiments/jev-v05/review/reconcile.mts
node --import tsx docs/experiments/jev-v05/review/audit.mts
npm test --workspace=eve-agent -- --run lib/decision-intelligence/challenge-draft.test.ts lib/decision-intelligence/challenge-review.test.ts lib/decision-intelligence/v0-preservation.test.ts
```

The evidence scripts refuse to overwrite artifacts with changed content. No command above invokes Jev.
