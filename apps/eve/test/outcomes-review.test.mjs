import assert from "node:assert/strict";
import test from "node:test";

import { buildDailyBrief, buildWeeklyReview, detectGoalRisks } from "../lib/goal-insights.ts";
import { DELIVERY_CLASSIFICATIONS, OUTCOME_STATUSES, OWNER_FEEDBACK_VALUES } from "../lib/outcome-types.ts";

function goal(overrides = {}) {
  const base = {
    id: "goal_1", title: "Launch", description: "", motivation: "", status: "active", priority: "high",
    planningMode: "simple", successCriteria: [], targetDate: "2026-09-15", source: "test", sourceReference: null,
    startedAt: "2026-09-01T00:00:00.000Z", completedAt: null, archivedAt: null,
    createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-12T00:00:00.000Z", progress: 0,
    taskCount: 1, completedTaskCount: 0, plans: [], milestones: [], threadIds: [], events: [], linkedRunIds: [], nextAction: null,
    tasks: [{
      id: "task_1", goalId: "goal_1", milestoneId: null, parentTaskId: null, title: "Ship preview", description: "",
      status: "ready", priority: "critical", dueAt: "2026-09-13T12:00:00.000Z", assignedTo: null,
      requiredCapabilities: [], successCriteria: [], estimatedEffortMinutes: null, estimatedCostUsd: null, position: 0,
      startedAt: null, completedAt: null, createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-12T00:00:00.000Z",
      dependencyIds: [], blockedByDependencies: false, unavailableCapabilities: [],
    }],
  };
  return { ...base, ...overrides };
}

test("outcome and notification policy vocabularies are explicit", () => {
  assert.deepEqual(OUTCOME_STATUSES, ["successful", "partially_successful", "blocked", "failed", "abandoned", "ineffective", "unknown"]);
  assert.deepEqual(OWNER_FEEDBACK_VALUES, ["helpful", "neutral", "unhelpful", "unknown"]);
  assert.deepEqual(DELIVERY_CLASSIFICATIONS, ["silent", "activity", "digest", "push", "urgent"]);
});

test("daily brief reuses deterministic focus and gives every recommendation a why-now", () => {
  const brief = buildDailyBrief([goal()], new Date("2026-09-12T12:00:00.000Z"));
  assert.equal(brief.topPriorities[0].taskId, "task_1");
  assert.ok(brief.recommendations.length > 0);
  assert.ok(brief.recommendations.every((item) => item.whyNow.length > 0));
  assert.ok(brief.atRisk.some((item) => item.reason === "unfinished_critical_task"));
  assert.ok(brief.approaching.some((item) => item.taskId === "task_1"));
});

test("dependency and unavailable capability risks are deterministic", () => {
  const current = goal();
  current.tasks[0] = { ...current.tasks[0], blockedByDependencies: true, dependencyIds: ["task_0"], unavailableCapabilities: ["computer.browser"] };
  const reasons = detectGoalRisks([current], new Date("2026-09-12T12:00:00.000Z")).map((item) => item.reason);
  assert.ok(reasons.includes("dependency_incomplete"));
  assert.ok(reasons.includes("capability_unavailable"));
});

test("long-horizon normal goals are not flagged solely for inactivity", () => {
  const quiet = goal({
    priority: "normal",
    targetDate: "2027-09-12",
    updatedAt: "2026-01-01T00:00:00.000Z",
    tasks: [{ ...goal().tasks[0], priority: "normal", status: "todo", dueAt: null, updatedAt: "2026-01-01T00:00:00.000Z" }],
  });
  assert.equal(detectGoalRisks([quiet], new Date("2026-09-12T12:00:00.000Z")).some((item) => item.reason === "no_recent_progress"), false);
});

test("explicitly blocked goals surface even before they have tasks", () => {
  const blocked = goal({ status: "blocked", tasks: [], taskCount: 0, targetDate: null });
  const brief = buildDailyBrief([blocked], new Date("2026-09-12T12:00:00.000Z"));
  assert.ok(brief.blocked.some((item) => item.goalId === blocked.id && item.taskId === null));
  assert.ok(brief.atRisk.some((item) => item.goalId === blocked.id && item.reason === "work_blocked"));
  assert.equal(brief.atRisk.some((item) => item.goalId === blocked.id && item.reason === "no_recent_progress"), false);
});

test("a task that just became overdue is not also described as approaching", () => {
  const current = goal({
    targetDate: null,
    tasks: [{ ...goal().tasks[0], dueAt: "2026-09-12T11:59:59.000Z" }],
  });
  const brief = buildDailyBrief([current], new Date("2026-09-12T12:00:00.000Z"));
  assert.ok(brief.overdue.some((item) => item.taskId === "task_1"));
  assert.equal(brief.approaching.some((item) => item.taskId === "task_1"), false);
  assert.ok(brief.atRisk.some((item) => item.taskId === "task_1" && item.reason === "deadline_overdue"));
});

test("paused and draft work do not create current or missed commitments", () => {
  const paused = goal({ id: "goal_paused", status: "paused" });
  const draft = goal({ id: "goal_draft", status: "draft" });
  const now = new Date("2026-09-14T12:00:00.000Z");
  const daily = buildDailyBrief([paused, draft], now);
  const weekly = buildWeeklyReview([paused, draft], [], now);
  assert.equal(daily.overdue.length, 0);
  assert.equal(daily.blocked.length, 0);
  assert.equal(daily.pendingOwnerActions.length, 0);
  assert.equal(weekly.missedCommitments.length, 0);
});

test("blocked and failed tasks appear as explicit weekly blockers", () => {
  const current = goal({
    tasks: [
      { ...goal().tasks[0], id: "task_blocked", status: "blocked", priority: "normal", dueAt: null },
      { ...goal().tasks[0], id: "task_failed", status: "failed", priority: "normal", dueAt: null },
    ],
  });
  const weekly = buildWeeklyReview([current], [], new Date("2026-09-12T12:00:00.000Z"));
  assert.ok(weekly.blockers.some((item) => item.taskId === "task_blocked" && item.reason === "work_blocked"));
  assert.ok(weekly.blockers.some((item) => item.taskId === "task_failed" && item.reason === "task_failed"));
});

test("weekly review only reports outcomes in its period", () => {
  const review = buildWeeklyReview([goal()], [{
    id: "outcome_1", goalId: "goal_1", goalTaskId: "task_1", runId: null, status: "partially_successful",
    ownerFeedback: "unknown", summary: "Preview worked; conversion is not yet known", rationale: [], evidence: [],
    occurredAt: "2026-09-10T12:00:00.000Z", createdAt: "2026-09-10T12:00:00.000Z", updatedAt: "2026-09-10T12:00:00.000Z",
  }], new Date("2026-09-12T12:00:00.000Z"));
  assert.equal(review.outcomes.length, 1);
  assert.ok(review.proposedPriorities.every((item) => item.whyNow.length > 0));
});
