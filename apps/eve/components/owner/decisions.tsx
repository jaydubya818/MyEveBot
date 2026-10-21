"use client";
import { useRef, useState } from "react";
import type { ApprovalRequestView } from "@/lib/approvals";
import { pendingApprovals } from "@/components/owner/projection";
import { ownerRequest } from "./data";
import { date, State } from "./primitives";

export function DecisionCard({
  item,
  preview,
  onDecision,
}: {
  item: ApprovalRequestView;
  preview: boolean;
  onDecision: (item: ApprovalRequestView) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lock = useRef(false);
  const eligible = pendingApprovals([item]).length > 0;
  async function decide(decision: "approved" | "denied") {
    if (lock.current || !eligible) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    let saved = false;
    try {
      const result = preview
        ? {
            approval: {
              ...item,
              status: decision,
              decision,
              decidedAt: new Date().toISOString(),
            },
          }
        : await ownerRequest<{ approval: ApprovalRequestView }>(
            `/api/approvals/${encodeURIComponent(item.id)}`,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ decision, bindingHash: item.bindingHash }),
            },
          );
      saved = true;
      onDecision(result.approval);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The decision was not confirmed. Refresh before trying again.",
      );
    } finally {
      if (!saved) {
        lock.current = false;
        setBusy(false);
      }
    }
  }
  return (
    <article className="owner-card">
      <div className="owner-row">
        <h3>{item.action}</h3>
        <State
          value={
            eligible
              ? "Needs you"
              : item.status === "pending"
                ? "Expired"
                : item.status
          }
        />
      </div>
      <p>{item.prompt}</p>
      <p className="owner-muted">
        Requested by {item.requestedBy} · {item.risk} impact · Expires{" "}
        {date(item.expiresAt)}
      </p>
      <p>
        <strong>Scope:</strong>{" "}
        {item.resource ??
          "No resource was supplied. Inspect the details before deciding."}
      </p>
      {item.effects.length > 0 && (
        <ul>
          {item.effects.map((effect, i) => (
            <li key={i}>{effect}</li>
          ))}
        </ul>
      )}
      {item.estimatedCostUsd !== null && (
        <p className="owner-muted">
          Estimated cost: ${item.estimatedCostUsd.toFixed(2)}
        </p>
      )}
      <p className="owner-muted">
        Allowing authorizes only this exact action, subject to the service’s
        current checks. Declining withholds permission. Neither choice confirms
        execution.
      </p>
      <p>
        <strong>Capability:</strong> {item.capabilityId ?? "Not supplied"} ·{" "}
        <a href={`/work?id=${encodeURIComponent(item.goalId ?? item.taskId)}`}>
          Open related work
        </a>
      </p>
      <details>
        <summary>Action details</summary>
        <pre>{JSON.stringify(item.parameters, null, 2)}</pre>
        <p className="owner-muted">
          {item.provider ?? "Provider not recorded"} · {item.actionClass}
        </p>
      </details>
      {eligible && (
        <details>
          <summary>Modify this proposal</summary>
          <p>
            The exact proposal is bound to this approval. Decline it and ask
            Sofie for a revised proposal; changing the request requires a fresh
            approval.
          </p>
          {!preview && (
            <a
              href={`/chat?prompt=${encodeURIComponent(`Please revise the pending proposal: ${item.action}. Do not execute the original action. Ask me what should change.`)}`}
            >
              Draft a revision request
            </a>
          )}
        </details>
      )}
      {error && (
        <p role="alert" className="owner-notice">
          {error}
        </p>
      )}
      {eligible && (
        <div className="owner-actions">
          <button disabled={busy} onClick={() => void decide("denied")}>
            {preview ? "Try declining" : "Decline"}
          </button>
          <button disabled={busy} onClick={() => void decide("approved")}>
            {busy
              ? "Saving decision…"
              : preview
                ? "Try allowing this action"
                : "Allow this action"}
          </button>
        </div>
      )}
    </article>
  );
}
