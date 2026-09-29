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
import { productDestinations } from "./destinations";
import {
  searchArtifacts,
  searchAgents,
  searchGoals,
  searchResults,
  searchKnowledge,
  type ProductSearchHit,
} from "./search-model";

export function ProductSearch() {
  const [query, setQuery] = useState("");
  const [settled, setSettled] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setSettled(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);
  const enabled = settled.length >= 2 && settled === query.trim();
  const goals = useProductResource<{ goals: GoalSummaryView[] }>(
    enabled ? "/api/goals?limit=100" : null,
  );
  const results = useProductResource<{ outcomes: OutcomeView[] }>(
    enabled ? "/api/outcomes?limit=100" : null,
  );
  const knowledge = useProductResource<OwnerKnowledgePage>(
    enabled
      ? `/api/owner-knowledge?q=${encodeURIComponent(settled)}&limit=25`
      : null,
  );
  const artifacts = useProductResource<{
    artifacts: import("@/agent/lib/effect/artifacts").ArtifactDescriptor[];
  }>(enabled ? `/api/artifacts?q=${encodeURIComponent(settled)}` : null);
  const agents = useProductResource<{
    agents: import("@/lib/agents").AgentView[];
  }>(enabled ? "/api/agents" : null);
  const conversations = useProductResource<{
    results: { id: string; title: string; snippet: string | null }[];
  }>(enabled ? `/api/threads/search?q=${encodeURIComponent(settled)}` : null);
  const groups = [
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
      label: "Artifacts",
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
  ];
  return (
    <ProductShell
      title="Search"
      description="Find work, results, knowledge, artifacts, specialists and conversations. Sources and historical states remain visible."
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
      <p className="owner-muted">
        Goal and Result searches cover the latest 100 records. Knowledge returns
        up to 25 matches
        {knowledge.data?.hasMore
          ? "; more matches are available in Knowledge"
          : ""}
        . An unavailable source is not an empty result.
      </p>
      <div className="owner-actions">
        <Link href="/workspace">Search files and artifacts</Link>
        <Link href="/chat">Search conversations with ⌘K</Link>
        <Link href="/inbox">Search incoming email</Link>
      </div>
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
