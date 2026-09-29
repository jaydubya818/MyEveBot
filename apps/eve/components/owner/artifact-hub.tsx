"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { ArtifactDescriptor } from "@/agent/lib/effect/artifacts";
import { ProductShell, ResourceState } from "./product-shell";
import { useProductResource } from "./resource";
import { Card, Empty, date } from "./primitives";
export function ArtifactHub() {
  const [query, setQuery] = useState("");
  const [settled, setSettled] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setSettled(query), 250);
    return () => clearTimeout(timer);
  }, [query]);
  const source = useProductResource<{ artifacts: ArtifactDescriptor[] }>(
    `/api/artifacts?q=${encodeURIComponent(settled)}`,
  );
  return (
    <ProductShell
      title="Files & artifacts"
      description="A private workspace for generated documents, versions, comments and their source conversations."
    >
      <div className="owner-actions">
        <Link className="owner-button" href="/files">
          Conversation uploads
        </Link>
        <Link href="/chat">Create with Sofie</Link>
        <Link href="/results">Results & proof</Link>
      </div>
      <label htmlFor="artifact-query">Search artifacts</label>
      <input
        id="artifact-query"
        type="search"
        value={query}
        maxLength={120}
        onChange={(e) => setQuery(e.target.value)}
      />
      <ResourceState {...source} />
      {query !== settled ? (
        <p role="status">Searching…</p>
      ) : (
        <div className="owner-grid">
          {source.data?.artifacts.map((item) => (
            <Card key={item.id} title={item.title}>
              <p>
                {item.kind} · {item.currentVersion.filename}
              </p>
              <p className="owner-muted">
                Updated {date(item.updatedAt)} · Created by {item.createdBy}
              </p>
              <div className="owner-actions">
                <Link href={`/workspace/${encodeURIComponent(item.id)}`}>
                  Open preview, versions & comments
                </Link>
                {item.originThreadId && (
                  <Link
                    href={`/chat?thread=${encodeURIComponent(item.originThreadId)}`}
                  >
                    Source conversation
                  </Link>
                )}
              </div>
              <details>
                <summary>Provenance & sharing</summary>
                <p>Current immutable revision: {item.currentVersionId}</p>
                <p>
                  Work and Result linkage is not supplied by this artifact
                  source. A source conversation alone is not verification.
                </p>
                <p>
                  Sharing is an explicit action in the artifact workspace.
                  Review revision and expiration; revoke the link when access is
                  no longer needed.
                </p>
              </details>
            </Card>
          ))}
        </div>
      )}
      {!source.loading &&
        !source.error &&
        query === settled &&
        !source.data?.artifacts.length && (
          <Empty title="No matching artifacts">
            Documents created with Sofie appear here. Conversation uploads
            remain available separately.
          </Empty>
        )}
    </ProductShell>
  );
}
