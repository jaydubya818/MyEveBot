"use client";
import { useRef, useState } from "react";
import type { OutcomeView, OwnerFeedback } from "@/lib/outcome-types";
import type { TaskRunView } from "@/lib/task-types";
import { verificationSummary } from "@/components/owner/projection";
import { ownerRequest } from "./data";
import { Card, date, State } from "./primitives";

export function Proof({
  task,
  result,
  preview = false,
}: {
  task?: TaskRunView | null;
  result?: OutcomeView;
  preview?: boolean;
}) {
  return (
    <Card title="Proof of Work">
      <p>{verificationSummary(task)}</p>
      <div className="owner-proof">
        <div>
          <h3>What changed</h3>
          <p className="owner-muted">
            {result?.summary ??
              task?.resultSummary ??
              "No result has been recorded yet."}
          </p>
        </div>
        <div>
          <h3>Source & limitations</h3>
          <p className="owner-muted">
            {preview
              ? "Sample data for design review. No real work was executed."
              : result?.agentName
                ? `Recorded by ${result.agentName}.`
                : "The producer is not identified in the available record."}{" "}
            Completion and owner acceptance do not establish independent
            verification.
          </p>
        </div>
      </div>
      {task && task.checks.length > 0 && (
        <ul className="owner-list" style={{ marginTop: 20 }}>
          {task.checks.map((check) => (
            <li key={check.id}>
              <div className="owner-row">
                <strong>{check.label}</strong>
                <State value={check.status} />
              </div>
              <p className="owner-muted">
                {check.resultSummary ?? "No check explanation recorded."}
                {check.checkedAt && ` · ${date(check.checkedAt)}`}
              </p>
            </li>
          ))}
        </ul>
      )}
      {task && task.artifacts.length > 0 && (
        <>
          <h3 style={{ marginTop: 24 }}>Artifacts</h3>
          <ul className="owner-list">
            {task.artifacts.map((artifact) => (
              <li key={artifact.id}>
                {preview ? (
                  <span>{artifact.filename} (sample)</span>
                ) : (
                  <a
                    href={`/api/task-runs/${encodeURIComponent(task.id)}/artifacts/${encodeURIComponent(artifact.id)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {artifact.filename} ↗
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>
                )}
                <p className="owner-muted">
                  {artifact.kind} · {artifact.sizeBytes.toLocaleString()} bytes
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
      <details>
        <summary>Technical evidence & provenance</summary>
        {!result?.evidence.length && !task?.artifacts.length && (
          <p className="owner-muted">No evidence references are available.</p>
        )}
        <ul>
          {result?.evidence.map((ref) => (
            <li key={`${ref.type}:${ref.id}`}>
              {ref.type === "event" ? "Event reference" : "Artifact reference"}:{" "}
              <code>{ref.id}</code>
            </li>
          ))}
        </ul>
        {task?.artifacts.map((artifact) => (
          <p key={artifact.id}>
            <code>SHA-256 {artifact.sha256}</code>
          </p>
        ))}
        <p className="owner-muted">
          {result?.runId ? `Run reference: ${result.runId}. ` : ""}Event
          references are retained for traceability; this contract does not
          provide an event-content reader.
        </p>
      </details>
    </Card>
  );
}
export function ResultCard({
  result,
  preview,
  onSaved,
  onCorrect,
  href,
}: {
  result: OutcomeView;
  preview: boolean;
  onSaved: (result: OutcomeView) => void;
  onCorrect: () => void;
  href: string;
}) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState<string | null>(null),
    [error, setError] = useState<string | null>(null);
  const lock = useRef(false);
  async function feedback(ownerFeedback: OwnerFeedback) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const saved = preview
        ? { ...result, ownerFeedback }
        : (
            await ownerRequest<{ outcome: OutcomeView }>(
              `/api/outcomes/${encodeURIComponent(result.id)}`,
              {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ownerFeedback }),
              },
            )
          ).outcome;
      onSaved(saved);
      setMessage(
        preview
          ? "Sample feedback saved in this browser tab."
          : "Feedback saved to this result.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Feedback was not saved. Please retry.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const labels: Record<string, string> = {
    successful: "Complete",
    partially_successful: "Partly complete",
    blocked: "Blocked",
    failed: "Recovery",
    abandoned: "Stopped",
    ineffective: "Needs improvement",
    unknown: "Outcome unknown",
  };
  return (
    <article className="owner-card">
      <div className="owner-row">
        <span className="owner-eyebrow">
          Result · {date(result.occurredAt)}
        </span>
        <State value={labels[result.status] ?? "Unknown"} />
      </div>
      <h2 style={{ marginTop: 16 }}>
        <a href={href}>{result.summary}</a>
      </h2>
      <ul>
        {result.rationale.map((item, i) => (
          <li key={i} className="owner-muted">
            {item}
          </li>
        ))}
      </ul>
      <p className="owner-muted">
        {result.agentName ?? "Producer not recorded"} · {result.evidence.length}{" "}
        evidence reference{result.evidence.length === 1 ? "" : "s"} ·
        Verification details in Proof of Work
      </p>
      <div className="owner-actions">
        <button
          aria-pressed={result.ownerFeedback === "helpful"}
          disabled={busy}
          onClick={() => void feedback("helpful")}
        >
          Useful
        </button>
        <button
          aria-pressed={result.ownerFeedback === "unhelpful"}
          disabled={busy}
          onClick={() => void feedback("unhelpful")}
        >
          Needs improvement
        </button>
        <button disabled={busy} onClick={onCorrect}>
          Correct this
        </button>
        <a className="owner-button" href={href}>
          Proof of Work →
        </a>
      </div>
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
    </article>
  );
}
