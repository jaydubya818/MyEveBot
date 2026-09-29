"use client";
import { useState } from "react";
import type { ApprovalRequestView } from "@/lib/approvals";
import { DecisionCard } from "./decisions";
import { pendingApprovals } from "./projection";
import { ProductShell, ResourceState } from "./product-shell";
import { useProductResource } from "./resource";
export function ApprovalCenter() {
  const [filter, setFilter] = useState("Pending");
  const source = useProductResource<{ approvals: ApprovalRequestView[] }>(
    filter === "Pending" ? "/api/approvals?status=pending" : "/api/approvals",
  );
  const [notice, setNotice] = useState("");
  const rows = source.data?.approvals ?? [];
  const pending = new Set(pendingApprovals(rows).map((item) => item.id));
  const visible = rows.filter(
    (item) =>
      filter === "All" ||
      (filter === "Pending" ? pending.has(item.id) : !pending.has(item.id)),
  );
  return (
    <ProductShell
      title="Approval Center"
      description="Review what will leave your workspace, why it is needed, and the exact scope before deciding."
    >
      <div className="owner-actions" aria-label="Filter approvals">
        {["Pending", "History", "All"].map((value) => (
          <button
            key={value}
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
          >
            {value}
          </button>
        ))}
      </div>
      <p className="owner-muted">
        Approval records permission. Execution and verification have their own
        status. Broader access is never granted here.
      </p>
      <p className="owner-muted">
        Showing up to 100{" "}
        {filter === "Pending" ? "pending requests" : "recent records"}. History
        is bounded, not a complete audit export.
      </p>
      <ResourceState {...source} />
      <p role="status">{notice}</p>
      <div className="owner-stack">
        {visible.map((item) => (
          <DecisionCard
            key={item.id}
            item={item}
            preview={false}
            onDecision={(updated) => {
              setNotice(
                `Decision saved: ${updated.decision === "approved" ? "allowed" : "declined"}. Execution is not confirmed.`,
              );
              source.refresh();
            }}
          />
        ))}
      </div>
      {!source.loading && !source.error && visible.length === 0 && (
        <div className="owner-empty">
          <h2>
            No{" "}
            {filter === "Pending" ? "pending approvals" : "matching decisions"}
          </h2>
          <p>New requests appear here when an action needs your authority.</p>
        </div>
      )}
    </ProductShell>
  );
}
