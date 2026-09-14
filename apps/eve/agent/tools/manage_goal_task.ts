import { defineTool } from "eve/tools";
import { z } from "zod";

import { createGoalTask, deleteGoalTask, transitionGoalTask, updateGoalTask } from "../../lib/goals.ts";
import { taskOwnerFromAuth } from "../../lib/task-runs.ts";

const schema = z.object({
  action: z.enum(["create", "update", "transition", "delete"]),
  goalId: z.string().startsWith("goal_"),
  taskId: z.string().startsWith("gtask_").optional(),
  title: z.string().min(1).max(240).optional(),
  description: z.string().max(8_000).optional(),
  milestoneId: z.string().startsWith("milestone_").nullable().optional(),
  parentTaskId: z.string().startsWith("gtask_").nullable().optional(),
  priority: z.enum(["low", "normal", "high", "critical"]).optional(),
  dueAt: z.string().datetime({ offset: true }).nullable().optional(),
  assignedTo: z.string().max(160).nullable().optional(),
  requiredCapabilities: z.array(z.string().min(1).max(160)).max(20).optional(),
  successCriteria: z.array(z.string().min(1).max(500)).max(20).optional(),
  estimatedEffortMinutes: z.number().int().positive().max(100_000).nullable().optional(),
  estimatedCostUsd: z.number().nonnegative().max(1_000_000).nullable().optional(),
  position: z.number().int().min(0).max(100_000).optional(),
  status: z.enum(["todo", "ready", "in_progress", "waiting", "blocked", "verification", "completed", "cancelled", "failed"]).optional(),
  reason: z.string().min(1).max(1_000).optional(),
});

export default defineTool({
  description: "Create, edit, transition, or delete a goal task. Required capabilities and dependencies block execution until they are ready. Use transition completed only after the task outcome is actually achieved.",
  inputSchema: schema,
  async execute(input, ctx) {
    const ownerId = taskOwnerFromAuth(ctx.session.auth);
    if (input.action === "create") {
      if (!input.title) throw new Error("A title is required to create a goal task.");
      const { action: _action, goalId, taskId: _taskId, reason: _reason, ...fields } = input;
      return createGoalTask(ownerId, goalId, { ...fields, title: input.title });
    }
    if (input.action === "update") {
      if (!input.taskId) throw new Error("A taskId is required to update a goal task.");
      const { action: _action, goalId, taskId, status: _status, reason: _reason, ...patch } = input;
      return updateGoalTask(ownerId, goalId, taskId, patch);
    }
    if (input.action === "transition") {
      if (!input.taskId || !input.status || !input.reason) throw new Error("A taskId, status, and reason are required for a task transition.");
      return transitionGoalTask(ownerId, input.goalId, input.taskId, input.status, "agent", input.reason);
    }
    if (!input.taskId) throw new Error("A taskId is required to delete a goal task.");
    await deleteGoalTask(ownerId, input.goalId, input.taskId);
    return { ok: true };
  },
});
