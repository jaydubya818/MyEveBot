import assert from "node:assert/strict";
import test from "node:test";

import { latestTurnFailed, latestTurnContextLimit } from "../app/chat-turn-failure.ts";

const started = (turnId) => ({ type: "turn.started", data: { turnId, sequence: 1 } });
const received = (turnId) => ({ type: "message.received", data: { turnId, sequence: 2, message: "hi sofie", parts: [], kind: "message" } });
const failed = (turnId) => ({ type: "turn.failed", data: { turnId, sequence: 3, code: "MODEL_UNAVAILABLE", message: "internal provider detail" } });

test("context-limit recovery follows only the current failure and survives reconnect", () => {
  const limit = failed("turn-1");
  limit.data.message = "Error: EXTERNAL_ALPHA_CONTEXT_BOUND";
  assert.equal(latestTurnContextLimit([limit, {type:"session.waiting"}]), true);
  assert.equal(latestTurnContextLimit([limit, started("turn-2")]), false);
  assert.equal(latestTurnContextLimit([failed("turn-1")]), false);
});

test("a failed turn stays visible when the reusable session returns to waiting", () => {
  const events = [started("turn-1"), received("turn-1"), failed("turn-1"), { type: "session.waiting", data: { wait: "next-user-message" } }];
  assert.equal(latestTurnFailed(events), true);
});

test("a later turn clears the prior failure as soon as it starts", () => {
  const events = [started("turn-1"), failed("turn-1"), { type: "session.waiting" }, started("turn-2")];
  assert.equal(latestTurnFailed(events), false);
});

test("a later completed turn does not show an earlier failure", () => {
  const events = [started("turn-1"), failed("turn-1"), started("turn-2"), { type: "turn.completed", data: { turnId: "turn-2", sequence: 4 } }];
  assert.equal(latestTurnFailed(events), false);
});

test("a new user message also clears a prior failure in a partial replay", () => {
  const events = [started("turn-1"), failed("turn-1"), received("turn-2")];
  assert.equal(latestTurnFailed(events), false);
});

test("a waiting session without a failed turn has no failure card", () => {
  assert.equal(latestTurnFailed([started("turn-1"), { type: "session.waiting" }]), false);
});
