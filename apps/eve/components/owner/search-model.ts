import type { GoalSummaryView } from "@/lib/goal-types";
import type { OutcomeView } from "@/lib/outcome-types";
import type { OwnerKnowledgeView } from "@/lib/owner-knowledge-types";
export interface ProductSearchHit {
  id: string;
  title: string;
  detail: string;
  href: string;
  source: string;
  status: string;
}
export function matchesProductQuery(
  query: string,
  ...values: (string | null | undefined)[]
) {
  const needle = query.trim().toLocaleLowerCase();
  return (
    needle.length >= 2 &&
    values.some((value) => value?.toLocaleLowerCase().includes(needle))
  );
}
export function searchGoals(
  items: GoalSummaryView[],
  query: string,
): ProductSearchHit[] {
  return items
    .filter((item) => matchesProductQuery(query, item.title, item.description))
    .map((item) => ({
      id: item.id,
      title: item.title,
      detail: item.description,
      href: `/work?id=${encodeURIComponent(item.id)}`,
      source: "Owner Goals · latest 100",
      status: item.status,
    }));
}
export function searchResults(
  items: OutcomeView[],
  query: string,
): ProductSearchHit[] {
  return items
    .filter((item) => matchesProductQuery(query, item.summary, item.runTitle))
    .map((item) => ({
      id: item.id,
      title: item.runTitle ?? "Result",
      detail: item.summary,
      href: `/results?id=${encodeURIComponent(item.id)}`,
      source: "Owner Results · latest 100",
      status: item.status,
    }));
}
export function searchKnowledge(
  items: OwnerKnowledgeView[],
): ProductSearchHit[] {
  return items.map((item) => ({
    id: `${item.canonicalRepository}:${item.id}`,
    title: item.title ?? item.content.slice(0, 100),
    detail: item.content,
    href: `/knowledge-record?repository=${item.canonicalRepository}&id=${encodeURIComponent(item.id)}`,
    source: `${item.scope.label} · ${item.source?.label ?? "Source not supplied"}`,
    status: item.status,
  }));
}

export function searchArtifacts(
  items: import("@/agent/lib/effect/artifacts").ArtifactDescriptor[],
  query: string,
): ProductSearchHit[] {
  return items
    .filter((item) =>
      matchesProductQuery(query, item.title, item.currentVersion.filename),
    )
    .map((item) => ({
      id: item.id,
      title: item.title,
      detail: item.currentVersion.filename,
      href: `/workspace/${encodeURIComponent(item.id)}`,
      source: `Private instance artifacts · ${item.createdBy}`,
      status: `Revision ${item.currentVersion.ordinal}`,
    }));
}
export function searchAgents(
  items: import("@/lib/agents").AgentView[],
  query: string,
): ProductSearchHit[] {
  return items
    .filter((item) =>
      matchesProductQuery(query, item.name, item.role, item.description),
    )
    .map((item) => ({
      id: item.id,
      title: item.name,
      detail: item.role,
      href: "/team",
      source: "Owner specialist roster",
      status: item.status,
    }));
}
