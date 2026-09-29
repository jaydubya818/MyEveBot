import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { assertEngineeringKnowledgeWorkBinding } from "./engineering-knowledge-binding.ts";

const workId = "9e732386-2ba8-4435-b67d-7044260775e6";
const ownerId = "owner-a";
const threadId = "thread-a";
const sessionId = "session-a";

function principal(selected = false) {
  return {
    authenticator: "myeve-web-session", principalType: "user", principalId: ownerId,
    attributes: { owner: "true", webThreadId: threadId, ...(selected ? { myeveEngineeringWorkId: workId } : {}) },
  };
}

function context() {
  return { session: {
    id: sessionId, turn: { id: "turn-a" },
    auth: { current: principal(true), initiator: principal() },
  } } as unknown as Parameters<typeof assertEngineeringKnowledgeWorkBinding>[0];
}

beforeEach(() => vi.stubEnv("MYEVE_ENGINEERING_MODE", "dogfood"));
afterEach(() => vi.unstubAllEnvs());

describe("engineering Knowledge tool binding", () => {
  it("requires a same-turn primary Agent context receipt for the exact selected Work", async () => {
    const query = vi.fn(async () => [{ one: 1 }]);
    await assertEngineeringKnowledgeWorkBinding(context(), ownerId, workId, { query });
    expect(query).toHaveBeenCalledWith(expect.stringContaining("run.executor_kind='primary-agent'"), [
      ownerId, sessionId, `agent_run_${sessionId}_turn-a`, threadId, workId, `engineering-work:${workId}`,
    ]);
    await expect(assertEngineeringKnowledgeWorkBinding(context(), ownerId, workId,
      { query: async () => [] })).rejects.toThrow("context is unavailable");
  });

  it("denies a model-supplied Work ID without authenticated selection before database access", async () => {
    const query = vi.fn(async () => [{ one: 1 }]);
    const noSelection = context();
    delete (noSelection.session.auth.current!.attributes as Record<string, unknown>).myeveEngineeringWorkId;
    await expect(assertEngineeringKnowledgeWorkBinding(noSelection, ownerId, workId, { query })).rejects.toThrow("direct primary Agent web chat");
    await expect(assertEngineeringKnowledgeWorkBinding(context(), ownerId,
      "514381c4-6010-4af8-85fd-154691340ea5", { query })).rejects.toThrow("direct primary Agent web chat");
    expect(query).not.toHaveBeenCalled();
  });

  it("denies a different initiator and delegated session", async () => {
    const query = vi.fn(async () => [{ one: 1 }]);
    const changedInitiator = context();
    (changedInitiator.session.auth.initiator!.attributes as Record<string, unknown>).webThreadId = "other-thread";
    await expect(assertEngineeringKnowledgeWorkBinding(changedInitiator, ownerId, workId, { query })).rejects.toThrow("direct primary Agent web chat");
    const delegated = context();
    (delegated.session as { parent?: unknown }).parent = { sessionId: "parent" };
    await expect(assertEngineeringKnowledgeWorkBinding(delegated, ownerId, workId, { query })).rejects.toThrow("direct primary Agent web chat");
    expect(query).not.toHaveBeenCalled();
  });
});
