import assert from "node:assert/strict";
import test from "node:test";

import { rankFocusCandidates } from "../lib/goal-focus.ts";
import {
  calculateProgress,
  canTransitionGoal,
  canTransitionGoalTask,
} from "../lib/goal-types.ts";

function task(overrides = {}) {
  return {
    id: "task_default",
    goalId: "goal_default",
    milestoneId: null,
    parentTaskId: null,
    title: "Default task",
    description: "",
    status: "ready",
    priority: "normal",
    dueAt: null,
    assignedTo: null,
    requiredCapabilities: [],
    successCriteria: [],
    estimatedEffortMinutes: null,
    estimatedCostUsd: null,
    position: 0,
    startedAt: null,
    completedAt: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    dependencyIds: [],
    blockedByDependencies: false,
    unavailableCapabilities: [],
    ...overrides,
  };
}

test("goal and task transitions require explicit recovery paths", () => {
  assert.equal(canTransitionGoal("draft", "active"), true);
  assert.equal(canTransitionGoal("paused", "active"), true);
  assert.equal(canTransitionGoal("completed", "active"), false);
  assert.equal(canTransitionGoal("archived", "active"), false);
  assert.equal(canTransitionGoalTask("failed", "ready"), true);
  assert.equal(canTransitionGoalTask("completed", "in_progress"), false);
  assert.equal(canTransitionGoalTask("cancelled", "ready"), false);
});

test("progress excludes cancelled work and remains derived", () => {
  assert.deepEqual(
    calculateProgress([
      { status: "completed" },
      { status: "ready" },
      { status: "cancelled" },
    ]),
    { progress: 50, taskCount: 2, completedTaskCount: 1 },
  );
  assert.deepEqual(calculateProgress([]), { progress: 0, taskCount: 0, completedTaskCount: 0 });
});

test("focus ranking excludes blocked work and explains the winner", () => {
  const now = new Date("2026-09-12T12:00:00.000Z");
  const candidates = [
    {
      goal: { id: "goal_1", title: "Interview", status: "active", priority: "high", targetDate: "2026-09-13" },
      task: task({ id: "task_design", title: "System design prep", priority: "high", dueAt: "2026-09-13T12:00:00.000Z" }),
    },
    {
      goal: { id: "goal_2", title: "Taxes", status: "active", priority: "critical", targetDate: null },
      task: task({ id: "task_blocked", title: "File return", priority: "critical", blockedByDependencies: true, dependencyIds: ["task_docs"] }),
    },
    {
      goal: { id: "goal_3", title: "Research", status: "active", priority: "normal", targetDate: null },
      task: task({ id: "task_browser", title: "Research options", requiredCapabilities: ["computer.browser"], unavailableCapabilities: ["computer.browser"] }),
    },
  ];
  const ranked = rankFocusCandidates(candidates, now);
  assert.deepEqual(ranked.map((item) => item.taskId), ["task_design"]);
  assert.deepEqual(ranked[0].whyNow, ["High priority task", "Due tomorrow", "High priority goal"]);
});
