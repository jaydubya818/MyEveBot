import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { db } from "../agent/lib/receipts-db.ts";
import { createGoal, createGoalTask } from "../lib/goals.ts";
import { createOutcome, listOutcomes, updateOutcomeFeedback } from "../lib/outcomes.ts";
import { generateProgressReview } from "../lib/reviews.ts";

const configured = Boolean(process.env.DATABASE_URL?.trim());

test("outcomes and reviews preserve owner scope, lineage, and checkpoints", { skip: !configured }, async () => {
  const ownerId = `test-owner-${randomUUID()}`;
  try {
    const goal = await createGoal({ ownerId, title: "Qualify Phase 2", priority: "high", source: "test" });
    const task = await createGoalTask(ownerId, goal.id, { title: "Run preview checks", status: "ready", priority: "critical" });
    const recorded = await createOutcome({
      ownerId,
      goalId: goal.id,
      goalTaskId: task.id,
      status: "partially_successful",
      summary: "The local flow passed; preview validation remains.",
      rationale: ["Local evidence is not preview evidence."],
      occurredAt: "2026-09-10T12:00:00.000Z",
      idempotencyKey: `outcome-${randomUUID()}`,
      source: "owner",
    });
    assert.equal(recorded.ownerFeedback, "unknown");
    assert.equal(recorded.goalId, goal.id);
    assert.equal(recorded.goalTaskId, task.id);

    const updated = await updateOutcomeFeedback(ownerId, recorded.id, "helpful");
    assert.equal(updated.ownerFeedback, "helpful");
    assert.equal((await listOutcomes(`not-${ownerId}`)).length, 0);

    const daily = await generateProgressReview(ownerId, "daily", { checkpoint: true, now: new Date("2026-09-12T12:00:00.000Z") });
    assert.equal(daily.kind, "daily");
    assert.ok(daily.recommendations.every((item) => item.whyNow.length > 0));
    const weekly = await generateProgressReview(ownerId, "weekly", { checkpoint: true, now: new Date("2026-09-12T12:00:00.000Z") });
    assert.equal(weekly.kind, "weekly");
    assert.equal(weekly.outcomes[0]?.id, recorded.id);

    const checkpoints = await db().query(
      "SELECT review_kind FROM review_checkpoints WHERE owner_id = $1 ORDER BY review_kind",
      [ownerId],
    );
    assert.deepEqual(checkpoints.map((row) => row.review_kind), ["daily", "weekly"]);
  } finally {
    if (configured) {
      await db().query("DELETE FROM review_checkpoints WHERE owner_id = $1", [ownerId]);
      await db().query("DELETE FROM outcomes WHERE owner_id = $1", [ownerId]);
      await db().query("DELETE FROM eve_events WHERE owner_id = $1", [ownerId]);
      await db().query("DELETE FROM goals WHERE owner_id = $1", [ownerId]);
    }
  }
});
