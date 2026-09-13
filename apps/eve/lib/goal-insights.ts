import { rankFocusCandidates } from "./goal-focus.ts";
import type { GoalDetailView, GoalTaskView } from "./goal-types.ts";
import type { OutcomeView } from "./outcome-types.ts";
import type {
  DailyBriefView,
  ReviewRecommendation,
  ReviewRisk,
  ReviewWorkItem,
  WeeklyReviewView,
} from "./review-types.ts";

const DAY_MS = 86_400_000;
const TERMINAL_TASKS = new Set(["completed", "cancelled"]);

function daysUntil(value: string, now: Date): number | null {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? Math.ceil((timestamp - now.getTime()) / DAY_MS) : null;
}

function item(goal: GoalDetailView, task: GoalTaskView | null, at: string | null): ReviewWorkItem {
  return {
    goalId: goal.id,
    goalTitle: goal.title,
    taskId: task?.id ?? null,
    taskTitle: task?.title ?? null,
    priority: task?.priority ?? goal.priority,
    at,
  };
}

function risk(
  goal: GoalDetailView,
  task: GoalTaskView | null,
  reason: ReviewRisk["reason"],
  severity: ReviewRisk["severity"],
  explanation: string,
): ReviewRisk {
  return {
    goalId: goal.id,
    goalTitle: goal.title,
    taskId: task?.id ?? null,
    taskTitle: task?.title ?? null,
    reason,
    severity,
    explanation,
  };
}

export function detectGoalRisks(
  goals: readonly GoalDetailView[],
  now = new Date(),
): ReviewRisk[] {
  const risks: ReviewRisk[] = [];
  for (const goal of goals) {
    if (["completed", "abandoned", "archived", "draft", "paused"].includes(goal.status)) continue;
    const goalDays = goal.targetDate === null ? null : daysUntil(goal.targetDate, now);
    if (goalDays !== null && goalDays < 0) {
      risks.push(risk(goal, null, "deadline_overdue", "critical", "The goal target date has passed."));
    } else if (goalDays !== null && goalDays <= 7) {
      risks.push(risk(goal, null, "deadline_approaching", "warning", `The goal is due in ${goalDays} day${goalDays === 1 ? "" : "s"}.`));
    }

    for (const task of goal.tasks) {
      if (TERMINAL_TASKS.has(task.status)) continue;
      const taskDays = task.dueAt === null ? null : daysUntil(task.dueAt, now);
      if (taskDays !== null && taskDays < 0) {
        risks.push(risk(goal, task, "deadline_overdue", "critical", "This unfinished task is overdue."));
      } else if (taskDays !== null && taskDays <= 3) {
        risks.push(risk(goal, task, "deadline_approaching", "warning", `This task is due in ${taskDays} day${taskDays === 1 ? "" : "s"}.`));
      }
      if (task.priority === "critical") {
        risks.push(risk(goal, task, "unfinished_critical_task", "warning", "A critical task is unfinished."));
      }
      if (task.unavailableCapabilities.length > 0) {
        risks.push(risk(goal, task, "capability_unavailable", "critical", `Unavailable: ${task.unavailableCapabilities.join(", ")}.`));
      }
      if (
        task.blockedByDependencies &&
        (task.status === "in_progress" || task.priority === "high" || task.priority === "critical" || (taskDays !== null && taskDays <= 7))
      ) {
        risks.push(risk(goal, task, "dependency_incomplete", "warning", "An unfinished dependency prevents this task from moving forward."));
      }
    }

    const lastProgressAt = Math.max(
      new Date(goal.updatedAt).getTime(),
      ...goal.tasks.map((task) => new Date(task.updatedAt).getTime()),
      ...goal.events.map((event) => new Date(event.occurredAt).getTime()),
    );
    const staleDays = Math.floor((now.getTime() - lastProgressAt) / DAY_MS);
    const activelyExpected =
      goal.priority === "high" ||
      goal.priority === "critical" ||
      goal.tasks.some((task) => task.status === "in_progress") ||
      (goalDays !== null && goalDays <= 30);
    if (goal.status === "blocked" || (goal.tasks.length > 0 && staleDays >= 14 && activelyExpected)) {
      risks.push(risk(
        goal,
        null,
        "no_recent_progress",
        goal.status === "blocked" ? "warning" : "attention",
        goal.status === "blocked" ? "The goal is explicitly blocked." : `No persisted progress was recorded for ${staleDays} days.`,
      ));
    }
  }
  return risks;
}

function allFocus(goals: readonly GoalDetailView[], now: Date) {
  return rankFocusCandidates(
    goals.flatMap((goal) => goal.tasks.map((task) => ({
      goal: { id: goal.id, title: goal.title, status: goal.status, priority: goal.priority, targetDate: goal.targetDate },
      task,
    }))),
    now,
  );
}

function recommendationsFromFocus(
  focus: ReturnType<typeof allFocus>,
  risks: readonly ReviewRisk[],
  limit: number,
): ReviewRecommendation[] {
  const recommendations: ReviewRecommendation[] = focus.slice(0, limit).map((focusItem) => ({
    title: focusItem.taskTitle,
    goalId: focusItem.goalId,
    taskId: focusItem.taskId,
    whyNow: focusItem.whyNow,
  }));
  for (const current of risks) {
    if (recommendations.length >= limit) break;
    if (recommendations.some((value) => value.taskId === current.taskId && value.goalId === current.goalId)) continue;
    recommendations.push({
      title: current.taskTitle ?? current.goalTitle,
      goalId: current.goalId,
      taskId: current.taskId,
      whyNow: [current.explanation],
    });
  }
  return recommendations;
}

export function buildDailyBrief(goals: readonly GoalDetailView[], now = new Date()): DailyBriefView {
  const periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const periodEnd = new Date(periodStart.getTime() + DAY_MS);
  const risks = detectGoalRisks(goals, now);
  const focus = allFocus(goals, now);
  const activeGoals = goals.filter((goal) => !["archived", "abandoned"].includes(goal.status));
  const tasks = activeGoals.flatMap((goal) => goal.tasks.map((task) => ({ goal, task })));
  const unfinished = tasks.filter(({ task }) => !TERMINAL_TASKS.has(task.status));
  const overdueGoals = activeGoals.filter((goal) => goal.status !== "completed" && goal.targetDate !== null && (daysUntil(goal.targetDate, now) ?? 0) < 0);
  const approachingGoals = activeGoals.filter((goal) => goal.status !== "completed" && goal.targetDate !== null && (daysUntil(goal.targetDate, now) ?? 99) >= 0 && (daysUntil(goal.targetDate, now) ?? 99) <= 7);
  return {
    kind: "daily",
    generatedAt: now.toISOString(),
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    topPriorities: focus.slice(0, 5),
    overdue: [...overdueGoals.map((goal) => item(goal, null, goal.targetDate)), ...unfinished.filter(({ task }) => task.dueAt !== null && (daysUntil(task.dueAt, now) ?? 0) < 0).map(({ goal, task }) => item(goal, task, task.dueAt))],
    approaching: [...approachingGoals.map((goal) => item(goal, null, goal.targetDate)), ...unfinished.filter(({ task }) => task.dueAt !== null && (daysUntil(task.dueAt, now) ?? 99) >= 0 && (daysUntil(task.dueAt, now) ?? 99) <= 3).map(({ goal, task }) => item(goal, task, task.dueAt))],
    blocked: [...activeGoals.filter((goal) => goal.status === "blocked").map((goal) => item(goal, null, goal.targetDate)), ...unfinished.filter(({ task }) => task.status === "blocked" || task.blockedByDependencies || task.unavailableCapabilities.length > 0).map(({ goal, task }) => item(goal, task, task.dueAt))],
    pendingOwnerActions: [...activeGoals.filter((goal) => goal.status === "waiting").map((goal) => item(goal, null, goal.targetDate)), ...unfinished.filter(({ task }) => task.status === "waiting" || task.assignedTo === "owner").map(({ goal, task }) => item(goal, task, task.dueAt))],
    completed: [...goals.filter((goal) => goal.completedAt !== null && new Date(goal.completedAt) >= periodStart).map((goal) => item(goal, null, goal.completedAt)), ...tasks.filter(({ task }) => task.completedAt !== null && new Date(task.completedAt) >= periodStart).map(({ goal, task }) => item(goal, task, task.completedAt))],
    atRisk: risks,
    recommendations: recommendationsFromFocus(focus, risks, 7),
  };
}

export function buildWeeklyReview(
  goals: readonly GoalDetailView[],
  outcomes: readonly OutcomeView[],
  now = new Date(),
): WeeklyReviewView {
  const periodEnd = new Date(now);
  const periodStart = new Date(now.getTime() - 7 * DAY_MS);
  const risks = detectGoalRisks(goals, now);
  const tasks = goals.flatMap((goal) => goal.tasks.map((task) => ({ goal, task })));
  const withinPeriod = (value: string | null) => value !== null && new Date(value) >= periodStart && new Date(value) <= periodEnd;
  return {
    kind: "weekly",
    generatedAt: now.toISOString(),
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    progress: goals.filter((goal) => !["archived", "abandoned"].includes(goal.status)).map((goal) => ({ goalId: goal.id, goalTitle: goal.title, progress: goal.progress })),
    completedGoals: goals.filter((goal) => withinPeriod(goal.completedAt)).map((goal) => item(goal, null, goal.completedAt)),
    completedTasks: tasks.filter(({ task }) => withinPeriod(task.completedAt)).map(({ goal, task }) => item(goal, task, task.completedAt)),
    stalled: risks.filter((value) => value.reason === "no_recent_progress"),
    blockers: risks.filter((value) => ["dependency_incomplete", "capability_unavailable", "unfinished_critical_task"].includes(value.reason)),
    missedCommitments: tasks.filter(({ task }) => !TERMINAL_TASKS.has(task.status) && task.dueAt !== null && (daysUntil(task.dueAt, now) ?? 0) < 0).map(({ goal, task }) => item(goal, task, task.dueAt)),
    outcomes: outcomes.filter((outcome) => withinPeriod(outcome.occurredAt)),
    proposedPriorities: recommendationsFromFocus(allFocus(goals, now), risks, 7),
  };
}
