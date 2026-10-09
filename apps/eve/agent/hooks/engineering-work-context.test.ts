import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ db: vi.fn(), query: vi.fn() }));
vi.mock("../lib/receipts-db.ts", () => ({ db: mocks.db }));

import hook from "./engineering-work-context.ts";

const workId = "11111111-1111-4111-8111-111111111111";
const ownerId = "owner-jay";
const threadId = "thread-1";

function principal(selectedWorkId?: string) {
  return {
    authenticator: "myeve-web-session",
    principalId: ownerId,
    principalType: "user",
    attributes: {
      owner: "true",
      webThreadId: threadId,
      ...(selectedWorkId ? { myeveEngineeringWorkId: selectedWorkId } : {}),
    },
  };
}

function context(selectedWorkId?: string) {
  return {
    channel: { kind: "http" },
    session: {
      id: "session-1",
      turn: { id: "turn-2", sequence: 2 },
      auth: { current: principal(selectedWorkId), initiator: principal() },
    },
  };
}

async function startModelStep(ctx: ReturnType<typeof context>) {
  const stepStarted = hook.events?.["step.started"];
  if (!stepStarted) throw new Error("Selected Work guard is not registered on model steps.");
  return stepStarted({ data: { turnId: ctx.session.turn.id } } as never, ctx as never);
}

beforeEach(() => {
  mocks.query.mockReset();
  mocks.db.mockReset().mockReturnValue({ query: mocks.query });
});

it("lets ordinary chat proceed without an Engineering Work receipt", async () => {
  await startModelStep(context());
  expect(mocks.db).not.toHaveBeenCalled();
  expect(mocks.query).not.toHaveBeenCalled();
});

it("stops a selected Work turn before the model if dynamic instructions produced no assembly", async () => {
  mocks.query.mockResolvedValue([]);
  await expect(startModelStep(context(workId))).rejects.toThrow(/Selected Work context could not be verified/);
  expect(mocks.query).toHaveBeenCalledWith(
    expect.stringContaining("FROM context_assemblies AS assembly"),
    [ownerId, "session-1", "agent_run_session-1_turn-2", threadId, workId, `engineering-work:${workId}`],
  );
});

it("allows a selected Work turn only with this turn's assembly receipt", async () => {
  mocks.query.mockResolvedValue([{ "?column?": 1 }]);
  await startModelStep(context(workId));
  expect(mocks.query).toHaveBeenCalledWith(
    expect.stringContaining("assembly.source_refs @>"),
    [ownerId, "session-1", "agent_run_session-1_turn-2", threadId, workId, `engineering-work:${workId}`],
  );
  expect(mocks.query.mock.calls[0][0]).toContain("work.version::text");
});

it("stops a selected Work turn when the session initiator is not the same owner web chat", async () => {
  const ctx = context(workId);
  ctx.session.auth.initiator.principalId = "other-owner";
  await expect(startModelStep(ctx)).rejects.toThrow(/direct Sofie web chat/);
  expect(mocks.query).not.toHaveBeenCalled();
});
