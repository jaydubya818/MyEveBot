"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { GoalSummaryView } from "@/lib/goal-types";
import type { OutcomeView } from "@/lib/outcome-types";
import type {
  OwnerKnowledgePage,
  OwnerKnowledgeView,
} from "@/lib/owner-knowledge-types";
import { ProductShell, ResourceState } from "./product-shell";
import { useProductResource } from "./resource";
import { Card, State, date } from "./primitives";
import { useVisibleDestinations, useExternalLinksAllowed } from "./destination-gate";
import {
  searchArtifacts,
  searchAgents,
  searchGoals,
  searchResults,
  searchKnowledge,
  type ProductSearchHit,
} from "./search-model";

export function ProductSearch() {
  const productDestinations = useVisibleDestinations();
  const fullProduct = useExternalLinksAllowed();
  const [query, setQuery] = useState("");
  const [settled, setSettled] = useState("");
  useEffect(() => { setQuery(new URLSearchParams(window.location.search).get("q")?.slice(0,120) ?? ""); }, []);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);
  const enabled = settled.length >= 2 && settled === query.trim();
  const goals = useProductResource<{ goals: GoalSummaryView[] }>(
    enabled && fullProduct ? "/api/goals?limit=100" : null,
  );
  const results = useProductResource<{ outcomes: OutcomeView[] }>(
    enabled && fullProduct ? "/api/outcomes?limit=100" : null,
  );
  const knowledge = useProductResource<OwnerKnowledgePage>(
    enabled && fullProduct
      ? `/api/owner-knowledge?q=${encodeURIComponent(settled)}&limit=25`
      : null,
  );
  const artifacts = useProductResource<{
    artifacts: import("@/agent/lib/effect/artifacts").ArtifactDescriptor[];
  }>(enabled ? `/api/artifacts?q=${encodeURIComponent(settled)}` : null);
  const agents = useProductResource<{
    agents: import("@/lib/agents").AgentView[];
  }>(enabled && fullProduct ? "/api/agents" : null);
  const conversations = useProductResource<{
    results: { id: string; title: string; snippet: string | null }[];
  }>(enabled ? `/api/threads/search?q=${encodeURIComponent(settled)}` : null);
  const work = useProductResource<import("@/lib/product/work-inbox").WorkInboxView>(enabled ? `/api/work-inbox?q=${encodeURIComponent(settled)}` : null);
  const files = useProductResource<{ files: import("@/lib/files-api").ChatFileView[] }>(enabled ? "/api/files" : null);
  const groups = [
    { label: "Work", source: work, hits: (work.data?.works ?? []).map(item => ({
      id: item.id, title: item.title, detail: item.display.summary,
      href: `/work?kind=work&id=${encodeURIComponent(item.id)}`, source: "Your Work", status: item.display.status,
    })) },
    { label: "Uploaded files", source: files, hits: (files.data?.files ?? []).filter(item => `${item.filename} ${item.threadTitle ?? ""}`.toLowerCase().includes(settled.toLowerCase())).map(item => ({
      id: item.id, title: item.filename, detail: item.threadTitle ?? "Uploaded in a conversation",
      href: item.contentUrl, source: "Your Files", status: "Uploaded",
    })) },
    {
      label: "Goals & work",
      source: goals,
      hits: searchGoals(goals.data?.goals ?? [], query),
    },
    {
      label: "Results",
      source: results,
      hits: searchResults(results.data?.outcomes ?? [], query),
    },
    {
      label: "Memory & knowledge",
      source: knowledge,
      hits: searchKnowledge(knowledge.data?.items ?? []),
    },
    {
      label: "Documents",
      source: artifacts,
      hits: searchArtifacts(artifacts.data?.artifacts ?? [], query),
    },
    {
      label: "Specialists",
      source: agents,
      hits: searchAgents(agents.data?.agents ?? [], query),
    },
    {
      label: "Conversations",
      source: conversations,
      hits: (conversations.data?.results ?? []).map((item) => ({
        id: item.id,
        title: item.title,
        detail: item.snippet ?? "",
        href: `/chat?thread=${encodeURIComponent(item.id)}`,
        source: "Owner conversation search",
        status: "Recorded conversation",
      })),
    },
  ].filter(group => fullProduct || !["Goals & work", "Results", "Memory & knowledge", "Specialists"].includes(group.label));
  return (
    <ProductShell
      title="Search"
      description="Find your Work, files and conversations."
    >
      <label htmlFor="product-search">Search your workspace</label>
      <input
        id="product-search"
        type="search"
        autoComplete="off"
        value={query}
        maxLength={120}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by title or content"
      />
      <Card title="Go to">
        {productDestinations
          .filter((item) =>
            `${item.label} ${item.description}`
              .toLowerCase()
              .includes(query.toLowerCase()),
          )
          .map((item) => (
            <p key={item.href}>
              <Link href={item.href}>{item.label}</Link>{" "}
              <span className="owner-muted">— {item.description}</span>
            </p>
          ))}
      </Card>
      {query.trim().length < 2 ? (
        <p>Enter at least two characters to search records.</p>
      ) : !enabled ? (
        <p role="status">Waiting for your search…</p>
      ) : (
        <div aria-live="polite">
          {groups.map((group) => (
            <Card key={group.label} title={group.label}>
              <ResourceState {...group.source} />
              <SearchHits hits={group.hits} />
              {!group.source.loading &&
                !group.source.error &&
                !group.hits.length && <p>No matches in this source.</p>}
            </Card>
          ))}
        </div>
      )}
      {enabled && work.data?.nextOffset !== null && work.data && <p className="owner-muted">Showing the first 20 matching Work records. Refine the search to narrow the results.</p>}
      {fullProduct && knowledge.data?.hasMore && <p className="owner-muted">Showing the first 25 knowledge matches. <Link href="/knowledge">Find more in Knowledge →</Link></p>}
      <div className="owner-actions"><Link href="/workspace">Browse files</Link><Link href="/chat">Ask Sofie →</Link></div>
    </ProductShell>
  );
}
function SearchHits({ hits }: { hits: ProductSearchHit[] }) {
  return (
    <ul className="owner-list">
      {hits.map((hit) => (
        <li key={hit.id}>
          <h3>
            <Link href={hit.href}>{hit.title}</Link>
          </h3>
          <State value={hit.status} />
          <p>{hit.detail}</p>
          <p className="owner-muted">{hit.source}</p>
        </li>
      ))}
    </ul>
  );
}
export function KnowledgeRecord({
  repository,
  id,
}: {
  repository: string;
  id: string;
}) {
  const source = useProductResource<{ item: OwnerKnowledgeView }>(
    `/api/owner-knowledge?repository=${encodeURIComponent(repository)}&id=${encodeURIComponent(id)}`,
  );
  const item = source.data?.item;
  return (
    <ProductShell
      title="Memory & source"
      description="Inspect this exact record without treating historical information as current."
    >
      <ResourceState {...source} />
      {item && (
        <Card title={item.title ?? "Recorded information"}>
          <State value={item.status} />
          <p>{item.content}</p>
          <p>
            {item.scope.label} · {item.scope.accessSummary}
          </p>
          <p>Source: {item.source?.label ?? "Not supplied"}</p>
          <p>Updated {date(item.updatedAt)}</p>
          {item.supersededBy && (
            <p>
              This record has been superseded. Inspect current information
              before using it.
            </p>
          )}
          <h3>Provenance</h3>
          <ul>
            {item.provenance.map((p, i) => (
              <li key={i}>
                {p.relation} · {p.source.label}
              </li>
            ))}
          </ul>
          <Link href="/knowledge">
            Open Knowledge to review or correct information
          </Link>
        </Card>
      )}
    </ProductShell>
  );
}
