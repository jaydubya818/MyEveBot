import type { GoalSummaryView } from "../goal-types.ts";
import type { DailyBriefView, ReviewWorkItem } from "../review-types.ts";
import type { GoalWorkQueries } from "./projections.ts";
type Today = Awaited<ReturnType<GoalWorkQueries["today"]>>;
type Brief = Awaited<ReturnType<GoalWorkQueries["brief"]>>;
type Goal = Awaited<ReturnType<GoalWorkQueries["goal"]>>;
export interface AttentionPage {
  version: "myeve.attention.v1";
  nextCursor: string | null;
  items: Array<{
    id: string;
    ownerId: string;
    title: string;
    needsYou: boolean;
    availableActions: string[];
    action: { prompt: string; options: string[] } | null;
  }>;
}
/** Browser-safe composition. Decisions come from canonical Inbox predicates;
 * informational waiting never becomes a fabricated approval. */
export function composeToday(
  ownerId: string,
  today: Today,
  inbox: AttentionPage,
) {
  if (inbox.items.some((i) => i.ownerId !== ownerId))
    throw new Error("Inbox scope mismatch");
  return {
    version: "myeve.goal-experience.v1",
    activeGoals: today.goals
      .filter((g) => g.status === "active")
      .map((g) => ({
        id: g.id,
        objective: g.objective,
        progress: `${g.progress.completedOutcomes} of ${g.progress.requiredOutcomes} required outcomes complete`,
      })),
    doing: today.doing.map((w) => ({
      workId: w.id,
      goalId: w.goalId,
      title:
        today.goals
          .find((g) => g.id === w.goalId)
          ?.tasks.find((t) => t.id === w.taskId)?.objective ??
        "Work in progress",
    })),
    canProceed: today.canProceed.map((t) => ({
      goalId: t.goalId,
      taskId: t.id,
      title: t.objective,
      nextAction: "Ready to start",
    })),
    waiting: today.blocked.map((t) => ({
      goalId: t.goalId,
      taskId: t.id,
      title: t.objective,
      reason:
        t.dependencies
          .filter((d) => !d.satisfied)
          .map((d) => d.label)
          .join("; ") || "Work needs review",
      nextAction: t.nextAction,
    })),
    needsYou: inbox.items
      .filter((i) => i.needsYou)
      .map((i) => ({
        id: i.id,
        prompt: i.action?.prompt ?? i.title,
        options: i.action?.options ?? [],
        availableActions: i.availableActions,
      })),
    completed: today.recentlyCompleted.map((t) => ({
      goalId: t.goalId,
      taskId: t.id,
      title: t.objective,
      at: t.completedAt,
    })),
    nextGoalCursor: today.nextCursor,
    nextInboxCursor: inbox.nextCursor,
  };
}
/** Candidate ed0f6b5 still expects this legacy envelope. Outcome percent has an
 * explicit criterion denominator; integration must label it accordingly. */
export function betaGoal(goal: Goal): GoalSummaryView {
  return {
    id: goal.id,
    title: goal.objective,
    description: goal.objective,
    motivation: "",
    status: goal.status,
    priority: goal.priority,
    planningMode: goal.plan ? "structured" : "simple",
    successCriteria: goal.successCriteria,
    targetDate: goal.target?.slice(0, 10) ?? null,
    source: "goal-work",
    sourceReference: null,
    startedAt: goal.createdAt,
    completedAt: goal.completedAt,
    archivedAt: goal.archivedAt,
    createdAt: goal.createdAt!,
    updatedAt: goal.updatedAt!,
    progress: goal.progress.requiredOutcomes
      ? Math.round(
          (goal.progress.completedOutcomes * 100) /
            goal.progress.requiredOutcomes,
        )
      : 0,
    taskCount: goal.progress.requiredTasks,
    completedTaskCount: goal.progress.completedTasks,
  };
}
export function composeBrief(brief: Brief) {
  const goals = new Map(brief.current.goals.map((g) => [g.id, g]));
  const work = (
    goalId: string,
    taskId: string | null,
    at: string | null,
  ): ReviewWorkItem => {
    const g = goals.get(goalId),
      task = g?.tasks.find((t) => t.id === taskId);
    return {
      goalId,
      goalTitle: g?.objective ?? "Goal update",
      taskId,
      taskTitle: task?.objective ?? null,
      priority: task?.priority ?? g?.priority ?? "normal",
      at,
    };
  };
  const review: DailyBriefView = {
    kind: "daily",
    generatedAt: brief.until,
    periodStart: brief.since,
    periodEnd: brief.until,
    topPriorities: brief.current.canProceed.slice(0, 5).map((t) => ({
      goalId: t.goalId,
      goalTitle: goals.get(t.goalId)?.objective ?? "Goal",
      taskId: t.id,
      taskTitle: t.objective,
      priority: t.priority,
      dueAt: t.dueAt,
      estimatedEffortMinutes: null,
      whyNow: ["Dependencies are satisfied"],
    })),
    overdue: [],
    approaching: [],
    blocked: brief.current.blocked.map((t) => work(t.goalId, t.id, null)),
    pendingOwnerActions: brief.current.needsYou.map((t) =>
      work(t.goalId, t.taskId, null),
    ),
    completed: brief.completed.map((e) => work(e.goalId, e.taskId, e.at)),
    atRisk: [],
    recommendations: [],
  };
  for (const g of brief.current.goals)
    for (const t of g.tasks) {
      if (!t.dueAt || ["completed", "cancelled"].includes(t.status)) continue;
      if (Date.parse(t.dueAt) < Date.parse(brief.until))
        review.overdue.push(work(g.id, t.id, t.dueAt));
      else if (Date.parse(t.dueAt) <= Date.parse(brief.until) + 7 * 86400000)
        review.approaching.push(work(g.id, t.id, t.dueAt));
    }
  return {
    review,
    details: {
      goalProgressChanges: brief.progressChanges,
      completedTasks: brief.completed,
      completedWork: brief.completed
        .filter((e) => e.type === "TASK_COMPLETED")
        .map((e) => ({
          goalId: e.goalId,
          taskId: e.taskId,
          workId: e.references.workId,
          resultId: e.references.resultId,
        })),
      newBlockers: brief.newBlockers,
      dependenciesCleared: brief.changes.filter((e) =>
        ["DEPENDENCY_CLEARED", "OWNER_DECISION"].includes(e.type),
      ),
      needsYou: brief.needsYou,
      newlyEligibleTasks: brief.newlyEligible,
      upcomingScheduledDependencies: brief.upcoming,
      nextChangeCursor: brief.nextCursor,
      nextGoalCursor: brief.current.nextCursor,
    },
  };
}
