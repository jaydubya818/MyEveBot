import { db } from "../agent/lib/receipts-db.ts";
import { addGoalTaskDependency, createGoal, createGoalTask, getGoal } from "../lib/goals.ts";
import { createOutcome, updateOutcomeFeedback } from "../lib/outcomes.ts";
import { updateReviewDeliveryPreferences } from "../lib/review-delivery-db.ts";
import { generateProgressReviewCheckpoint } from "../lib/reviews.ts";

if (process.env.MYEVE_E2E_SEED !== "1") {
  throw new Error("Refusing to seed without MYEVE_E2E_SEED=1. Use only with an isolated qualification database.");
}

const ownerId = process.env.MYEVE_OWNER_ID?.trim() || "owner";
const timezone = process.env.OWNER_TIMEZONE?.trim() || "America/Los_Angeles";
const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1_000).toISOString();
const goal = await createGoal({
  ownerId,
  title: "Qualify proactive review delivery",
  description: "Seeded non-empty browser qualification fixture.",
  priority: "critical",
  targetDate: tomorrow.slice(0, 10),
  successCriteria: ["Daily Brief and Weekly Review are visible", "Delivery policy saves"],
  source: "agent",
  idempotencyKey: "phase3-review-e2e-goal",
});

const current = await getGoal(ownerId, goal.id);
if (!current?.tasks.some((task) => task.title === "Verify owner-local schedule")) {
  await createGoalTask(ownerId, goal.id, {
    title: "Verify owner-local schedule",
    status: "ready",
    priority: "critical",
    dueAt: tomorrow,
  });
}
if (!current?.tasks.some((task) => task.title === "Record completed qualification step")) {
  const completed = await createGoalTask(ownerId, goal.id, {
    title: "Record completed qualification step",
    status: "completed",
    priority: "normal",
  });
  await db().query(
    "UPDATE goal_tasks SET completed_at = now() - interval '1 day' WHERE id = $1",
    [completed.id],
  );
}

const blockedGoal = await createGoal({
  ownerId,
  title: "Resolve the blocked delivery dependency",
  description: "Seeded dependency risk fixture.",
  priority: "high",
  source: "agent",
  idempotencyKey: "phase3-review-e2e-blocked-goal",
});
const blockedCurrent = await getGoal(ownerId, blockedGoal.id);
let prerequisite = blockedCurrent?.tasks.find((task) => task.title === "Provide owner approval") ?? null;
if (prerequisite === null) {
  prerequisite = await createGoalTask(ownerId, blockedGoal.id, {
    title: "Provide owner approval",
    status: "waiting",
    priority: "high",
    assignedTo: "owner",
  });
}
let dependent = blockedCurrent?.tasks.find((task) => task.title === "Send the configured review") ?? null;
if (dependent === null) {
  dependent = await createGoalTask(ownerId, blockedGoal.id, {
    title: "Send the configured review",
    status: "todo",
    priority: "high",
  });
}
if (!dependent.dependencyIds.includes(prerequisite.id)) {
  await addGoalTaskDependency(ownerId, blockedGoal.id, dependent.id, prerequisite.id);
}

const outcome = await createOutcome({
  ownerId,
  goalId: goal.id,
  status: "partially_successful",
  summary: "The deterministic review loop is ready for browser qualification.",
  rationale: ["Scheduled delivery still needs a fresh-preview check."],
  idempotencyKey: "phase3-review-e2e-outcome",
  source: "agent",
});
await updateOutcomeFeedback(ownerId, outcome.id, "helpful");

await updateReviewDeliveryPreferences(ownerId, {
  ownerTimezone: timezone,
  dailyBriefEnabled: true,
  dailyBriefTime: "08:00",
  weeklyReviewEnabled: true,
  weeklyReviewDay: 0,
  weeklyReviewTime: "19:00",
  quietHoursEnabled: true,
  quietHoursStart: "22:00",
  quietHoursEnd: "07:00",
  preferredDeliveryChannel: "in_app",
  maxProactivePushesPerDay: 2,
});
await generateProgressReviewCheckpoint(ownerId, "daily", { timezone, reuse: false });
await generateProgressReviewCheckpoint(ownerId, "weekly", { timezone, reuse: false });

console.log(`Seeded Phase 3 review fixture for owner '${ownerId}' in ${timezone}.`);
