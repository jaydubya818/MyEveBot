/** Completed synthetic experiments. These findings never configure runtime behavior. */
export function DecisionExperimentConclusions() {
  return (
    <section
      className="min-w-0 rounded-xl border border-kumo-hairline p-4"
      aria-labelledby="experiment-conclusions"
    >
      <h3 id="experiment-conclusions" className="font-medium">
        Completed experiments
      </h3>
      <dl className="mt-3 grid grid-cols-2 gap-4 text-sm">
        <div>
          <dt className="text-kumo-subtle">V0</dt>
          <dd>PROMISING · 98.10% accuracy</dd>
        </div>
        <div>
          <dt className="text-kumo-subtle">V0.5</dt>
          <dd>MIXED</dd>
        </div>
        <div>
          <dt className="text-kumo-subtle">Mode / authority</dt>
          <dd>SHADOW / ADVISORY ONLY</dd>
        </div>
        <div>
          <dt className="text-kumo-subtle">Behavioral influence</dt>
          <dd>NONE · no active threshold</dd>
        </div>
      </dl>
      <p className="mt-4 font-medium">
        Recommended next step: REFINE TAXONOMY FIRST
      </p>
      <p className="mt-2 text-sm">
        The infrastructure and evidence are useful; autonomous Knowledge
        classification is not enabled. Ordinary Agent behavior does not depend
        on Jev.
      </p>
      <div className="mt-4 space-y-3 text-sm">
        <p>
          <strong>Challenge Six:</strong> 86.41% accuracy. At ≥95% confidence:
          97.17% accuracy, 51.46% coverage, 3 errors.
        </p>
        <p>
          <strong>Challenge Seven:</strong> 89.56% accuracy; adversarial
          accuracy 87.95%. At ≥95% confidence: 100% observed accuracy, 43.37%
          coverage, 0 observed errors. Finite synthetic evidence does not
          establish a zero-error guarantee.
        </p>
        <p>
          <strong>Insight · PROVISIONAL EXPERIMENTAL:</strong> precision 79.63%,
          recall 100%, F1 88.66%. Eleven false positives: 6 Observation, 3 Fact,
          2 Hypothesis. The Insight boundary needs clarification; canonical
          Insight behavior is unchanged.
        </p>
        <p>
          <strong>Taxonomy Stress · UNSCORED:</strong> 57 cases. Four
          author/reviewer disagreements received ≥95% confidence; two received
          ≥99%. Confidence alone is not a reliable detector of taxonomy
          ambiguity.
        </p>
      </div>
      <p className="mt-4 text-xs text-kumo-subtle">
        Historical synthetic results, measured September 21, 2026 UTC. Opening
        or filtering this evidence makes no provider calls. Thresholds remain
        simulation only.
      </p>
    </section>
  );
}
