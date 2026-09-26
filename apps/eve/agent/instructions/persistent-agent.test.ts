import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assembleContext: vi.fn(), bindExecutorRun: vi.fn(), resolveSessionAgent: vi.fn(),
}));
vi.mock("../../lib/relay/owner/runtime.ts", () => ({ ownerRuntimeFromAuth: () => null, bindOwnerRuntime: vi.fn() }));
vi.mock("../../lib/agents.ts", () => ({ ensurePrimaryAgent: vi.fn() }));
vi.mock("../lib/context-assembly.ts", () => ({
  assembleContext: mocks.assembleContext, recentConversationContext: () => "",
}));
vi.mock("../lib/session-settings.ts", () => ({
  bindExecutorRun: mocks.bindExecutorRun, resolveSessionAgent: mocks.resolveSessionAgent,
  reconcileStaleAgentRuns: vi.fn(async () => 0),
}));

import instructions from "./persistent-agent.ts";

const ownerId = "owner-jay";
const threadId = "thread-1";
const workId = "11111111-1111-4111-8111-111111111111";
function principal(selectedWorkId?: string) {
  return { authenticator: "myeve-web-session", principalType: "user", principalId: ownerId,
    attributes: { owner: "true", webThreadId: threadId,
      ...(selectedWorkId ? { myeveEngineeringWorkId: selectedWorkId } : {}) } };
}
function context(currentWorkId?: string, initiatingWorkId?: string, channelKind = "http") {
  return { session: { id: "session-1", auth: { current: principal(currentWorkId), initiator: principal(initiatingWorkId) } },
    conversation: { channel: { kind: channelKind }, mode: "conversation" }, messages: [] };
}
async function startTurn(ctx: ReturnType<typeof context>) {
  return instructions.events["turn.started"]!({ data: { turnId: "turn-1" } }, ctx as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("MYEVE_ENGINEERING_MODE", "dogfood");
  mocks.resolveSessionAgent.mockResolvedValue({ id: "sofie", ownerId, isPrimary: true });
  mocks.assembleContext.mockResolvedValue({ markdown: "Authorized context" });
});
afterEach(() => vi.unstubAllEnvs());

it("passes only the current web turn's selected Work into context assembly", async () => {
  await startTurn(context(workId, workId));
  expect(mocks.assembleContext).toHaveBeenLastCalledWith(expect.objectContaining({
    ownerId, agentId: "sofie", threadId, engineeringWorkId: workId,
  }));
  await startTurn(context(undefined, workId));
  expect(mocks.assembleContext).toHaveBeenLastCalledWith(expect.objectContaining({ engineeringWorkId: null }));
});

it("rejects a child channel selection before binding a run or assembling context", async () => {
  await expect(startTurn(context(workId, workId, "subagent"))).rejects.toThrow(/direct primary Agent web chat/);
  expect(mocks.bindExecutorRun).not.toHaveBeenCalled();
  expect(mocks.assembleContext).not.toHaveBeenCalled();
});
