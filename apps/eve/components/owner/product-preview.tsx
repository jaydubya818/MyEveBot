"use client";
import { useState } from "react";
import { ProductShell } from "./product-shell";
import { Card } from "./primitives";
import { DecisionCard } from "./decisions";
import {
  productApprovalFixtures,
  channelFixtures,
  engineeringFixture,
} from "./product-fixtures";
import {
  displayCanonicalAttention,
  displayCanonicalWork,
} from "./canonical-boundaries";
export function ProductPreview() {
  const [approvals, setApprovals] = useState(productApprovalFixtures);
  const [notice, setNotice] = useState("");
  const attention = displayCanonicalAttention(
    "fixture-owner-a",
    channelFixtures,
  );
  const engineering = displayCanonicalWork(engineeringFixture);
  return (
    <ProductShell
      title="Product contract preview"
      description="Sample data only. Decisions on this page remain in memory and never contact a service."
    >
      <aside className="owner-notice">
        <strong>Fixture evidence — no live execution</strong>
        <p>
          This preview tests presentation and contract boundaries. It does not
          qualify provider calls, publication, or shared access.
        </p>
      </aside>
      <p role="status">{notice}</p>
      <h2>Three consequential proposals</h2>
      <div className="owner-stack">
        {approvals.map((item) => (
          <DecisionCard
            key={item.id}
            item={item}
            preview
            onDecision={(updated) => {
              setApprovals((rows) =>
                rows.map((row) => (row.id === updated.id ? updated : row)),
              );
              setNotice(
                "Sample decision recorded locally. No action executed.",
              );
            }}
          />
        ))}
      </div>
      <Card title="Inbox / Needs You separation">
        {attention.map((item) => (
          <p key={item.id}>
            {item.title} · {item.source} ·{" "}
            {item.needsYou ? "Needs You" : "Inbox"} · Context:{" "}
            {item.correlationId}
          </p>
        ))}
      </Card>
      <Card title="Software Engineer">
        <p>{engineering.activity}</p>
        <p>Candidate: {engineering.candidate}</p>
        <p>Result: {engineering.result?.summary ?? "Not yet recorded"}</p>
        <p>Ready: {String(engineering.ready)}</p>
        <code>{engineering.boundary}</code>
      </Card>
    </ProductShell>
  );
}
