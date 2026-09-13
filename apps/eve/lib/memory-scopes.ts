export const MEMORY_SCOPE_TYPES = ["owner", "agent", "goal", "project", "task"] as const;
export type MemoryScopeType = (typeof MEMORY_SCOPE_TYPES)[number];

export interface MemoryScope {
  type: MemoryScopeType;
  id: string;
}

export interface ExecutionScope {
  ownerId: string;
  agentId: string;
  goalId?: string | null;
  projectId?: string | null;
  taskId?: string | null;
}

export interface ScopedMemoryCandidate {
  id: string;
  scope: MemoryScope;
  content: string;
  confidence: number;
  semanticRelevance: number;
  updatedAt: string | null;
  explicitReference?: boolean;
}

export type ContextTier = "hot" | "warm" | "cold";

export interface ContextItem {
  id: string;
  kind: string;
  content: string;
  tier: ContextTier;
  mandatory?: boolean;
  score: number;
}

export interface ContextBudget {
  maximumTokens: number;
  reservedInstructionTokens: number;
  retrievalTokens: number;
}

export const DEFAULT_CONTEXT_BUDGET: ContextBudget = {
  maximumTokens: 12_000,
  reservedInstructionTokens: 4_000,
  retrievalTokens: 4_000,
};

const IDENTIFIERS: Record<MemoryScopeType, RegExp> = {
  owner: /^[A-Za-z0-9][A-Za-z0-9_.:@-]{0,199}$/,
  agent: /^agent_[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/,
  goal: /^goal_[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/,
  project: /^project_[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/,
  task: /^(?:task|gtask)_[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/,
};

export function validateMemoryScope(scope: MemoryScope): string | null {
  if (!MEMORY_SCOPE_TYPES.includes(scope.type)) return "Unknown memory scope type.";
  if (!IDENTIFIERS[scope.type].test(scope.id)) return `Malformed ${scope.type} scope id.`;
  return null;
}

export function allowedMemoryScopes(execution: ExecutionScope): MemoryScope[] {
  return [
    { type: "owner", id: execution.ownerId },
    { type: "agent", id: execution.agentId },
    ...(execution.goalId ? [{ type: "goal" as const, id: execution.goalId }] : []),
    ...(execution.projectId ? [{ type: "project" as const, id: execution.projectId }] : []),
    ...(execution.taskId ? [{ type: "task" as const, id: execution.taskId }] : []),
  ];
}

export function scopeIsAllowed(scope: MemoryScope, execution: ExecutionScope): boolean {
  return allowedMemoryScopes(execution).some((allowed) => allowed.type === scope.type && allowed.id === scope.id);
}

function recencyScore(updatedAt: string | null, now: number): number {
  if (!updatedAt) return 0;
  const ageDays = Math.max(0, (now - new Date(updatedAt).getTime()) / 86_400_000);
  return Math.max(0, 40 - Math.floor(ageDays));
}

export function rankScopedMemories(
  candidates: readonly ScopedMemoryCandidate[],
  execution: ExecutionScope,
  now = Date.now(),
): ScopedMemoryCandidate[] {
  const authorized = candidates.filter((candidate) => scopeIsAllowed(candidate.scope, execution));
  const scopeScore: Record<MemoryScopeType, number> = { task: 500, goal: 420, agent: 360, project: 320, owner: 240 };
  return [...authorized].sort((left, right) => {
    const score = (candidate: ScopedMemoryCandidate) =>
      scopeScore[candidate.scope.type] +
      Math.round(Math.max(0, Math.min(1, candidate.semanticRelevance)) * 100) +
      Math.round(Math.max(0, Math.min(1, candidate.confidence)) * 50) +
      recencyScore(candidate.updatedAt, now) +
      (candidate.explicitReference ? 120 : 0);
    return score(right) - score(left) || left.id.localeCompare(right.id);
  });
}

export function estimateTokens(content: string): number {
  return Math.max(1, Math.ceil(content.length / 4));
}

export function applyContextBudget(
  items: readonly ContextItem[],
  budget: ContextBudget = DEFAULT_CONTEXT_BUDGET,
): { included: ContextItem[]; excluded: ContextItem[]; estimatedTokens: number; overBudget: boolean } {
  if (budget.maximumTokens <= 0 || budget.reservedInstructionTokens < 0 || budget.retrievalTokens < 0) {
    throw new Error("Context budgets must be non-negative and the maximum must be positive.");
  }
  const mandatory = items.filter((item) => item.mandatory);
  const optional = items.filter((item) => !item.mandatory).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  const included = [...mandatory];
  const excluded: ContextItem[] = [];
  let total = budget.reservedInstructionTokens + mandatory.reduce((sum, item) => sum + estimateTokens(item.content), 0);
  let retrieval = 0;
  for (const item of optional) {
    const tokens = estimateTokens(item.content);
    if (retrieval + tokens <= budget.retrievalTokens && total + tokens <= budget.maximumTokens) {
      included.push(item);
      retrieval += tokens;
      total += tokens;
    } else {
      excluded.push(item);
    }
  }
  return { included, excluded, estimatedTokens: total, overBudget: total > budget.maximumTokens };
}

export function selectThreadSummary<T extends { status: string; updatedAt: string }>(summaries: readonly T[]): T | null {
  return [...summaries]
    .filter((summary) => summary.status === "active")
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0] ?? null;
}
