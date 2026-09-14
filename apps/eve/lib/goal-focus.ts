import type { GoalFocusItem, GoalPriority, GoalStatus, GoalTaskView } from "./goal-types.ts";

const PRIORITY_SCORE: Record<GoalPriority, number> = {
  critical: 4,
  high: 3,
  normal: 2,
  low: 1,
};

export interface FocusCandidate {
  goal: {
    id: string;
    title: string;
    status: GoalStatus;
    priority: GoalPriority;
    targetDate: string | null;
  };
  task: GoalTaskView;
}

function dueScore(dueAt: string | null, now: Date): number {
  if (dueAt === null) return 0;
  const due = new Date(dueAt).getTime();
  if (!Number.isFinite(due)) return 0;
  const days = Math.ceil((due - now.getTime()) / 86_400_000);
  if (days < 0) return 500;
  if (days === 0) return 400;
  if (days === 1) return 300;
  if (days <= 7) return 200 - days;
  return 10;
}

function taskScore(candidate: FocusCandidate, now: Date): number {
  const active = candidate.task.status === "in_progress" ? 60 : 0;
  return (
    PRIORITY_SCORE[candidate.task.priority] * 1_000 +
    dueScore(candidate.task.dueAt, now) +
    active +
    PRIORITY_SCORE[candidate.goal.priority] * 20 +
    dueScore(candidate.goal.targetDate, now) / 10
  );
}

function whyNow(candidate: FocusCandidate, now: Date): string[] {
  const reasons: string[] = [];
  if (candidate.task.priority === "critical" || candidate.task.priority === "high") {
    reasons.push(`${candidate.task.priority === "critical" ? "Critical" : "High"} priority task`);
  }
  if (candidate.task.dueAt !== null) {
    const days = Math.ceil((new Date(candidate.task.dueAt).getTime() - now.getTime()) / 86_400_000);
    if (days < 0) reasons.push("Overdue");
    else if (days === 0) reasons.push("Due today");
    else if (days === 1) reasons.push("Due tomorrow");
    else if (days <= 7) reasons.push(`Due in ${days} days`);
  }
  if (candidate.task.status === "in_progress") reasons.push("Already in progress");
  if (candidate.goal.priority === "critical" || candidate.goal.priority === "high") {
    reasons.push(`${candidate.goal.priority === "critical" ? "Critical" : "High"} priority goal`);
  }
  if (candidate.task.dependencyIds.length > 0) reasons.push("All dependencies complete");
  return reasons.length > 0 ? reasons : ["Ready to move this goal forward"];
}

export function rankFocusCandidates(
  candidates: readonly FocusCandidate[],
  now = new Date(),
): GoalFocusItem[] {
  return candidates
    .filter(
      ({ goal, task }) =>
        goal.status === "active" &&
        ["todo", "ready", "in_progress"].includes(task.status) &&
        !task.blockedByDependencies &&
        task.unavailableCapabilities.length === 0,
    )
    .sort((left, right) => {
      const score = taskScore(right, now) - taskScore(left, now);
      if (score !== 0) return score;
      const leftUpdated = new Date(left.task.updatedAt).getTime();
      const rightUpdated = new Date(right.task.updatedAt).getTime();
      if (leftUpdated !== rightUpdated) return leftUpdated - rightUpdated;
      return left.task.id.localeCompare(right.task.id);
    })
    .map(({ goal, task }) => ({
      goalId: goal.id,
      goalTitle: goal.title,
      taskId: task.id,
      taskTitle: task.title,
      priority: task.priority,
      dueAt: task.dueAt,
      estimatedEffortMinutes: task.estimatedEffortMinutes,
      whyNow: whyNow({ goal, task }, now),
    }));
}
