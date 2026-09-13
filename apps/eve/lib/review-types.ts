import type { GoalFocusItem, GoalPriority } from "./goal-types.ts";
import type { OutcomeView } from "./outcome-types.ts";

export const REVIEW_KINDS = ["daily", "weekly"] as const;
export const RISK_REASONS = [
  "deadline_approaching",
  "deadline_overdue",
  "unfinished_critical_task",
  "dependency_incomplete",
  "no_recent_progress",
  "capability_unavailable",
] as const;

export type ReviewKind = (typeof REVIEW_KINDS)[number];
export type RiskReason = (typeof RISK_REASONS)[number];

export interface ReviewRisk {
  goalId: string;
  goalTitle: string;
  taskId: string | null;
  taskTitle: string | null;
  reason: RiskReason;
  severity: "attention" | "warning" | "critical";
  explanation: string;
}

export interface ReviewWorkItem {
  goalId: string;
  goalTitle: string;
  taskId: string | null;
  taskTitle: string | null;
  priority: GoalPriority;
  at: string | null;
}

export interface ReviewRecommendation {
  title: string;
  goalId: string | null;
  taskId: string | null;
  whyNow: string[];
}

export interface DailyBriefView {
  kind: "daily";
  generatedAt: string;
  periodStart: string;
  periodEnd: string;
  topPriorities: GoalFocusItem[];
  overdue: ReviewWorkItem[];
  approaching: ReviewWorkItem[];
  blocked: ReviewWorkItem[];
  pendingOwnerActions: ReviewWorkItem[];
  completed: ReviewWorkItem[];
  atRisk: ReviewRisk[];
  recommendations: ReviewRecommendation[];
}

export interface WeeklyReviewView {
  kind: "weekly";
  generatedAt: string;
  periodStart: string;
  periodEnd: string;
  progress: Array<{ goalId: string; goalTitle: string; progress: number }>;
  completedGoals: ReviewWorkItem[];
  completedTasks: ReviewWorkItem[];
  stalled: ReviewRisk[];
  blockers: ReviewRisk[];
  missedCommitments: ReviewWorkItem[];
  outcomes: OutcomeView[];
  proposedPriorities: ReviewRecommendation[];
}

export type ProgressReview = DailyBriefView | WeeklyReviewView;
