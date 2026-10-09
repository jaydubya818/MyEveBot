import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: vi.fn(), query: vi.fn(), transaction: vi.fn(),
  getKnowledge: vi.fn(), createKnowledge: vi.fn(),
  correctMemory: vi.fn(), deleteMemory: vi.fn(), operation: vi.fn(),
}));

vi.mock("@/agent/lib/receipts-db", () => ({ db: mocks.db }));
vi.mock("@/agent/lib/memory-store", () => ({ memoryStore: { correctForOwner: mocks.correctMemory, deleteForOwnerDetailed: mocks.deleteMemory } }));
vi.mock("@/lib/knowledge", () => ({ getKnowledge: mocks.getKnowledge, createKnowledge: mocks.createKnowledge }));
vi.mock("@/lib/owner-data-operations", () => ({ recordOwnerDataOperation: mocks.operation }));

import { correctOwnerKnowledge, forgetOwnerKnowledge, searchOwnerKnowledge } from "./owner-knowledge";

const now = "2026-09-18T12:00:00.000Z";
const memoryRow = {
  id: "memory_owner", owner_id: "owner-a", scope_type: "owner", scope_id: "owner-a",
  content: "Prefers concise explanations", provider_id: "remote_1", source_type: "explicit", source_id: "thread_1",
  status: "active", confidence: 1, created_at: now, updated_at: now, last_confirmed_at: now,
  used_in_runs: 2,
};
const knowledgeRow = {
  id: "knowledge_fact", owner_id: "owner-a", kind: "fact", title: null, statement: "Product launches Friday",
  confidence: 0.9, status: "contradicted", created_at: now, updated_at: now, last_confirmed_at: null,
  created_by_id: "agent_researcher", agent_name: "Researcher", goal_id: "goal_launch", goal_title: "Launch Product",
  source_type: "chat", source_id: "source_1", source_provider: "eve", source_date: now, source_url: "/?thread=thread_1",
  stale_reasons: ["Review date reached"], contradictions: ["knowledge_fact_old"], used_in_runs: 1,
};

describe("owner knowledge projection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.query.mockResolvedValue([]);
    mocks.db.mockReturnValue({ query: mocks.query, transaction: mocks.transaction });
  });

  it("preserves canonical types while querying both repositories with owner scope first", async () => {
    const statements: Array<{ sql: string; params: unknown[] }> = [];
    const query = vi.fn(async (sql: string, params: unknown[] = []) => {
      statements.push({ sql, params });
      return sql.includes("FROM memory_records") ? [memoryRow] : [knowledgeRow];
    });
    const result = await searchOwnerKnowledge("owner-a", { query: "launch", limit: 10 }, query, false);

    expect(result.items.map((item) => item.canonicalType)).toEqual(expect.arrayContaining(["memory", "fact"]));
    expect(result.items.find((item) => item.id === "memory_owner")).toMatchObject({ canonicalRepository: "memory", scope: { type: "owner" }, remoteAvailability: "provider_unavailable" });
    expect(result.items.find((item) => item.id === "knowledge_fact")).toMatchObject({ canonicalRepository: "knowledge", contradictions: ["knowledge_fact_old"], staleReasons: ["Review date reached"] });
    expect(statements).toHaveLength(2);
    expect(statements.every((statement) => statement.sql.includes("owner_id=$1") && statement.params[0] === "owner-a")).toBe(true);
  });

  it("applies Agent execution scope to Memory in SQL before ranking", async () => {
    const query = vi.fn(async (_sql: string, _params: unknown[] = []) => []);
    await searchOwnerKnowledge("owner-a", { executionScope: { ownerId: "owner-a", agentId: "agent_researcher", goalId: "goal_launch", taskId: null }, limit: 10 }, query);

    const [memorySql, memoryParams] = query.mock.calls[0]!;
    expect(memorySql).toContain("m.scope_type='agent'");
    expect(memorySql).toContain("m.scope_type='goal'");
    expect(memoryParams).toEqual(expect.arrayContaining(["owner-a", "agent_researcher", "goal_launch"]));
    expect(memoryParams).not.toContain("agent_finance");
  });

  it("bounds pagination and never retrieves an unbounded corpus", async () => {
    const query = vi.fn(async (sql: string, _params: unknown[] = []) => sql.includes("FROM memory_records") ? [memoryRow, { ...memoryRow, id: "memory_second", content: "Second" }] : []);
    const result = await searchOwnerKnowledge("owner-a", { page: 2, limit: 1 }, query);
    expect(result).toMatchObject({ page: 2, limit: 1, hasMore: false });
    expect(result.items).toHaveLength(1);
    expect(query.mock.calls.every((call) => /LIMIT \$\d+/.test(call[0] as string))).toBe(true);
    expect(query.mock.calls.every((call) => (call[1] ?? []).at(-1) === 3)).toBe(true);
  });

  it("returns source unavailable without fabricating provenance", async () => {
    const query = vi.fn(async (sql: string) => sql.includes("FROM memory_records") ? [] : [{ ...knowledgeRow, source_type: null, source_id: null, source_provider: null, source_date: null, source_url: null }]);
    const result = await searchOwnerKnowledge("owner-a", { type: "fact" }, query);
    expect(result.items[0]).toMatchObject({ source: null, provenance: [] });
  });

  it("uses deterministic canonical signals for contradiction and staleness queues", async () => {
    const query = vi.fn(async (_sql: string, _params: unknown[] = []) => []);
    await searchOwnerKnowledge("owner-a", { review: "contradictions" }, query);
    await searchOwnerKnowledge("owner-a", { review: "stale" }, query);

    const contradictionSql = String(query.mock.calls[0]?.[0] ?? "");
    const staleSql = String(query.mock.calls[1]?.[0] ?? "");
    expect(contradictionSql).toContain("status='contradicted'");
    expect(staleSql).toContain("review_at<=now()");
    expect(staleSql).toContain("g.status='archived'");
    expect(staleSql).not.toContain("interval '90 days'");
  });
});

describe("owner knowledge mutations", () => {
  const preference = {
    id: "knowledge_pref", kind: "preference", title: null, statement: "Deploy to AWS", confidence: 1, status: "active",
    occurrenceCount: null, firstSeenAt: null, lastConfirmedAt: now, firstObservedAt: null, lastObservedAt: null,
    testDescription: null, decisionTrigger: null, rationale: null, alternatives: [], decidedAt: null, reopenCondition: null,
    subject: null, dueAt: null, fulfilledAt: null, preferenceKey: "deployment", preferenceValue: "AWS", preferenceScope: "owner",
    preferenceSourceType: "explicit_user", preferenceSourceId: null, active: true, reviewAt: null, expiresAt: null, generatedAt: null,
    createdByType: "owner", createdById: null, goalId: null, goalTitle: null, projectRef: null, supersedesId: null, supersededById: null,
    createdAt: now, updatedAt: now, provenance: [],
  } as const;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.query.mockResolvedValue([]);
    mocks.db.mockReturnValue({ query: mocks.query, transaction: mocks.transaction });
    mocks.getKnowledge.mockResolvedValue(preference);
    mocks.createKnowledge.mockResolvedValue({ ...preference, id: "knowledge_pref_2", statement: "Deploy to Vercel", supersedesId: preference.id });
    mocks.operation.mockResolvedValue({ id: "dataop_1" });
    mocks.transaction.mockImplementation(async (callback) => callback({ query: mocks.query }));
  });

  it("corrects Knowledge by creating a superseding canonical version with source history", async () => {
    const result = await correctOwnerKnowledge({ ownerId: "owner-a", repository: "knowledge", id: preference.id, content: "Deploy to Vercel", preferenceValue: "Vercel" });
    expect(mocks.createKnowledge).toHaveBeenCalledWith(expect.objectContaining({ ownerId: "owner-a", kind: "preference", supersedesId: preference.id, statement: "Deploy to Vercel", preferenceValue: "Vercel" }));
    expect(mocks.operation).toHaveBeenCalledWith(expect.objectContaining({ type: "preference_corrected", status: "completed" }));
    expect(result.receipt).toMatchObject({ previous: "superseded", current: "active", sourceHistoryPreserved: true });
  });

  it("does not claim Memory Forget succeeded when remote deletion is unverified", async () => {
    mocks.deleteMemory.mockResolvedValue({ found: true, deleted: false, remoteDeleted: true, remoteDeletionVerified: false });
    const result = await forgetOwnerKnowledge({ ownerId: "owner-a", repository: "memory", id: "memory_owner" });
    expect(result.receipt.result).toBe("partially_completed");
    expect(mocks.operation).toHaveBeenCalledWith(expect.objectContaining({ type: "memory_forgotten", status: "partially_completed" }));
  });

  it("deletes Knowledge relationships transactionally before the canonical record", async () => {
    await forgetOwnerKnowledge({ ownerId: "owner-a", repository: "knowledge", id: preference.id });
    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.query.mock.calls.some((call) => String(call[0]).includes("DELETE FROM knowledge_relationships"))).toBe(true);
    expect(mocks.operation).toHaveBeenCalledWith(expect.objectContaining({ type: "knowledge_deleted", status: "completed" }));
  });
});
