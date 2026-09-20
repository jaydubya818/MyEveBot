"use client";

import { Badge, Button, Loader } from "@cloudflare/kumo";
import { useEffect, useState } from "react";
import {
  knowledgeContract,
  OUTCOMES,
} from "@/lib/decision-intelligence/contract";
import type { DecisionView } from "@/lib/decision-intelligence/view";

const percent = (value: number | null | undefined) =>
  value == null ? "Not measured" : `${(value * 100).toFixed(1)}%`;
const latency = (value: number | null | undefined) =>
  value == null ? "Not measured" : `${Math.round(value)} ms`;
const title = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
const box = "rounded-xl border border-kumo-hairline p-4";
const table =
  "w-full text-left text-xs [&_th]:p-2 [&_th]:font-medium [&_td]:p-2 [&_tr]:border-b [&_tr]:border-kumo-hairline";

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <dt className="text-xs text-kumo-subtle">{label}</dt>
      <dd className="mt-1 text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

export function DecisionIntelligencePanel() {
  const [data, setData] = useState<DecisionView | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [query, setQuery] = useState(() =>
    typeof window === "undefined" ? "" : window.location.search,
  );
  const [threshold, setThreshold] = useState(95);
  useEffect(() => {
    const onPop = () => setQuery(window.location.search);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setFailed(false);
    void fetch(`/api/decision-intelligence${query}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Unavailable");
        return response.json() as Promise<DecisionView>;
      })
      .then((body) => {
        setData(body);
        setLoading(false);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setFailed(true);
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [query, revision]);
  function select(key: string, value: string) {
    const params = new URLSearchParams(query);
    if (value) params.set(key, value);
    else params.delete(key);
    if (key !== "page") params.delete("page");
    const next = params.size ? `?${params}` : "";
    window.history.pushState({}, "", `/manage/decision-intelligence${next}`);
    setQuery(next);
  }
  if (failed)
    return (
      <div role="alert" className={box}>
        <p>Decision Intelligence data couldn’t be loaded.</p>
        <p className="mt-1 text-sm text-kumo-subtle">
          Your Agent’s normal behavior is unaffected.
        </p>
        <Button className="mt-3" onClick={() => setRevision((v) => v + 1)}>
          Retry
        </Button>
      </div>
    );
  if (!data)
    return (
      <div role="status" className={`${box} flex items-center gap-2`}>
        <Loader /> Loading Decision Intelligence…
      </div>
    );
  const m = data.metrics;
  const fixture = data.run?.environment === "local-fixture";
  const params = new URLSearchParams(query);
  const covered = data.simulation.filter(
    (row) => row.confidence !== null && row.confidence >= threshold / 100,
  );
  const errors = covered.filter((row) => !row.correct).length;
  const page = Number(params.get("page")) || 0;
  return (
    <div
      id="decision-intelligence-content"
      className="min-w-0 space-y-5"
      aria-busy={loading}
    >
      <section className={box} aria-labelledby="decision-purpose">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="decision-purpose" className="text-base font-semibold">
            Decision Intelligence
          </h2>
          <Badge variant="secondary">Experimental · SHADOW</Badge>
        </div>
        <p className="mt-2 text-sm">
          Fast, bounded decision models, evaluated alongside MyEve. Observing
          only. Your Agent’s behavior is unchanged.
        </p>
        <dl className="mt-5 grid grid-cols-2 gap-5">
          <Metric label="Decision provider" value={data.provider.name} />
          <Metric label="Provider status" value={data.provider.status} />
          <Metric label="Gateway" value={data.provider.gateway} />
          <Metric label="Behavioral influence" value="None" />
        </dl>
        {data.provider.status === "Not configured" && (
          <p className="mt-4 text-sm text-kumo-subtle">
            Jev is not available in this deployment. Decision Intelligence is
            optional; your Agent continues to work normally.
          </p>
        )}
      </section>
      <section className={box}>
        <h3 className="font-medium">Knowledge Classification V0</h3>
        <p className="mt-1 text-sm text-kumo-subtle">
          6 of 7 Knowledge types evaluated. Insight remains handled exclusively
          by MyEve’s canonical Knowledge system and is outside this experiment.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {OUTCOMES.map((outcome) => (
            <Badge key={outcome} variant="secondary">
              {title(outcome)}
            </Badge>
          ))}
        </div>
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer font-medium">
            How this works and taxonomy
          </summary>
          <p className="mt-2">
            Expected is the authored synthetic label. Canonical is the type
            selected by the existing MyEve path. The decision provider’s
            prediction is independent. Agreement is not accuracy.
          </p>
          <dl className="mt-3 space-y-2">
            {OUTCOMES.map((outcome) => (
              <div key={outcome}>
                <dt className="font-medium">{title(outcome)}</dt>
                <dd className="text-kumo-subtle">
                  {knowledgeContract.definitions[outcome]}
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-3">
            Canonical classification is supplied by the owner or Agent when
            writing Knowledge; it cannot be independently benchmarked here.
            Canonical metrics remain unmeasured.
          </p>
        </details>
      </section>
      {!data.run && (
        <section className={box}>
          <h3 className="font-medium">No Decision Intelligence evidence yet</h3>
          <p className="mt-2 text-sm text-kumo-subtle">
            The experiment is not enabled by default. Synthetic benchmarks run
            through an explicitly invoked developer command. Live shadow
            evaluation is off.
          </p>
        </section>
      )}
      {data.run && m && (
        <>
          <section className={box}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-medium">Synthetic benchmark</h3>
              <Badge variant="secondary">
                {fixture
                  ? "LOCAL FIXTURE — NOT JEV PERFORMANCE"
                  : "Live experiment"}
              </Badge>
            </div>
            <label className="mt-3 block text-xs">
              Evaluation run
              <select
                aria-label="Evaluation run"
                className="mt-1 block w-full rounded-md border border-kumo-hairline bg-kumo-base p-2"
                value={data.run.id}
                onChange={(event) => select("run", event.target.value)}
              >
                {data.runs.map((run) => (
                  <option key={run.id} value={run.id}>
                    {new Date(run.createdAt).toLocaleString()} ·{" "}
                    {run.environment} · {run.count} examples
                  </option>
                ))}
              </select>
            </label>
            <p className="mt-3 text-xs text-kumo-subtle">
              Last evaluated {new Date(data.run.createdAt).toLocaleString()}.{" "}
              {fixture
                ? "Deterministic fake outputs qualify the infrastructure; accuracy and latency do not measure Jev."
                : "Synthetic performance may not represent real owner Knowledge."}
            </p>
            <dl className="mt-5 grid grid-cols-2 gap-5 sm:grid-cols-3">
              <Metric label="Evaluations attempted" value={m.attempted} />
              <Metric label="Provider accuracy" value={percent(m.accuracy)} />
              <Metric
                label="Canonical accuracy"
                value={percent(m.canonicalAccuracy)}
              />
              <Metric
                label="Agreement with canonical"
                value={percent(m.agreement)}
              />
              <Metric
                label="Latency p50"
                value={fixture ? "Fixture only" : latency(m.latencyP50)}
              />
              <Metric
                label="Latency p95"
                value={fixture ? "Fixture only" : latency(m.latencyP95)}
              />
              <Metric
                label="Experiment cost"
                value={
                  m.costUsd === null
                    ? "Not reported"
                    : `$${m.costUsd.toFixed(6)}`
                }
              />
              <Metric
                label="Input tokens"
                value={m.inputTokens ?? "Not reported"}
              />
              <Metric label="Completion" value={percent(m.completion)} />
            </dl>
            <p className="mt-4 text-xs text-kumo-subtle">
              Accuracy: correct / {m.labeledCount} valid labeled decisions.
              Successful: {m.succeeded} · Failed: {m.failed} · Timed out:{" "}
              {m.failures.TIMEOUT ?? 0} · Rate limited:{" "}
              {m.failures.RATE_LIMITED ?? 0}.
            </p>
          </section>
          <section className={box}>
            <h3 className="font-medium">Confidence and calibration</h3>
            <p className="mt-2 text-sm text-kumo-subtle">
              Jev confidence is the reported probability of the selected class.
              Missing probabilities remain unavailable. Compare this signal with
              correctness before considering any future use.{" "}
              {m.calibrationCount} labeled predictions have confidence data.
            </p>
            <div className="mt-3 overflow-x-auto">
              <table className={table}>
                <caption className="sr-only">
                  Confidence distribution and accuracy
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Confidence</th>
                    <th scope="col">Count</th>
                    <th scope="col">Labeled</th>
                    <th scope="col">Accuracy</th>
                  </tr>
                </thead>
                <tbody>
                  {m.confidenceBands.map((band) => (
                    <tr key={band.lower}>
                      <th scope="row">
                        {Math.round(band.lower * 100)}–
                        {band.upper < 1 ? "<" : ""}
                        {Math.round(band.upper * 100)}%
                      </th>
                      <td>{band.count}</td>
                      <td>{band.labeledCount}</td>
                      <td>{percent(band.accuracy)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <details className={box}>
            <summary className="cursor-pointer font-medium">
              Class performance and confusion matrix
            </summary>
            <div className="mt-3 overflow-x-auto">
              <table className={table}>
                <caption className="sr-only">Class performance</caption>
                <thead>
                  <tr>
                    <th scope="col">Class</th>
                    <th scope="col">Examples</th>
                    <th scope="col">Precision</th>
                    <th scope="col">Recall</th>
                    <th scope="col">F1</th>
                  </tr>
                </thead>
                <tbody>
                  {m.perClass.map((row) => (
                    <tr key={row.outcome}>
                      <th scope="row">{title(row.outcome)}</th>
                      <td>{row.examples}</td>
                      <td>{percent(row.precision)}</td>
                      <td>{percent(row.recall)}</td>
                      <td>{percent(row.f1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div
              className="mt-5 max-w-full overflow-x-auto"
              tabIndex={0}
              role="region"
              aria-label="Scrollable confusion matrix"
            >
              <table className={`${table} min-w-[600px]`}>
                <caption className="mb-2 text-left text-kumo-subtle">
                  Rows: expected · Columns: provider prediction
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Expected</th>
                    {OUTCOMES.map((outcome) => (
                      <th key={outcome} scope="col">
                        {title(outcome)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {OUTCOMES.map((outcome) => (
                    <tr key={outcome}>
                      <th scope="row">{title(outcome)}</th>
                      {OUTCOMES.map((predicted) => (
                        <td key={predicted}>{m.matrix[outcome][predicted]}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
          <section className={box}>
            <h3 className="font-medium">
              Threshold simulator · Simulation only
            </h3>
            <p className="mt-2 text-sm text-kumo-subtle">
              This control only explores the evidence. It cannot change runtime
              behavior. Missing or failed predictions fall back.
            </p>
            <label className="mt-4 block text-sm" htmlFor="decision-threshold">
              Confidence threshold: {threshold}%
            </label>
            <input
              id="decision-threshold"
              className="mt-2 w-full"
              type="range"
              min={50}
              max={100}
              step={1}
              value={threshold}
              onChange={(event) => setThreshold(Number(event.target.value))}
            />
            <dl className="mt-3 grid grid-cols-2 gap-4">
              <Metric
                label="Coverage"
                value={percent(
                  data.simulation.length
                    ? covered.length / data.simulation.length
                    : null,
                )}
              />
              <Metric
                label="Accuracy above threshold"
                value={percent(
                  covered.length
                    ? (covered.length - errors) / covered.length
                    : null,
                )}
              />
              <Metric
                label="Fallback"
                value={percent(
                  data.simulation.length
                    ? 1 - covered.length / data.simulation.length
                    : null,
                )}
              />
              <Metric label="Errors above threshold" value={errors} />
            </dl>
          </section>
          <section className={box}>
            <h3 className="font-medium">Recent decisions and disagreements</h3>
            <div className="mt-3 flex flex-wrap gap-3">
              <label className="text-xs">
                Show
                <select
                  aria-label="Show decisions"
                  className="mt-1 block rounded-md border border-kumo-hairline bg-kumo-base p-2"
                  value={params.get("filter") ?? ""}
                  onChange={(event) => select("filter", event.target.value)}
                >
                  <option value="">All decisions</option>
                  <option value="disagreement">Disagreements</option>
                  <option value="high-confidence-errors">
                    High-confidence errors ≥95%
                  </option>
                </select>
              </label>
              <label className="text-xs">
                Expected class
                <select
                  aria-label="Expected class"
                  className="mt-1 block rounded-md border border-kumo-hairline bg-kumo-base p-2"
                  value={params.get("class") ?? ""}
                  onChange={(event) => select("class", event.target.value)}
                >
                  <option value="">All classes</option>
                  {OUTCOMES.map((outcome) => (
                    <option key={outcome} value={outcome}>
                      {title(outcome)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="mt-3 text-xs text-kumo-subtle">
              {data.total} matching decisions. Expected labels determine
              benchmark correctness; disagreement alone does not identify a
              winner.
            </p>
            <ul className="mt-3 divide-y divide-kumo-hairline">
              {data.rows.map((row) => (
                <li key={row.id} className="py-3 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="break-all font-medium">{row.id}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => select("decision", row.id)}
                    >
                      Inspect
                    </Button>
                  </div>
                  <p className="mt-1">
                    Expected: {row.expected ?? "None"} · Canonical:{" "}
                    {row.canonical ?? "Not measured"}
                  </p>
                  <p className="mt-1">
                    Provider: {row.result?.outcome ?? row.failure} · Confidence:{" "}
                    {percent(row.result?.confidence)}
                  </p>
                </li>
              ))}
            </ul>
            {data.rows.length === 0 && (
              <p className="py-4 text-sm text-kumo-subtle">
                No decisions match these filters.
              </p>
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
              <p className="mt-3 text-xs">
                Expected: {data.detail.evidence.expected} · Canonical:{" "}
                {data.detail.evidence.canonical ?? "Not measured"} · Provider:{" "}
                {data.detail.evidence.result?.outcome ??
                  data.detail.evidence.failure}
              </p>
              <dl className="mt-3 space-y-2 text-xs">
                {OUTCOMES.map((outcome) => (
                  <div key={outcome} className="flex justify-between">
                    <dt>{title(outcome)}</dt>
                    <dd>
                      {percent(
                        data.detail!.evidence.result?.probabilities?.[outcome],
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="mt-3 text-xs text-kumo-subtle">
                {data.detail.evidence.result?.provider} ·{" "}
                {data.detail.evidence.result?.model} ·{" "}
                {latency(data.detail.evidence.result?.latencyMs)} ·{" "}
                {data.detail.evidence.result?.evaluatedAt}. SHADOW · Influence:
                None.
              </p>
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
            <summary className="cursor-pointer text-sm font-medium">
              Advanced provenance
            </summary>
            <dl className="mt-3 space-y-2 break-all text-xs">
              <Metric label="Contract" value="knowledge.classification:v1" />
              <Metric label="Dataset" value={data.run.datasetVersion} />
              <dt>Dataset hash</dt>
              <dd>{data.run.datasetHash}</dd>
              <dt>Contract hash</dt>
              <dd>{data.run.contractHash}</dd>
              <dt>Run ID</dt>
              <dd>{data.run.id}</dd>
              <dt>Provider route</dt>
              <dd>{data.provider.model}</dd>
            </dl>
          </details>
        </>
      )}
      <section className={box}>
        <h3 className="font-medium">Authority · Advisory only</h3>
        <p className="mt-2 text-sm">
          Decision Intelligence cannot grant Agent capabilities, approve
          Actions, bypass Action Gateway, control Computer sessions, change
          Routine authority, or access secrets.
        </p>
        <p className="mt-2 text-sm text-kumo-subtle">
          Behavioral promotion is not enabled. Any future use requires a
          separate reviewed product change. Probabilistic intelligence proposes.
          Deterministic policy governs.
        </p>
      </section>
      <section className={box}>
        <h3 className="font-medium">Privacy and live shadow</h3>
        <p className="mt-2 text-sm">
          Live shadow evaluation: Off. No live shadow observations yet. V0 sends
          only synthetic benchmark candidate text and classification definitions
          when a developer explicitly authorizes a live benchmark.
        </p>
        <p className="mt-2 text-sm text-kumo-subtle">
          No owner Knowledge, conversations, Goals, Memory, credentials, files,
          or connected-app content is transmitted by this experiment.
        </p>
      </section>
    </div>
  );
}
