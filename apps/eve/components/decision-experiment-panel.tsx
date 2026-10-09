"use client";
import { Button } from "@cloudflare/kumo";
import type { DecisionView } from "@/lib/decision-intelligence/view";
const percent = (n: number | null | undefined) =>
  n == null ? "Not measured" : `${(n * 100).toFixed(1)}%`;
const box = "min-w-0 rounded-xl border border-kumo-hairline p-4";
const table =
  "w-full text-left text-xs [&_th]:p-2 [&_td]:p-2 [&_tr]:border-b [&_tr]:border-kumo-hairline";
const input =
  "mt-1 block max-w-full rounded-md border border-kumo-hairline bg-kumo-base p-2";
function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <dt className="text-xs text-kumo-subtle">{label}</dt>
      <dd className="mt-1 text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
function Scroll({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="mt-3 max-w-full overflow-x-auto"
      tabIndex={0}
      role="region"
      aria-label={label}
    >
      {children}
    </div>
  );
}
export function DecisionExperimentPanel({
  data,
  query,
  select,
  threshold,
  setThreshold,
}: {
  data: DecisionView;
  query: string;
  select: (key: string, value: string) => void;
  threshold: number;
  setThreshold: (value: number) => void;
}) {
  const run = data.run!,
    a = data.analysis,
    q = data.quality,
    stress = a?.kind === "stress" ? a.stress : null,
    m = data.metrics;
  const params = new URLSearchParams(query),
    page = Number(params.get("page")) || 0;
  const selected = data.simulation.filter(
      (r) => r.confidence !== null && r.confidence >= threshold / 100,
    ),
    errors = selected.filter((r) => r.correct === false).length;
  const outcomes = data.outcomes ?? [];
  const boundaries = q ? Object.keys(q.revision.byBoundary) : [];
  return (
    <>
      <section className={box}>
        <h3 className="font-medium">
          Knowledge Classification · {run.experiment?.replaceAll("_", " ")}
        </h3>
        <p className="mt-2 text-sm">
          {run.environment === "local-fixture"
            ? "LOCAL FIXTURE — NOT JEV PERFORMANCE"
            : "Live synthetic experiment"}
        </p>
        <p className="mt-2 text-sm text-kumo-subtle">
          V0.5 uses synthetic held-out data and a provisional Insight rubric.
          Results measure this evaluation contract, not production owner
          behavior.
        </p>
        <p className="mt-2 text-sm">
          Insight rubric: <strong>PROVISIONAL — EXPERIMENT ONLY</strong>.
          Canonical MyEve has seven categories; its Insight boundary is not yet
          precise enough for benchmark ground truth. This experiment does not
          redefine it.
        </p>
        <label className="mt-4 block text-sm">
          Evaluation run
          <select
            className={`${input} w-full`}
            aria-label="Evaluation run"
            value={run.id}
            onChange={(e) => select("run", e.target.value)}
          >
            {data.runs.map((r) => (
              <option key={r.id} value={r.id}>
                {r.experiment ?? "V0_ORIGINAL"} · {r.environment} · {r.count}{" "}
                examples · {new Date(r.createdAt).toLocaleString()}
              </option>
            ))}
          </select>
        </label>
        <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Metric label="Cohort" value={run.cohort ?? "V0 reproduction"} />
          <Metric
            label="Completion"
            value={percent(m?.completion ?? stress?.completion)}
          />
          {m && (
            <>
              <Metric
                label="Challenge / cohort accuracy"
                value={percent(m.accuracy)}
              />
              <Metric label="Macro F1" value={percent(m.macroF1)} />
              <Metric
                label="End-to-end accuracy"
                value={percent(m.endToEndAccuracy)}
              />
              <Metric
                label="Macro precision"
                value={percent(m.macroPrecision)}
              />
              <Metric label="Macro recall" value={percent(m.macroRecall)} />
              <Metric
                label="Adversarial accuracy"
                value={percent(
                  a?.kind === "primary"
                    ? a.difficulty.ADVERSARIAL?.accuracy
                    : null,
                )}
              />
              <Metric
                label="High-confidence errors ≥95%"
                value={m.highConfidenceErrors.length}
              />
              <Metric
                label="Insight F1"
                value={percent(
                  m.perClass.find((r) => r.outcome === "insight")?.f1,
                )}
              />
            </>
          )}
          {stress && (
            <>
              <Metric
                label="Stress choices ≥90%"
                value={percent(
                  stress.highConfidenceRates.find((r) => r.threshold === 0.9)
                    ?.rate,
                )}
              />
              <Metric
                label="Median confidence"
                value={percent(stress.medianConfidence)}
              />
              <Metric
                label="Stress choices ≥95%"
                value={percent(
                  stress.highConfidenceRates.find((r) => r.threshold === 0.95)
                    ?.rate,
                )}
              />
              <Metric
                label="Stress choices ≥99%"
                value={percent(
                  stress.highConfidenceRates.find((r) => r.threshold === 0.99)
                    ?.rate,
                )}
              />
              <Metric
                label="High-confidence disputed choices"
                value={stress.disputedHighConfidence.length}
              />
            </>
          )}
        </dl>
        {stress && (
          <p className="mt-3 text-sm">
            Taxonomy ambiguity, not model error. There is no accuracy or
            fast-path simulation for this cohort. Reviewer confidence is an
            uncalibrated judgment, separate from provider probabilities.
          </p>
        )}
      </section>
      {q && (
        <details className={box} open>
          <summary className="cursor-pointer font-medium">
            Dataset quality and difficulty survival
          </summary>
          <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Metric label="STANDARD" value={q.allAuthored.counts.STANDARD!} />
            <Metric label="CHALLENGE" value={q.allAuthored.counts.CHALLENGE!} />
            <Metric
              label="TAXONOMY_STRESS"
              value={q.allAuthored.counts.TAXONOMY_STRESS!}
            />
            <Metric
              label="Adversarial challenge examples"
              value={q.revision.adversarialChallenge}
            />
            <Metric
              label="New author/reviewer agreement"
              value={percent(q.revision.rawAgreement)}
            />
            <Metric label="New ambiguous cases" value={q.revision.ambiguous} />
          </dl>
          <p className="mt-3 text-sm">
            Provider-visible label leakage: <strong>NONE</strong> in admitted
            cohorts. Rejected cases remain in the audit. AI INDEPENDENT REVIEW;
            not human adjudication. The failed first draft remains separate
            methodology evidence.
          </p>
          <Scroll label="Difficulty survival table">
            <table className={table}>
              <caption className="mb-2 text-left">
                New authoring cycle, including stress constructions. Difficulty
                was assigned before review.
              </caption>
              <thead>
                <tr>
                  <th>Difficulty</th>
                  <th>Authored</th>
                  <th>Challenge</th>
                  <th>Stress</th>
                  <th>Rejected</th>
                  <th>Survival</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(q.revision.byDifficulty).map(([label, r]) => (
                  <tr key={label}>
                    <th scope="row">{label}</th>
                    <td>{r.authored}</td>
                    <td>{r.challenge}</td>
                    <td>{r.stress}</td>
                    <td>{r.rejected}</td>
                    <td>{percent(r.survival)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Scroll>
          <details className="mt-3">
            <summary className="cursor-pointer text-sm font-medium">
              Boundary survival
            </summary>
            <Scroll label="Boundary survival table">
              <table className={table}>
                <thead>
                  <tr>
                    <th>Boundary</th>
                    <th>Authored</th>
                    <th>Challenge</th>
                    <th>Stress</th>
                    <th>Survival</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(q.revision.byBoundary)
                    .filter(([, r]) => r.authored > 0)
                    .map(([label, r]) => (
                      <tr key={label}>
                        <th scope="row" className="break-words">
                          {label.replaceAll("_", " ")}
                        </th>
                        <td>{r.authored}</td>
                        <td>{r.challenge}</td>
                        <td>{r.stress}</td>
                        <td>{percent(r.survival)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </Scroll>
          </details>
          <p className="mt-3 text-xs text-kumo-subtle">
            STANDARD reuses only unchanged leakage-screened first-draft inputs.
            It is smaller and less diverse than CHALLENGE. Do not pool their
            results. Canonical production performance remains unmeasured.
          </p>
        </details>
      )}
      <details className={box} open>
        <summary className="cursor-pointer font-medium">
          Experiment comparison
        </summary>
        <Scroll label="Experiment comparison table">
          <table className={table}>
            <thead>
              <tr>
                <th>Run</th>
                <th>Count</th>
                <th>Primary accuracy</th>
                <th>Adversarial accuracy</th>
                <th>Macro F1</th>
                <th>Median confidence</th>
                <th>Stress ≥95%</th>
              </tr>
            </thead>
            <tbody>
              {data.comparisons?.map((r) => (
                <tr key={r.id}>
                  <th scope="row">
                    <button
                      className="text-left underline"
                      onClick={() => select("run", r.id)}
                    >
                      {r.experiment.replaceAll("_", " ")}
                    </button>
                    <span className="block font-normal">{r.environment}</span>
                  </th>
                  <td>{r.count}</td>
                  <td>
                    {r.experiment === "TAXONOMY_STRESS"
                      ? "Not scored"
                      : percent(r.accuracy)}
                  </td>
                  <td>{percent(r.adversarialAccuracy)}</td>
                  <td>
                    {r.experiment === "TAXONOMY_STRESS"
                      ? "Not scored"
                      : percent(r.macroF1)}
                  </td>
                  <td>{percent(r.medianConfidence)}</td>
                  <td>{percent(r.stressHighConfidence)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Scroll>
        <p className="mt-3 text-xs">
          V0 keeps its original contract and labels. Six-versus-seven
          comparisons also change rubric wording; adding Insight is not the only
          experimental variable.
        </p>
      </details>
      {data.matchedComparison && (
        <section className={box}>
          <h3 className="font-medium">Matched six-versus-seven comparison</h3>
          <p className="mt-2 text-sm">
            {data.matchedComparison.count} shared non-Insight cases, same cohort
            and environment.
          </p>
          <dl className="mt-3 grid grid-cols-2 gap-4">
            <Metric
              label="Six-class accuracy"
              value={percent(data.matchedComparison.six.accuracy)}
            />
            <Metric
              label="Seven-class accuracy"
              value={percent(data.matchedComparison.seven.accuracy)}
            />
          </dl>
          <p className="mt-3 text-xs">{data.matchedComparison.limitation}</p>
        </section>
      )}
      {a?.kind === "primary" && m && (
        <>
          <details className={box} open>
            <summary className="cursor-pointer font-medium">
              Difficulty and boundary performance
            </summary>
            <Scroll label="Difficulty performance">
              <table className={table}>
                <thead>
                  <tr>
                    <th>Difficulty</th>
                    <th>Count</th>
                    <th>Accuracy</th>
                    <th>Median confidence</th>
                    <th>≥95% errors</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(a.difficulty).map(([label, r]) => (
                    <tr key={label}>
                      <th scope="row">{label}</th>
                      <td>{r.count}</td>
                      <td>{percent(r.accuracy)}</td>
                      <td>{percent(r.medianConfidence)}</td>
                      <td>{r.highConfidenceErrors}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Scroll>
            <Scroll label="Boundary performance">
              <table className={table}>
                <thead>
                  <tr>
                    <th>Boundary</th>
                    <th>Count</th>
                    <th>Accuracy</th>
                    <th>Errors</th>
                    <th>Median confidence</th>
                    <th>≥95% errors</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(a.boundaries).map(([label, r]) => (
                    <tr key={label}>
                      <th scope="row">{label.replaceAll("_", " ")}</th>
                      <td>{r.count}</td>
                      <td>{percent(r.accuracy)}</td>
                      <td>{r.errors}</td>
                      <td>{percent(r.medianConfidence)}</td>
                      <td>{r.highConfidenceErrors}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Scroll>
          </details>
          <details className={box}>
            <summary className="cursor-pointer font-medium">
              Class performance, Insight and confusion matrix
            </summary>
            <Scroll label="Class metrics">
              <table className={table}>
                <thead>
                  <tr>
                    <th>Class</th>
                    <th>Examples</th>
                    <th>Precision</th>
                    <th>Recall</th>
                    <th>F1</th>
                  </tr>
                </thead>
                <tbody>
                  {m.perClass.map((r) => (
                    <tr key={r.outcome}>
                      <th scope="row">
                        {r.outcome}
                        {r.outcome === "insight" ? " · experimental" : ""}
                      </th>
                      <td>{r.examples}</td>
                      <td>{percent(r.precision)}</td>
                      <td>{percent(r.recall)}</td>
                      <td>{percent(r.f1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Scroll>
            <Scroll label="Confusion matrix">
              <table className={`${table} min-w-[600px]`}>
                <caption>Expected rows, provider columns</caption>
                <thead>
                  <tr>
                    <th>Expected</th>
                    {outcomes.map((c) => (
                      <th key={c}>{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {outcomes.map((c) => (
                    <tr key={c}>
                      <th scope="row">{c}</th>
                      {outcomes.map((p) => (
                        <td key={p}>{m.matrix[c][p]}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </Scroll>
            <p className="mt-3 text-sm">
              Insight agreement in the new authoring cycle:{" "}
              {percent(q?.revision.byClass.insight.rawAgreement)}. Interpret
              provider performance alongside independent ground-truth agreement.
            </p>
          </details>
          <details className={box}>
            <summary className="cursor-pointer font-medium">
              Confidence distribution and observed accuracy
            </summary>
            <Scroll label="Confidence bands">
              <table className={table}>
                <thead>
                  <tr>
                    <th>Confidence</th>
                    <th>Count</th>
                    <th>Observed accuracy</th>
                  </tr>
                </thead>
                <tbody>
                  {m.confidenceBands.map((b) => (
                    <tr key={b.lower}>
                      <th scope="row">
                        {percent(b.lower)}–{percent(b.upper)}
                      </th>
                      <td>{b.count}</td>
                      <td>{percent(b.accuracy)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Scroll>
            <p className="mt-3 text-xs">
              Synthetic descriptive bins, not a production calibration claim.
            </p>
          </details>
          <section className={box}>
            <h3 className="font-medium">
              Threshold simulator · Simulation only
            </h3>
            <p className="mt-2 text-sm">
              Synthetic projections only. No activation or runtime influence.
              Failures and missing confidence fall back.
            </p>
            <label className="mt-3 block text-sm" htmlFor="challenge-threshold">
              Confidence threshold: {threshold}%
            </label>
            <input
              id="challenge-threshold"
              className="w-full"
              type="range"
              min={50}
              max={100}
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
            />
            <dl className="mt-3 grid grid-cols-2 gap-4">
              <Metric
                label="Coverage"
                value={percent(
                  data.simulation.length
                    ? selected.length / data.simulation.length
                    : null,
                )}
              />
              <Metric
                label="Accuracy above threshold"
                value={percent(
                  selected.length
                    ? (selected.length - errors) / selected.length
                    : null,
                )}
              />
              <Metric label="Errors above threshold" value={errors} />
              <Metric
                label="Fallback"
                value={percent(
                  data.simulation.length
                    ? 1 - selected.length / data.simulation.length
                    : null,
                )}
              />
            </dl>
            <Scroll label="Threshold projections">
              <table className={table}>
                <thead>
                  <tr>
                    <th>Threshold</th>
                    <th>Coverage</th>
                    <th>Accuracy</th>
                    <th>Errors</th>
                    <th>Fallback</th>
                    <th>Errors / 1,000</th>
                    <th>Calls avoided</th>
                  </tr>
                </thead>
                <tbody>
                  {a.thresholds.map((r) => (
                    <tr key={r.threshold}>
                      <th scope="row">{percent(r.threshold)}</th>
                      <td>{percent(r.coverage)}</td>
                      <td>{percent(r.accuracy)}</td>
                      <td>{r.errors}</td>
                      <td>{percent(r.fallback)}</td>
                      <td>
                        {r.estimatedErrorsPer1000?.toFixed(1) ?? "Not measured"}
                      </td>
                      <td>{r.hypotheticalCallsAvoided}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Scroll>
          </section>
        </>
      )}
      {stress && (
        <section className={box}>
          <h3 className="font-medium">
            Taxonomy Stress · Choices without correctness
          </h3>
          <dl className="mt-3 grid grid-cols-2 gap-4">
            <Metric
              label="Reviewer agreement among completed cases"
              value={percent(stress.reviewerAgreement)}
            />
            <Metric label="Agrees with author only" value={stress.authorOnly} />
            <Metric
              label="Agrees with reviewer only"
              value={stress.reviewerOnly}
            />
            <Metric label="Agrees with neither" value={stress.neither} />
            <Metric label="Agrees with both" value={stress.both} />
          </dl>
          <Scroll label="Stress choice distribution">
            <table className={table}>
              <thead>
                <tr>
                  <th>Provider choice</th>
                  <th>Count</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(stress.choices).map(([label, count]) => (
                  <tr key={label}>
                    <th scope="row">{label}</th>
                    <td>{count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Scroll>
          <p className="mt-3 text-sm">
            A confident choice where reviewers disagree is an
            ambiguity/overconfidence signal. Neither reviewer is automatically
            correct.
          </p>
        </section>
      )}
      <section className={box}>
        <h3 className="font-medium">Inspect synthetic evidence</h3>
        <div className="mt-3 flex flex-wrap gap-3">
          <label className="text-xs">
            Show
            <select
              className={input}
              aria-label="Show decisions"
              value={params.get("filter") ?? ""}
              onChange={(e) => select("filter", e.target.value)}
            >
              <option value="">All cases</option>
              {stress ? (
                <option value="review-disagreement">
                  Reviewer disagreements
                </option>
              ) : (
                <>
                  <option value="correct">Correct</option>
                  <option value="incorrect">Incorrect</option>
                  <option value="high-confidence-errors">
                    High-confidence errors ≥95%
                  </option>
                </>
              )}
            </select>
          </label>
          {!stress && (
            <label className="text-xs">
              Expected class
              <select
                className={input}
                aria-label="Expected class"
                value={params.get("class") ?? ""}
                onChange={(e) => select("class", e.target.value)}
              >
                <option value="">All classes</option>
                {outcomes.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
          )}
          <label className="text-xs">
            Difficulty
            <select
              className={input}
              aria-label="Difficulty"
              value={params.get("difficulty") ?? ""}
              onChange={(e) => select("difficulty", e.target.value)}
            >
              <option value="">All difficulties</option>
              {["EASY", "MODERATE", "HARD", "ADVERSARIAL"].map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </label>
          <label className="text-xs">
            Boundary
            <select
              className={`${input} max-w-[240px]`}
              aria-label="Boundary"
              value={params.get("boundary") ?? ""}
              onChange={(e) => select("boundary", e.target.value)}
            >
              <option value="">All boundaries</option>
              {boundaries.map((b) => (
                <option key={b}>{b}</option>
              ))}
            </select>
          </label>
          <label className="text-xs">
            Confidence
            <select
              className={input}
              aria-label="Confidence"
              value={params.get("confidence") ?? ""}
              onChange={(e) => select("confidence", e.target.value)}
            >
              <option value="">All confidence</option>
              {[0.7, 0.8, 0.85, 0.9, 0.95, 0.97, 0.99].map((c) => (
                <option key={c} value={c}>
                  ≥{percent(c)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="mt-3 text-xs">
          {data.total} matching cases.{" "}
          {stress
            ? "No primary labels or model-error counts."
            : "Correctness uses frozen agreed labels."}
        </p>
        <ul className="mt-3 divide-y divide-kumo-hairline">
          {data.rows.map((row) => (
            <li key={row.id} className="py-3 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span>{row.id}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => select("decision", row.id)}
                >
                  Inspect
                </Button>
              </div>
              <p className="mt-1">
                {stress
                  ? "Taxonomy ambiguity"
                  : `Frozen label: ${row.expected}`}{" "}
                · Provider: {row.result?.outcome ?? row.failure} · Confidence:{" "}
                {percent(row.result?.confidence)}
              </p>
            </li>
          ))}
        </ul>
        {!data.rows.length && (
          <p className="py-4 text-sm">No cases match these filters.</p>
        )}
        <div className="mt-3 flex gap-2">
          <Button
            size="sm"
            disabled={page === 0}
            onClick={() => select("page", String(page - 1))}
          >
            Previous
          </Button>
          <Button
            size="sm"
            disabled={(page + 1) * 20 >= data.total}
            onClick={() => select("page", String(page + 1))}
          >
            Next
          </Button>
        </div>
      </section>
      {data.detail && (
        <section className={box} aria-labelledby="decision-detail">
          <h3 id="decision-detail" className="font-medium">
            Inspect decision · Synthetic evaluation example
          </h3>
          <p className="mt-3 text-sm">{data.detail.text}</p>
          <p className="mt-3 whitespace-pre-wrap text-sm text-kumo-subtle">
            Context: {data.detail.context || "None"}
          </p>
          <p className="mt-3 text-xs">
            Author: {data.detail.metadata?.label ?? "AMBIGUOUS"} (
            {data.detail.metadata?.confidence}) · Reviewer:{" "}
            {data.detail.metadata?.review?.label ?? "AMBIGUOUS"} (
            {data.detail.metadata?.review?.confidence})
          </p>
          <p className="mt-2 text-xs">
            {data.detail.metadata?.review?.rationale}
          </p>
          <p className="mt-2 text-xs">
            {data.detail.metadata?.reasons.join(" · ")}
          </p>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
            {outcomes.map((c) => (
              <div key={c}>
                <dt>{c}</dt>
                <dd>
                  {percent(data.detail!.evidence.result?.probabilities?.[c])}
                </dd>
              </div>
            ))}
          </dl>
          <Button
            className="mt-3"
            size="sm"
            onClick={() => select("decision", "")}
          >
            Close detail
          </Button>
        </section>
      )}
      <details className={box}>
        <summary className="cursor-pointer font-medium">
          Usage and frozen provenance
        </summary>
        <dl className="mt-3 grid grid-cols-2 gap-3 break-all text-xs">
          <dt>Contract</dt>
          <dd>
            {run.decisionVersion === 2
              ? "knowledge.classification:v2-challenge"
              : "knowledge.classification:v1"}
          </dd>
          <dt>Dataset</dt>
          <dd>{run.datasetVersion}</dd>
          <dt>Dataset hash</dt>
          <dd>{run.datasetHash}</dd>
          <dt>Contract hash</dt>
          <dd>{run.contractHash}</dd>
          <dt>Rubric hash</dt>
          <dd>{run.rubricHash ?? "V0 original"}</dd>
          <dt>Input tokens</dt>
          <dd>{m?.inputTokens ?? stress?.inputTokens ?? "Not reported"}</dd>
          <dt>Cost</dt>
          <dd>{m?.costUsd ?? stress?.costUsd ?? "Not reported"}</dd>
          <dt>Latency p50</dt>
          <dd>
            {run.environment === "local-fixture"
              ? "Fixture only"
              : `${m?.latencyP50 ?? stress?.latencyP50 ?? "Not measured"} ms`}
          </dd>
          <dt>Latency p95</dt>
          <dd>
            {run.environment === "local-fixture"
              ? "Fixture only"
              : `${m?.latencyP95 ?? "Not measured"} ms`}
          </dd>
          <dt>Run ID</dt>
          <dd>{run.id}</dd>
        </dl>
      </details>
    </>
  );
}
