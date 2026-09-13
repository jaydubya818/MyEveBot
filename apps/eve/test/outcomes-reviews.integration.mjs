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
    await updateOutcomeFeedback(ownerId, recorded.id, "helpful");
    const feedbackEvents = await db().query(
      "SELECT id FROM eve_events WHERE owner_id = $1 AND type = 'OUTCOME_FEEDBACK_UPDATED' AND source_id = $2",
      [ownerId, recorded.id],
    );
    assert.equal(feedbackEvents.length, 1);
    assert.equal((await listOutcomes(`not-${ownerId}`)).length, 0);

    const unrelatedGoal = await createGoal({ ownerId, title: "Unrelated lineage", source: "test" });
    const unrelatedTask = await createGoalTask(ownerId, unrelatedGoal.id, {
      title: "Unrelated task",
      status: "ready",
    });
    await assert.rejects(
      createOutcome({
        ownerId,
        goalId: goal.id,
        goalTaskId: unrelatedTask.id,
        status: "unknown",
        summary: "Mismatched goal and task links must be rejected.",
        idempotencyKey: `outcome-${randomUUID()}`,
      }),
      /does not belong/i,
    );
    const unrelatedEvents = await db().query(
      "SELECT id FROM eve_events WHERE owner_id = $1 AND goal_id = $2 ORDER BY occurred_at LIMIT 1",
      [ownerId, unrelatedGoal.id],
    );
    await assert.rejects(
      createOutcome({
        ownerId,
        goalId: goal.id,
        status: "unknown",
        summary: "Mismatched evidence must be rejected.",
        evidence: [{ type: "event", id: String(unrelatedEvents[0].id) }],
      }),
      /lineage/i,
    );

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
