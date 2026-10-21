import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assembleContext: vi.fn(), bindExecutorRun: vi.fn(), resolveSessionAgent: vi.fn(), reconcileStaleAgentRuns: vi.fn(),
}));
vi.mock("../../lib/relay/owner/runtime.ts", () => ({ ownerRuntimeFromAuth: () => null, bindOwnerRuntime: vi.fn() }));
vi.mock("../../lib/agents.ts", () => ({ ensurePrimaryAgent: vi.fn() }));
vi.mock("../lib/context-assembly.ts", () => ({
  assembleContext: mocks.assembleContext, recentConversationContext: () => "",
}));
vi.mock("../lib/session-settings.ts", () => ({
  bindExecutorRun: mocks.bindExecutorRun, resolveSessionAgent: mocks.resolveSessionAgent,
  reconcileStaleAgentRuns: mocks.reconcileStaleAgentRuns,
}));

import instructions from "./persistent-agent.ts";

const ownerId = "owner-jay";
const threadId = "thread-1";
const workId = "11111111-1111-4111-8111-111111111111";
const assembledAgent = {id:"sofie",name:"Sofie",role:"Primary",description:"Private",instructions:"Owner A only",riskCeiling:"low"};
function principal(selectedWorkId?: string) {
  return { authenticator: "myeve-web-session", principalType: "user", principalId: ownerId,
    attributes: { owner: "true", webThreadId: threadId,
      ...(selectedWorkId ? { myeveEngineeringWorkId: selectedWorkId } : {}) } };
}
function context(currentWorkId?: string, initiatingWorkId?: string, channelKind = "http") {
  return { session: { id: "session-1", auth: { current: principal(currentWorkId), initiator: principal(initiatingWorkId) } },
    channel: { kind: channelKind },
    conversation: { channel: { kind: "channel:eve" }, mode: "conversation" }, messages: [] };
}
async function startTurn(ctx: ReturnType<typeof context>) {
  return instructions.events["turn.started"]!({ data: { turnId: "turn-1" } }, ctx as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("MYEVE_ENGINEERING_MODE", "dogfood");
  mocks.resolveSessionAgent.mockResolvedValue({ id: "sofie", ownerId, isPrimary: true });
  mocks.assembleContext.mockResolvedValue({ markdown: "Authorized context", agent:assembledAgent });
});
afterEach(() => vi.unstubAllEnvs());

it("retains Agent policy and canonical authority rules while excluding alpha fallback procedures", async () => {
  vi.stubEnv("EVE_PROJECT_NAME", "myeve-alpha-tester-1");
  mocks.assembleContext.mockResolvedValue({ markdown: "Identity Sofie; owner A only; custom policy remains exact.", agent:assembledAgent });
  const result = await startTurn(context());
  const text = JSON.stringify(result);
  expect(text).toContain("Identity Sofie; owner A only; custom policy remains exact.");
  expect(text).toContain("Authenticated owner, Agent, thread and selected Work bindings");
  expect(text).toContain("backend rechecks current owner intent, version, generation, policy, budget, deadline");
  expect(text).toContain("candidate remains PARTIAL");
  expect(text).toContain("Authenticated alpha context:");
  expect(text).not.toContain("Native execution is an experimental fallback");
});

it("uses the current HTTP adapter, not the channel:eve conversation label, for selected Work", async () => {
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

 it("binds a normal retained-summary turn without stale-run recovery or private context assembly", async () => {
  const ctx=context(undefined,workId);
  Object.assign(ctx.session.auth.current.attributes,{myeveRetainedSummary:JSON.stringify({ownerId,threadId,sessionId:'session-1',workId,resultId:'22222222-2222-4222-8222-222222222222',proofHash:'a'.repeat(64),version:3,generation:3})});
  await startTurn(ctx);
  expect(mocks.bindExecutorRun).toHaveBeenCalledOnce();
  expect(mocks.reconcileStaleAgentRuns).not.toHaveBeenCalled();
  expect(mocks.assembleContext).not.toHaveBeenCalled();
 });
