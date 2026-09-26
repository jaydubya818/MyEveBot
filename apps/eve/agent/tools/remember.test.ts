import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ request: vi.fn(), access: vi.fn(), gateway: vi.fn(), consume: vi.fn(), add: vi.fn(), list: vi.fn() }));
vi.mock("../lib/action-context.ts", () => ({ toolActionRequest: mocks.request }));
vi.mock("../lib/memory-tool-context.ts", async original => ({
  ...await original<typeof import("../lib/memory-tool-context.ts")>(), memoryAccessForTool: mocks.access,
}));
vi.mock("../lib/memory-store.ts", () => ({ memoryStore: { add: mocks.add, list: mocks.list } }));
vi.mock("../../lib/action-gateway.ts", async original => ({
  ...await original<typeof import("../../lib/action-gateway.ts")>(),
  consumeActionAuthority: mocks.consume,
  ActionGateway: class { execute = mocks.gateway; },
}));
import remember from "./remember.ts";
import { ActionBlocked, type ActionAdapter } from "../../lib/action-gateway.ts";
import type { ToolContext } from "eve/tools";
const ctx = { session: { id: "session" }, callId: "call" } as ToolContext;
const input = { memory: "A durable fact", permanent: false, scope: "owner" as const };
const entry = { id: "memory_test", content: input.memory, permanent: false, scope: { type: "owner", id: "owner" },
  syncState: "synced" as const, degraded: false };
const run = (overrides = {}) => remember.execute!({ ...input, ...overrides }, ctx);

beforeEach(() => {
  vi.resetAllMocks();
  mocks.request.mockImplementation(async (_ctx, action) => ({ ...action, ownerId: "owner", runId: "run_1",
    trigger: { kind: "owner_chat", id: "session" }, executor: { agentId: "agent_test" } }));
  mocks.access.mockResolvedValue({ ownerId: "owner", agentId: "agent_test" });
  mocks.consume.mockRejectedValue(new ActionBlocked("denied", "unresolved"));
  mocks.gateway.mockResolvedValue({ actionId: "action", receipt: { memoryId: entry.id, verified: true,
    syncState: "synced", degraded: false } });
  mocks.list.mockResolvedValue([entry]);
});
describe("remember authorization and verification", () => {
  it("binds the content and verifies the stored record", async () => {
    expect(await run()).toMatchObject({ status: "saved", id: entry.id });
    expect(mocks.request).toHaveBeenCalledWith(ctx, expect.objectContaining({
      capabilityId: "tool.remember", actionClass: "write", parameters: expect.objectContaining({ content: input.memory }),
    }));
    const adapter = mocks.gateway.mock.calls[0][1] as ActionAdapter<typeof entry>;
    expect(await adapter.resolveTarget({})).toEqual({ provider: "supermemory", account: "owner", resource: "owner:owner" });
    expect(adapter.receipt?.(entry)).toMatchObject({ memoryId: entry.id, syncState: "synced", degraded: false });
    expect(await adapter.verify(entry, {} as never)).toMatchObject({ verified: true,
      receipt: { syncState: "synced", degraded: false } });
    mocks.list.mockResolvedValue([{ ...entry, content: "Wrong content" }]);
    expect(await adapter.verify(entry, {} as never)).toMatchObject({ verified: false });
  });
  it.each([
    ["local_only", "saved_local_only", "has not been synced"],
    ["remote_unknown", "saved_remote_unknown", "do not retry"],
  ] as const)("surfaces %s in the action receipt and tool result", async (syncState, status, warning) => {
    const saved = { ...entry, syncState, degraded: true };
    mocks.list.mockResolvedValue([saved]);
    mocks.gateway.mockResolvedValue({ actionId: "action", receipt: { memoryId: entry.id,
      verified: true, syncState, degraded: true } });

    expect(await run()).toMatchObject({ status, id: entry.id, syncState, retryable: false,
      message: expect.stringContaining(warning), receipt: { syncState, degraded: true } });
    const adapter = mocks.gateway.mock.calls[0][1] as ActionAdapter<typeof saved>;
    expect(adapter.receipt?.(saved)).toMatchObject({ memoryId: entry.id, syncState, degraded: true });
    expect(await adapter.verify(saved, {} as never)).toMatchObject({ verified: true,
      receipt: { memoryId: entry.id, verified: true, syncState, degraded: true } });
  });
  it("does not infer remote sync from a legacy completed receipt", async () => {
    mocks.gateway.mockResolvedValue({ actionId: "action", receipt: { memoryId: entry.id, verified: true } });
    expect(await run()).toMatchObject({ status: "saved_sync_unknown", syncState: "unknown", retryable: false,
      message: expect.stringContaining("does not establish remote sync") });
  });
  it("refuses adapter execution without a real gateway authority", async () => {
    await run();
    const adapter = mocks.gateway.mock.calls[0][1] as ActionAdapter<typeof entry>;
    await expect(adapter.execute({}, {} as never)).rejects.toBeInstanceOf(ActionBlocked);
    expect(mocks.add).not.toHaveBeenCalled();
  });
  it.each([
    ["owner_chat", "chat", "session"],
    ["scheduled_occurrence", "run", "occurrence_1"],
  ] as const)("derives %s provenance from the trusted Action trigger", async (kind, sourceType, sourceId) => {
    mocks.request.mockImplementation(async (_ctx, action) => ({ ...action, ownerId: "owner", runId: "run_1",
      trigger: { kind, id: sourceId }, executor: { agentId: "agent_test" } }));
    mocks.consume.mockResolvedValue(undefined);
    mocks.add.mockResolvedValue(entry);

    await run();
    const adapter = mocks.gateway.mock.calls[0][1] as ActionAdapter<typeof entry>;
    await adapter.execute({}, {} as never);
    expect(mocks.add).toHaveBeenCalledWith(input.memory, expect.objectContaining({
      sourceType, sourceId, context: expect.objectContaining({ ownerId: "owner" }),
    }));
  });
  it("rejects another goal before reaching the gateway", async () => {
    expect(await run({ scope: "goal", scopeId: "goal_other" })).toMatchObject({ status: "denied", retryable: false });
    expect(mocks.gateway).not.toHaveBeenCalled();
  });
  it("rejects mismatched owner identity", async () => {
    mocks.access.mockResolvedValue({ ownerId: "other", agentId: "agent_test" });
    expect(await run()).toMatchObject({ status: "denied", retryable: false });
    expect(mocks.gateway).not.toHaveBeenCalled();
  });
  it.each(["denied", "awaiting_approval", "result_unknown"] as const)("reports %s without promising a save or retry", async status => {
    mocks.gateway.mockRejectedValue(new ActionBlocked(status, "action"));
    expect(await run()).toMatchObject({ status, retryable: false, message: expect.stringContaining("Do not retry") });
  });
  it("stops rejected callers before resolving memory access", async () => {
    mocks.request.mockRejectedValue(new ActionBlocked("denied", "unresolved"));
    expect(await run()).toMatchObject({ status: "denied" });
    expect(mocks.access).not.toHaveBeenCalled();
  });
});
