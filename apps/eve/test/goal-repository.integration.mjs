import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { db } from "../agent/lib/receipts-db.ts";
import {
  addGoalTaskDependency,
  createGoal,
  createGoalMilestone,
  createGoalPlan,
  createGoalTask,
  getFocus,
  getGoal,
  listGoals,
  transitionGoal,
  transitionGoalTask,
  updateGoal,
} from "../lib/goals.ts";

const configured = Boolean(process.env.DATABASE_URL?.trim());

test("goal repository persists a dependency-aware lifecycle and immutable events", { skip: !configured }, async () => {
  const ownerId = `test-owner-${randomUUID()}`;
  try {
    const idempotencyKey = `fixture-${randomUUID()}`;
    const goal = await createGoal({
      ownerId,
      title: "Prepare for Adobe interview",
      description: "Repository integration fixture",
      priority: "high",
      planningMode: "structured",
      successCriteria: ["Complete a scored mock interview"],
      targetDate: "2026-10-01",
      source: "test",
      idempotencyKey,
    });
    assert.equal(goal.status, "active");

    const duplicate = await createGoal({
      ownerId,
      title: "Ignored duplicate title",
      idempotencyKey,
    });
    assert.equal(duplicate.id, goal.id);

    const plan = await createGoalPlan(ownerId, goal.id, {
      summary: "Build the story bank, rehearse, and close gaps.",
      strategy: "Start with the most likely interview loop.",
    });
    assert.equal(plan.version, 1);

    const milestone = await createGoalMilestone(ownerId, goal.id, {
      title: "Interview-ready story bank",
      position: 0,
    });
    const research = await createGoalTask(ownerId, goal.id, {
      title: "Research the role and interview loop",
      milestoneId: milestone.id,
      status: "ready",
      priority: "high",
    });
    const mock = await createGoalTask(ownerId, goal.id, {
      title: "Run a scored mock interview",
      milestoneId: milestone.id,
      status: "todo",
      priority: "high",
    });
    await addGoalTaskDependency(ownerId, goal.id, mock.id, research.id);

    const blockedDetail = await getGoal(ownerId, goal.id);
    assert.equal(blockedDetail?.tasks.find((item) => item.id === mock.id)?.blockedByDependencies, true);
    assert.equal((await getFocus(ownerId, 10))[0]?.taskId, research.id);

    await assert.rejects(
      transitionGoalTask(ownerId, goal.id, mock.id, "in_progress", "agent", "too early"),
      /dependencies/i,
    );
    await transitionGoalTask(ownerId, goal.id, research.id, "completed", "agent", "Research captured.");
    await transitionGoalTask(ownerId, goal.id, mock.id, "in_progress", "agent", "Dependency cleared.");
    await transitionGoalTask(ownerId, goal.id, mock.id, "completed", "owner", "Mock passed.");
    const completed = await transitionGoal(ownerId, goal.id, "completed", "owner", "Success criteria met.");
    assert.equal(completed.progress, 100);
    assert.equal(completed.events.some((event) => event.type === "GOAL_STATUS_CHANGED"), true);
    assert.equal((await listGoals(ownerId, { status: "completed" }))[0]?.id, goal.id);
    await assert.rejects(
      createGoalTask(ownerId, goal.id, { title: "Late structural mutation" }),
      /cannot be structurally changed/i,
    );

    const renamed = await updateGoal(ownerId, goal.id, { title: "Adobe interview preparation complete" });
    assert.equal(renamed.title, "Adobe interview preparation complete");
  } finally {
    if (configured) await db().query("DELETE FROM goals WHERE owner_id = $1", [ownerId]);
  }
});
