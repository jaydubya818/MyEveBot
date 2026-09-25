import type { ExecutionScope, MemoryScopeType } from "@/lib/memory-scopes";

export const OWNER_KNOWLEDGE_TYPES = ["memory", "fact", "observation", "hypothesis", "decision", "commitment", "preference", "insight"] as const;
export type OwnerKnowledgeType = (typeof OWNER_KNOWLEDGE_TYPES)[number];
export type OwnerKnowledgeRepository = "memory" | "knowledge";
export type OwnerKnowledgeReview = "needs_review" | "contradictions" | "stale" | "recent" | "corrected";

export interface OwnerKnowledgeSource {
  type: string;
  id: string | null;
  label: string;
  date: string | null;
  url: string | null;
}

export interface OwnerKnowledgeView {
  id: string;
  canonicalType: OwnerKnowledgeType;
  canonicalRepository: OwnerKnowledgeRepository;
  title: string | null;
  content: string;
  structuredValue: unknown | null;
  scope: { type: MemoryScopeType; id: string; label: string; accessSummary: string };
  agentRef: { id: string; name: string | null } | null;
  goalRef: { id: string; title: string | null } | null;
  projectRef: string | null;
  taskRef: string | null;
  source: OwnerKnowledgeSource | null;
  provenance: Array<{ relation: string; confidence: number; source: OwnerKnowledgeSource }>;
  status: string;
  confidence: number;
  createdAt: string;
  updatedAt: string;
  lastConfirmedAt: string | null;
  supersedes: string | null;
  supersededBy: string | null;
  contradictions: string[];
  staleReasons: string[];
  eligibleForContext: string[];
  usedInRuns: number;
  remoteAvailability: "available" | "not_applicable" | "provider_unavailable";
}

export interface OwnerKnowledgeFilters {
  query?: string;
  type?: OwnerKnowledgeType;
  scope?: MemoryScopeType;
  agentId?: string;
  goalId?: string;
  source?: string;
  status?: string;
  updatedFrom?: string;
  review?: OwnerKnowledgeReview;
  page?: number;
  limit?: number;
  executionScope?: ExecutionScope;
  recordId?: string;
}

export interface OwnerKnowledgePage {
  items: OwnerKnowledgeView[];
  page: number;
  limit: number;
  hasMore: boolean;
}
