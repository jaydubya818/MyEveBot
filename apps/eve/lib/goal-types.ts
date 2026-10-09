export const GOAL_STATUSES = [
  "draft",
  "active",
  "paused",
  "blocked",
  "waiting",
  "completed",
  "abandoned",
  "archived",
] as const;
export const GOAL_PRIORITIES = ["low", "normal", "high", "critical"] as const;
export const PLANNING_MODES = ["instant", "simple", "structured", "complex"] as const;
export const MILESTONE_STATUSES = ["pending", "in_progress", "completed", "skipped"] as const;
export const GOAL_TASK_STATUSES = [
  "todo",
  "ready",
  "in_progress",
  "waiting",
  "blocked",
  "verification",
  "completed",
  "cancelled",
  "failed",
] as const;

export type GoalStatus = (typeof GOAL_STATUSES)[number];
export type GoalPriority = (typeof GOAL_PRIORITIES)[number];
export type PlanningMode = (typeof PLANNING_MODES)[number];
export type MilestoneStatus = (typeof MILESTONE_STATUSES)[number];
export type GoalTaskStatus = (typeof GOAL_TASK_STATUSES)[number];

export interface GoalPlanView {
  id: string;
  version: number;
  status: "active" | "superseded";
  summary: string;
  strategy: string;
  createdAt: string;
  supersededAt: string | null;
}

export interface GoalMilestoneView {
  id: string;
  title: string;
  description: string;
  status: MilestoneStatus;
  targetDate: string | null;
  completedAt: string | null;
  position: number;
  successCriteria: string[];
  progress: number;
}

export interface GoalTaskView {
  id: string;
  goalId: string;
  milestoneId: string | null;
  parentTaskId: string | null;
  title: string;
  description: string;
  status: GoalTaskStatus;
  priority: GoalPriority;
  dueAt: string | null;
  assignedTo: string | null;
  requiredCapabilities: string[];
  successCriteria: string[];
  estimatedEffortMinutes: number | null;
  estimatedCostUsd: number | null;
  position: number;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  dependencyIds: string[];
  blockedByDependencies: boolean;
  unavailableCapabilities: string[];
}

export interface GoalEventView {
  id: string;
  type: string;
  severity: "info" | "attention" | "warning" | "critical";
  summary: string;
  rationale: string[];
  occurredAt: string;
}

export interface GoalSummaryView {
  id: string;
  title: string;
  description: string;
  motivation: string;
  status: GoalStatus;
  priority: GoalPriority;
  planningMode: PlanningMode;
  successCriteria: string[];
  targetDate: string | null;
  source: string;
  sourceReference: string | null;
  startedAt: string | null;
  completedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  progress: number;
  taskCount: number;
  completedTaskCount: number;
}

export interface GoalDetailView extends GoalSummaryView {
  plans: GoalPlanView[];
  milestones: GoalMilestoneView[];
  tasks: GoalTaskView[];
  threadIds: string[];
  events: GoalEventView[];
  linkedRunIds: string[];
  nextAction: GoalFocusItem | null;
}

export interface GoalFocusItem {
  goalId: string;
  goalTitle: string;
  taskId: string;
  taskTitle: string;
  priority: GoalPriority;
  dueAt: string | null;
  estimatedEffortMinutes: number | null;
  whyNow: string[];
}

const GOAL_TRANSITIONS: Readonly<Record<GoalStatus, readonly GoalStatus[]>> = {
  draft: ["active", "abandoned", "archived"],
  active: ["paused", "blocked", "waiting", "completed", "abandoned", "archived"],
  paused: ["active", "abandoned", "archived"],
  blocked: ["active", "waiting", "abandoned", "archived"],
  waiting: ["active", "blocked", "completed", "abandoned", "archived"],
  completed: ["archived"],
  abandoned: ["archived"],
  archived: [],
};

const TASK_TRANSITIONS: Readonly<Record<GoalTaskStatus, readonly GoalTaskStatus[]>> = {
  todo: ["ready", "in_progress", "waiting", "blocked", "completed", "cancelled", "failed"],
  ready: ["in_progress", "waiting", "blocked", "completed", "cancelled", "failed"],
  in_progress: ["waiting", "blocked", "verification", "completed", "cancelled", "failed"],
  waiting: ["ready", "in_progress", "blocked", "completed", "cancelled", "failed"],
  blocked: ["ready", "in_progress", "waiting", "cancelled", "failed"],
  verification: ["in_progress", "completed", "failed", "cancelled"],
  completed: [],
  cancelled: [],
  failed: ["ready", "in_progress", "cancelled"],
};

export function canTransitionGoal(from: GoalStatus, to: GoalStatus): boolean {
  return GOAL_TRANSITIONS[from].includes(to);
}

export function canTransitionGoalTask(from: GoalTaskStatus, to: GoalTaskStatus): boolean {
  return TASK_TRANSITIONS[from].includes(to);
}

export function calculateProgress(tasks: readonly Pick<GoalTaskView, "status">[]): {
  progress: number;
  taskCount: number;
  completedTaskCount: number;
} {
  const relevant = tasks.filter((task) => task.status !== "cancelled");
  const completedTaskCount = relevant.filter((task) => task.status === "completed").length;
  return {
    progress: relevant.length === 0 ? 0 : Math.round((completedTaskCount / relevant.length) * 100),
    taskCount: relevant.length,
    completedTaskCount,
  };
}
