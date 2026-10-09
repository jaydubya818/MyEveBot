import { describe, expect, it, vi } from "vitest";
import type { HandleMessageStreamEvent } from "eve/client";
import { SofieDispatcher } from "./dispatch";

const clientSessions = vi.hoisted(() => ({ create: vi.fn(), attach: vi.fn() }));
vi.mock("eve/client", async (load) => ({
  ...await load<typeof import("eve/client")>(),
  Client: class { sessions = clientSessions; },
}));

function ev(type: string, data: Record<string, unknown>): HandleMessageStreamEvent {
  return { type, data } as unknown as HandleMessageStreamEvent;
}

function fakeSession(events: HandleMessageStreamEvent[], delayMs = 0) {
  return {
    cancel: vi.fn(async () => ({ status: "accepted" })),
    state: { streamIndex: 0, sessionId: "session-next" },
    respond: vi.fn(async () => ({ async *[Symbol.asyncIterator]() { yield* events; } })),
    send: vi.fn(async () => ({
      async *[Symbol.asyncIterator]() {
        for (const event of events) {
          if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
          yield event;
        }
      },
    })),
  };
}

const happyEvents = [
  ev("turn.started", { sequence: 0, turnId: "t1" }),
  ev("actions.requested", { actions: [{ kind: "tool-call", callId: "c1", toolName: "email_search", input: {} }], sequence: 1, stepIndex: 0, turnId: "t1" }),
  ev("message.completed", { finishReason: "stop", message: "Found it.", sequence: 2, stepIndex: 1, turnId: "t1" }),
  ev("turn.completed", { sequence: 3, turnId: "t1" }),
  ev("session.waiting", { sessionId: "session-next", wait: "next-user-message" }),
];

describe("SofieDispatcher", () => {
  it("creates the first durable session and reuses it for the next voice request", async () => {
    const session = fakeSession(happyEvents);
    clientSessions.create.mockResolvedValueOnce({ session, response: { async *[Symbol.asyncIterator]() { yield* happyEvents; } } });
    const dispatcher = new SofieDispatcher();
    expect((await dispatcher.dispatch("first", {})).reply).toBe("Found it.");
    expect(clientSessions.create).toHaveBeenCalledWith({ message: "first", clientContext: {} });
    await dispatcher.dispatch("follow-up", {});
    expect(session.send).toHaveBeenCalledWith("follow-up", { clientContext: {} });
    expect(dispatcher.sessionId).toBe("session-next");
  });

  it("attaches the saved fixed session identity before answering an approval", async () => {
    const session = fakeSession(happyEvents);
    clientSessions.attach.mockReturnValueOnce(session);
    const dispatcher = new SofieDispatcher("saved-session");
    await dispatcher.answer([{ requestId: "approval", optionId: "approve" }]);
    expect(clientSessions.attach).toHaveBeenCalledWith("saved-session");
    expect(session.respond).toHaveBeenCalledWith([{ requestId: "approval", optionId: "approve" }]);
  });

  it("retains cancellation while the first session is being created", async () => {
    const session = fakeSession(happyEvents);
    let finish!: (value: unknown) => void;
    clientSessions.create.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const dispatcher = new SofieDispatcher();
    const running = dispatcher.dispatch("slow creation", {});
    expect(await dispatcher.cancel()).toBe(true);
    finish({ session, response: { async *[Symbol.asyncIterator]() { yield* happyEvents; } } });
    await running;
    expect(session.cancel).toHaveBeenCalledTimes(1);
  });

  it("streams a dispatch, reports tool starts, returns the outcome + events", async () => {
    const session = fakeSession(happyEvents);
    const dispatcher = new SofieDispatcher(undefined, session);
    const tools: string[] = [];
    const result = await dispatcher.dispatch("find that email", { eveWebVoice: true }, [], (tool) => tools.push(tool));
    expect(session.send).toHaveBeenCalledWith("find that email", { clientContext: { eveWebVoice: true } });
    expect(tools).toEqual(["email_search"]);
    expect(result.reply).toBe("Found it.");
    expect(result.busy).toBeUndefined();
    expect(result.events.map((event) => event.type)).toContain("session.waiting");
    expect(dispatcher.sessionId).toBe("session-next");
  });

  it("sends attachments as file parts alongside the request", async () => {
    const session = fakeSession(happyEvents);
    const dispatcher = new SofieDispatcher(undefined, session);
    await dispatcher.dispatch("what is this?", { eveWebVoice: true }, [
      { id: "1", name: "shot.png", mediaType: "image/png", size: 10, dataUrl: "data:image/png;base64,AAAA" },
    ]);
    expect(session.send).toHaveBeenCalledWith([
        { type: "text", text: "what is this?" },
        { type: "file", data: "data:image/png;base64,AAAA", mediaType: "image/png", filename: "shot.png" },
      ], { clientContext: { eveWebVoice: true } });
  });

  it("still sends a plain string when there are no attachments", async () => {
    const session = fakeSession(happyEvents);
    const dispatcher = new SofieDispatcher(undefined, session);
    await dispatcher.dispatch("hello", {});
    expect(session.send).toHaveBeenCalledWith("hello", { clientContext: {} });
  });

  it("rejects overlapping dispatches with a busy result", async () => {
    const session = fakeSession(happyEvents, 5);
    const dispatcher = new SofieDispatcher(undefined, session);
    const first = dispatcher.dispatch("one", {});
    const second = await dispatcher.dispatch("two", {});
    expect(second.busy).toBe(true);
    await first;
    expect(dispatcher.busy).toBe(false);
  });

  it("sends input responses via answer()", async () => {
    const session = fakeSession(happyEvents);
    const dispatcher = new SofieDispatcher(undefined, session);
    await dispatcher.answer([{ requestId: "r1", optionId: "approve" }]);
    expect(session.respond).toHaveBeenCalledWith([{ requestId: "r1", optionId: "approve" }]);
  });

  it("surfaces send failures as a failure outcome", async () => {
    const session = { cancel: vi.fn(async () => ({})), state: { sessionId: "failed-session", streamIndex: 0 }, respond: vi.fn(), send: vi.fn(async () => { throw new Error("network down"); }) };
    const dispatcher = new SofieDispatcher(undefined, session);
    const result = await dispatcher.dispatch("x", {});
    expect(result.failure).toContain("network down");
    expect(dispatcher.busy).toBe(false);
  });

  it("cancels a running turn and reports when nothing is running", async () => {
    const session = fakeSession(happyEvents, 5);
    const dispatcher = new SofieDispatcher(undefined, session);
    expect(await dispatcher.cancel()).toBe(false); // nothing in flight yet
    const running = dispatcher.dispatch("long task", {});
    expect(await dispatcher.cancel()).toBe(true);
    expect(session.cancel).toHaveBeenCalledTimes(1);
    await running;
  });
});
