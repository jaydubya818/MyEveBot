import { defineTool } from "eve/tools";
import { z } from "zod";

import {
  addGoalTaskDependency,
  createGoalMilestone,
  createGoalPlan,
  deleteGoalMilestone,
  linkGoalThread,
  removeGoalTaskDependency,
  updateGoalMilestone,
} from "../../lib/goals.ts";
import { taskOwnerFromAuth } from "../../lib/task-runs.ts";

export default defineTool({
  description: "Manage a goal's versioned plan, milestones, task dependencies, and conversation links. Adding a new plan preserves the previous version. Cyclic dependencies are rejected.",
  inputSchema: z.object({
    action: z.enum(["create_plan", "create_milestone", "update_milestone", "delete_milestone", "add_dependency", "remove_dependency", "link_thread"]),
    goalId: z.string().startsWith("goal_"),
    summary: z.string().min(1).max(4_000).optional(),
    strategy: z.string().max(10_000).optional(),
    milestoneId: z.string().startsWith("milestone_").optional(),
    title: z.string().min(1).max(200).optional(),
    description: z.string().max(4_000).optional(),
    status: z.enum(["pending", "in_progress", "completed", "skipped"]).optional(),
    targetDate: z.string().date().nullable().optional(),
    position: z.number().int().min(0).max(10_000).optional(),
    successCriteria: z.array(z.string().min(1).max(500)).max(20).optional(),
    taskId: z.string().startsWith("gtask_").optional(),
    dependsOnTaskId: z.string().startsWith("gtask_").optional(),
    threadId: z.string().min(1).max(240).optional(),
  }),
  async execute(input, ctx) {
    const ownerId = taskOwnerFromAuth(ctx.session.auth);
    switch (input.action) {
      case "create_plan":
        if (!input.summary) throw new Error("A summary is required to create a plan.");
        return createGoalPlan(ownerId, input.goalId, { summary: input.summary, strategy: input.strategy });
      case "create_milestone":
        if (!input.title) throw new Error("A title is required to create a milestone.");
        return createGoalMilestone(ownerId, input.goalId, { ...input, title: input.title });
      case "update_milestone":
        if (!input.milestoneId) throw new Error("A milestoneId is required to update a milestone.");
        return updateGoalMilestone(ownerId, input.goalId, input.milestoneId, input);
      case "delete_milestone":
        if (!input.milestoneId) throw new Error("A milestoneId is required to delete a milestone.");
        await deleteGoalMilestone(ownerId, input.goalId, input.milestoneId); return { ok: true };
      case "add_dependency":
        if (!input.taskId || !input.dependsOnTaskId) throw new Error("Both task ids are required to add a dependency.");
        await addGoalTaskDependency(ownerId, input.goalId, input.taskId, input.dependsOnTaskId); return { ok: true };
      case "remove_dependency":
        if (!input.taskId || !input.dependsOnTaskId) throw new Error("Both task ids are required to remove a dependency.");
        await removeGoalTaskDependency(ownerId, input.goalId, input.taskId, input.dependsOnTaskId); return { ok: true };
      case "link_thread":
        if (!input.threadId) throw new Error("A threadId is required to link a conversation.");
        await linkGoalThread(ownerId, input.goalId, input.threadId); return { ok: true };
    }
  },
});
