import type { GoalDetailView, GoalSummaryView } from "@/lib/goal-types";
import type { TaskRunView } from "@/lib/task-types";
import type { OutcomeView } from "@/lib/outcome-types";
import type { ApprovalRequestView } from "@/lib/approvals";
import type { DailyBriefView } from "@/lib/review-types";

export type OwnerState =
  | "Working"
  | "Waiting"
  | "Needs you"
  | "Blocked"
  | "Verifying"
  | "Complete"
  | "Recovery"
  | "Stopped"
  | "Unknown";
export type WorkItem = {
  id: string;
  kind: "goal" | "task";
  title: string;
  objective: string;
  state: OwnerState;
  updatedAt: string;
  progress: number | null;
  source: GoalSummaryView | TaskRunView;
};
export interface OwnerSnapshot {
  goals: GoalSummaryView[];
  tasks: TaskRunView[];
  outcomes: OutcomeView[];
  approvals: ApprovalRequestView[];
  brief: DailyBriefView | null;
}
export const emptySnapshot: OwnerSnapshot = {
  goals: [],
  tasks: [],
  outcomes: [],
  approvals: [],
  brief: null,
};

export function goalState(status: string): OwnerState {
  return (
    (
      {
        draft: "Waiting",
        active: "Working",
        paused: "Waiting",
        waiting: "Waiting",
        blocked: "Blocked",
        completed: "Complete",
        abandoned: "Stopped",
        archived: "Stopped",
      } as Record<string, OwnerState>
    )[status] ?? "Unknown"
  );
}
export function taskState(status: string): OwnerState {
  return (
    (
      {
        todo: "Waiting",
        ready: "Waiting",
        in_progress: "Working",
        waiting: "Waiting",
        blocked: "Blocked",
        queued: "Waiting",
        running: "Working",
        awaiting_approval: "Needs you",
        waiting_for_owner: "Needs you",
        paused: "Waiting",
        completed: "Complete",
        failed: "Recovery",
        cancelled: "Stopped",
        verification: "Verifying",
      } as Record<string, OwnerState>
    )[status] ?? "Unknown"
  );
}
export function pendingApprovals(
  items: ApprovalRequestView[],
  now = Date.now(),
) {
  return items.filter(
    (item) => item.status === "pending" && Date.parse(item.expiresAt) > now,
  );
}
/** Presentation only. A goal's aggregate state is never overridden by a historical run. */
export function projectWork(snapshot: OwnerSnapshot): WorkItem[] {
  const goals: WorkItem[] = snapshot.goals.map((goal) => ({
    id: goal.id,
    kind: "goal",
    title: goal.title,
    objective: goal.description,
    state: goalState(goal.status),
    updatedAt: goal.updatedAt,
    progress: goal.taskCount > 0 ? goal.progress : null,
    source: goal,
  }));
  const tasks: WorkItem[] = snapshot.tasks
    .filter(
      (task) =>
        !task.goalId || !snapshot.goals.some((goal) => goal.id === task.goalId),
    )
    .map((task) => ({
      id: task.id,
      kind: "task",
      title: task.title,
      objective: task.objective ?? "",
      state: taskState(task.status),
      updatedAt: task.updatedAt,
      progress: null,
      source: task,
    }));
  return [...goals, ...tasks].sort(
    (a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
  );
}
export function verificationSummary(task?: TaskRunView | null) {
  if (!task || task.checks.length === 0)
    return "Independent verification is not recorded.";
  const required = task.checks.filter((check) => check.required);
  if (task.checks.some((check) => check.status === "failed"))
    return "Recorded checks include a failure. Review the evidence before relying on this result.";
  if (required.length && required.every((check) => check.status === "passed"))
    return "All required recorded checks passed. Independent verifier provenance is not supplied by this contract.";
  return "Checks are incomplete. This result is not fully verified.";
}
export function recoveryMessage(task: TaskRunView) {
  if (task.status === "failed")
    return "This attempt did not finish successfully. Its history is retained. Review the reported reason with Sofie before starting another attempt.";
  if (task.status === "paused")
    return "This work is paused. No resumed execution is confirmed. Review its context with Sofie before continuing.";
  return task.statusReason ?? "No additional status context was recorded.";
}
export function workPrompt(
  work: GoalSummaryView | TaskRunView,
  purpose = "Help me plan the next safe step for this work.",
) {
  return `${purpose}\n\nWork reference: ${work.id}\nObjective: ${"description" in work ? work.description || work.title : work.objective || work.title}\n${"successCriteria" in work ? `Acceptance criteria: ${work.successCriteria.join("; ")}\n` : ""}Read the current saved context before acting. Clarify missing requirements, propose a plan, and preserve approval boundaries. Do not treat this message as execution approval.`;
}
export function activityItems(
  snapshot: OwnerSnapshot,
  detail?: GoalDetailView | null,
) {
  return [
    ...snapshot.goals.map((goal) => ({
      id: `created:${goal.id}`,
      at: goal.createdAt,
      text: `Work created: ${goal.title}`,
      source: "Work record",
    })),
    ...snapshot.tasks.flatMap((task) =>
      task.milestones.map((milestone) => ({
        id: `${task.id}:${milestone.id}`,
        at: milestone.createdAt,
        text: milestone.summary,
        source: "Recorded work update",
      })),
    ),
    ...(detail?.events ?? []).map((event) => ({
      id: event.id,
      at: event.occurredAt,
      text: event.summary,
      source: "Work history",
    })),
    ...snapshot.outcomes.map((result) => ({
      id: result.id,
      at: result.occurredAt,
      text: result.summary,
      source: "Result recorded",
    })),
    ...snapshot.approvals
      .filter((item) => item.decidedAt)
      .map((item) => ({
        id: item.id,
        at: item.decidedAt!,
        text: `${item.action}: ${item.decision ?? item.status}`,
        source: "Owner decision",
      })),
  ]
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, 30);
}
