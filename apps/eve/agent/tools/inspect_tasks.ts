import { defineTool } from "eve/tools";
import { z } from "zod";

import { getTaskRun, listTaskRuns, taskOwnerFromAuth } from "../../lib/task-runs.ts";
import { agentName, ownerName } from "../lib/owner.ts";

export default defineTool({
  description:
    `Read ${ownerName()}'s audited ${agentName()} tasks, including status, guardrails, specialist progress, acceptance checks, evidence metadata, and milestones. Use a task ID for one task or omit it for recent tasks.`,
  inputSchema: z.object({
    taskId: z.string().startsWith("task_").optional(),
    threadId: z.string().min(1).max(200).optional(),
  }),
  async execute(input, ctx) {
    const ownerId = taskOwnerFromAuth(ctx.session.auth);
    if (input.taskId !== undefined) {
      const task = await getTaskRun(ownerId, input.taskId);
      if (task === null) throw new Error("Task not found.");
      return { task };
    }
    return { tasks: await listTaskRuns(ownerId, input.threadId) };
  },
});
