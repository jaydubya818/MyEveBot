import { describe, expect, it } from "vitest";
import type { HandleMessageStreamEvent } from "eve/client";
import { reconcileChatSession } from "./chat-session";
const started = { type: "session.started", data: {}, meta: { at: "2026-09-20T00:00:00Z" } } as HandleMessageStreamEvent;
const received = { type: "message.received", data: { message: "Hello", turnId: "turn_0", sequence: 0 }, meta: { at: "2026-09-20T00:00:01Z" } } as HandleMessageStreamEvent;
const waiting = { type: "session.waiting", data: { continuationToken: "fresh", wait: "next-user-message" }, meta: { at: "2026-09-20T00:00:02Z" } } as HandleMessageStreamEvent;
describe("saved chat stream cursor", () => {
  it("advances an old cursor past the already-rendered turn", () => {
    const fixed = reconcileChatSession({ events: [started, received, waiting], session: { sessionId: "s", streamIndex: 1, continuationToken: "old" } });
    expect(fixed.session).toEqual({ sessionId: "s", streamIndex: 3, continuationToken: "fresh" });
  });
  it("removes replayed events even when JSONB reordered object keys", () => {
    const replay = { meta: received.meta, data: { sequence: 0, turnId: "turn_0", message: "Hello" }, type: received.type } as HandleMessageStreamEvent;
    const fixed = reconcileChatSession({ events: [started, received, waiting, replay, waiting], session: { sessionId: "s", streamIndex: 3 } });
    expect(fixed.events).toHaveLength(3);
    expect(fixed.session.streamIndex).toBe(3);
  });
  it("keeps repeated prompts in distinct turns", () => {
    const second = { ...received, data: { message: "Hello", turnId: "turn_1", sequence: 1 }, meta: { at: "2026-09-20T00:01:00Z" } } as HandleMessageStreamEvent;
    expect(reconcileChatSession({ events: [started, received, waiting, second], session: { sessionId: "s", streamIndex: 3 } }).events).toHaveLength(4);
  });
  it("counts from the current session rather than older conversation history", () => {
    const next = { ...started, meta: { at: "2026-09-21T00:00:00Z" } };
    expect(reconcileChatSession({ events: [started, received, waiting, next], session: { sessionId: "new", streamIndex: 0 } }).session.streamIndex).toBe(1);
  });
  it("does not guess a cursor from partial logs or resurrect terminal sessions", () => {
    const partial = { events: [received], session: { sessionId: "s", streamIndex: 50 } };
    expect(reconcileChatSession(partial)).toBe(partial);
    const ended = { events: [started, waiting], session: { streamIndex: 0 } };
    expect(reconcileChatSession(ended)).toBe(ended);
  });
});
