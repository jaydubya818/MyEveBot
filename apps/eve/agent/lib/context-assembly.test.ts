import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fixture } from "../../test/engineering-fixtures.ts";

const mocks = vi.hoisted(() => ({
  getAgent: vi.fn(), getWork: vi.fn(), getExecution: vi.fn(), memorySearch: vi.fn(), query: vi.fn(), principal: vi.fn(),
}));
vi.mock("../../lib/agents.ts", () => ({ getAgent: mocks.getAgent }));
vi.mock("../../lib/engineering/store.ts", () => ({
  WorkStore: class {
    constructor(principal: unknown) { mocks.principal(principal); }
    get = mocks.getWork;
  },
}));
vi.mock("../../lib/engineering/execution-store.ts", () => ({
  ExecutionStore: class { get = mocks.getExecution; },
}));
vi.mock("./receipts-db.ts", () => ({ db: () => ({ query: mocks.query }) }));
vi.mock("./memory-store.ts", () => ({ memoryStore: { search: mocks.memorySearch } }));

import { assembleContext } from "./context-assembly.ts";

const ownerId = "golden-owner";
const agentId = "sofie";
const input = (engineeringWorkId?: string) => ({ ownerId, agentId, sessionId: "session-1", engineeringWorkId });

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("MYEVE_ENGINEERING_MODE", "dogfood");
  mocks.getAgent.mockResolvedValue({ id: agentId, ownerId, name: "Sofie", role: "Engineer", description: "", instructions: "",
    status: "active", isPrimary: true, riskCeiling: "low", capabilities: [] });
  mocks.memorySearch.mockResolvedValue([]);
  mocks.query.mockResolvedValue([]);
  const current = fixture();
  mocks.getWork.mockResolvedValue(current.work);
  mocks.getExecution.mockResolvedValue(current.state);
});
afterEach(() => vi.unstubAllEnvs());

describe("opt-in Engineering Work context", () => {
  it("uses the same Work manifest as the UI and retains versioned provenance", async () => {
    const current = await mocks.getWork();
    const assembled = await assembleContext(input(current.id));
    expect(mocks.principal).toHaveBeenCalledWith({ scopeId: ownerId, scopeKind: "personal", actorId: ownerId });
    expect(mocks.getWork).toHaveBeenCalledWith(current.id);
    expect(assembled.markdown).toContain("Current Truth: Ready for Review");
    expect(assembled.markdown).toContain("Current candidate:");
    expect(assembled.markdown).toContain("context, not permission");
    expect(assembled.sourceRefs).toContain(`engineering-work:${current.id}:v${current.version}`);
    expect(assembled.sourceRefs).toContain(`engineering-criteria:${current.id}:v${current.criteriaVersion}`);
    expect(assembled.sourceRefs).toContain(`engineering-execution:${current.id}:r1`);
    expect(assembled.overBudget).toBe(false);
    expect(mocks.query.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO context_assemblies"))).toBe(true);
  });

  it("labels prepared Work as degraded when no execution is admitted", async () => {
    const current = await mocks.getWork();
    mocks.getExecution.mockResolvedValue(null);
    const assembled = await assembleContext(input(current.id));
    expect(assembled.markdown).toContain("Current Truth: DEGRADED");
    expect(assembled.markdown).toContain("Readiness: UNKNOWN / NOT_RUN");
    expect(assembled.sourceRefs).not.toContain(`engineering-execution:${current.id}:r1`);
  });

  it("does not infer a Work item from an ordinary chat session", async () => {
    const assembled = await assembleContext(input());
    expect(mocks.getWork).not.toHaveBeenCalled();
    expect(assembled.sourceRefs.some(ref => ref.startsWith("engineering-work:"))).toBe(false);
  });

  it("marks a local fallback memory as degraded context, not confirmed remote knowledge", async () => {
    mocks.memorySearch.mockResolvedValueOnce([{
      id: "memory-1", content: "Prefers small changes", scope: { type: "personal" },
      syncState: "local_only", retrievalSource: "local_fallback", degraded: true,
    }]);
    const assembled = await assembleContext(input());
    expect(assembled.markdown).toContain("Memory status: local_only; retrieval: local_fallback; degraded.");
    expect(assembled.memoryRefs).toContain("memory-1");
  });

  it("rejects another owner, another Agent, external ingress, and ambiguous Project binding", async () => {
    const current = await mocks.getWork();
    mocks.getWork.mockRejectedValueOnce(new Error("Work was not found in this workspace."));
    await expect(assembleContext(input(current.id))).rejects.toThrow("not found");
    mocks.getAgent.mockResolvedValueOnce({ id: agentId, ownerId, status: "active", isPrimary: false });
    await expect(assembleContext(input(current.id))).rejects.toThrow("primary Agent");
    await expect(assembleContext({ ...input(current.id), ownerChannelRunId: "external-run" })).rejects.toThrow("cannot inherit");
    await expect(assembleContext({ ...input(current.id), projectId: "project_a",
      projectScopeProvider: { authorize: async () => true } })).rejects.toThrow("no qualified Project binding");
  });

  it("rejects a persisted execution bound to another Agent", async () => {
    const current = fixture();
    current.state.contract.coordinatingAgent = "atlas";
    mocks.getWork.mockResolvedValue(current.work);
    mocks.getExecution.mockResolvedValue(current.state);
    await expect(assembleContext(input(current.work.id))).rejects.toThrow("different owner or Agent");
  });

  it("keeps the optional feature off outside dogfood mode", async () => {
    const current = await mocks.getWork();
    vi.stubEnv("MYEVE_ENGINEERING_MODE", "off");
    await expect(assembleContext(input(current.id))).rejects.toThrow("not enabled");
    const ordinary = await assembleContext(input());
    expect(ordinary.markdown).not.toContain("Current Engineering Work");
  });
});
