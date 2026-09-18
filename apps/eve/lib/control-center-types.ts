import type { TaskStatus } from "./task-types.ts";

export const CONTROL_VIEWS = ["working", "waiting", "approval", "failed", "completed", "all"] as const;
export type ControlView = (typeof CONTROL_VIEWS)[number];

export interface ControlRunView {
  id: string;
  title: string;
  objective: string | null;
  expectedOutput: string | null;
  taskStatus: TaskStatus;
  view: Exclude<ControlView, "all">;
  currentAction: string | null;
  waitingReason: string | null;
  statusReason: string | null;
  agent: { id: string | null; name: string; executorKind: string; roleId: string | null };
  goal: { id: string; title: string } | null;
  goalTask: { id: string; title: string } | null;
  threadId: string | null;
  runtimeSessionId: string | null;
  provider: { execution: string; computer: string | null };
  computer: { id: string; status: string } | null;
  progress: { completed: number; total: number; label: string } | null;
  cost: { estimatedUsd: number | null; actualUsd: number | null };
  approvalsPending: number;
  startedAt: string | null;
  completedAt: string | null;
  updatedAt: string;
  availableActions: Array<"view" | "pause" | "resume" | "cancel" | "retry">;
}

export interface ControlCenterSummary {
  runs: ControlRunView[];
  counts: Record<ControlView, number>;
  applied: { view: ControlView; query: string | null };
}
