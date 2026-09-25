# Decision Intelligence final integration

The experiment is complete. V0 was PROMISING; V0.5 is **MIXED**. The final taxonomy conclusion is **INSIGHT BOUNDARY NEEDS CLARIFICATION**; Insight needs more taxonomy work; the next product decision is **REFINE TAXONOMY FIRST**.

MyEve contains a provider-neutral DecisionProvider boundary, optional Jev adapter, frozen evaluation contracts and evidence, and a read-only Decision Intelligence UI. Jev remains **SHADOW / ADVISORY ONLY**, with **NONE** behavioral influence, **NONE** active threshold, and no fast path. Canonical Knowledge and Insight semantics/persistence are unchanged. No background benchmark or owner sampling is registered.

We retain a mixed experiment because the infrastructure is useful, the provider abstraction is qualified, the evidence is valuable, and the UI makes its limits visible. Integration does not make Jev classify the owner's Knowledge.

## Retained evidence

- [V0 live report](v0-live-report.md): 98.10% accuracy.
- [V0.5 complete live report](v05-live-report.md): 736 requests; zero retries/failures/timeouts/rate limits; no owner data.
- [Post-Jev review packet](post-jev-review.json): secondary analysis only; frozen labels are unchanged.
- [Prediction byte hashes](evidence-manifest.json): original normalized evidence retained byte-for-byte.
- [Live-evidence applicability](live-evidence-applicability.json): the adapter, serialization, contracts, datasets, rubric and metrics are unchanged from the live-qualified source.
- [Integration qualification](integration-qualification.md).

Challenge Six: accuracy 86.41%, macro F1 86.74%. At ≥95%: 97.17% accuracy, 51.46% coverage, three errors. Challenge Seven: accuracy 89.56%, macro F1 90.14%; adversarial accuracy 87.95%. At ≥95%: 100% observed accuracy, 43.37% coverage, zero observed errors. Finite synthetic evidence does not establish a zero-error guarantee.

Insight: precision 79.63%, recall 100%, F1 88.66%; eleven false positives (Observation six, Fact three, Hypothesis two). Taxonomy Stress: 57 UNSCORED cases; four reviewer disagreements received ≥95% confidence, two received ≥99%. Confidence alone is not a reliable detector of taxonomy ambiguity.

Dataset accounting: 815 authored = 184 Standard + 249 Challenge + 57 Stress + 325 rejected + 0 unreviewed. Challenge difficulty: 52 moderate, 114 hard, 83 adversarial. Adversarial survival 90.22%; author/reviewer agreement 97.46%; ambiguity 15.56%; 43 Insight Challenge cases and 100% Insight label agreement. Insight rubric remains PROVISIONAL EXPERIMENTAL.

## Runtime and privacy

The default evidence store loads six bundled **public synthetic historical** runs, server-side, without a provider credential or configured directory. This data is not owner Knowledge; the authenticated read-only route cannot recover forgotten Knowledge. An explicit `MYEVE_DECISION_EVIDENCE_DIR` still selects validated local experiment artifacts as before. The client receives only paginated evidence and requested details; the full corpus is absent from client bundles.

Normal use has no Jev availability requirement. Viewing/filtering evidence makes zero Jev calls. Jev remains outside Action Gateway, approval policy, Routine Admission, Computer and Federation authority. No schema migration, external resource or canonical semantic change is introduced.

Estimated V0.5 incremental model spend: $0.00 under its historical promotion. Actual billed spend: UNAVAILABLE. Additional Jev calls/spend during integration: 0 / $0.00. Historical pricing is not standing authorization for new inference.

## Release boundary

[Existing deployment configuration](deployment-boundary.json) maps Git `main` to Production and enables automatic Git deployments. Established MyEve authorization permits automatic Preview, not automatic Production. Therefore this source-qualified integration can be pushed to its feature branch, but must not be pushed to main until a separate governed deployment-policy decision resolves that boundary. No guard or Vercel setting was changed to bypass it.
