import { defineTool } from "eve/tools";
import { z } from "zod";

import { createDelegatedTask, taskOwnerFromAuth } from "../../lib/task-runs.ts";
import { agentForSession } from "../lib/session-settings.ts";

export default defineTool({
  description: "Start a durable, bounded work contract for a multi-step assignment. Use before delegating or operating a computer so progress, lineage, budgets, and the final result remain inspectable.",
  inputSchema: z.object({
    title: z.string().min(1).max(200), objective: z.string().min(1).max(4000), expectedOutput: z.string().min(1).max(2000),
    threadId: z.string().min(1).max(200).optional(), goalId: z.string().startsWith("goal_").optional(), goalTaskId: z.string().startsWith("gtask_").optional(),
    parentTaskId: z.string().startsWith("task_").optional(), sourceTaskId: z.string().startsWith("task_").optional(), roleId: z.string().max(200).optional(),
    maxDurationSeconds: z.number().int().min(60).max(86400).optional(), maxModelSteps: z.number().int().min(1).max(200).optional(), maxEstimatedCostUsd: z.number().positive().max(100).optional(), maxWorkers: z.number().int().min(1).max(16).optional(),
  }),
  async execute(input, ctx) {
    const ownerId = taskOwnerFromAuth(ctx.session.auth);
    const agent = await agentForSession(ctx.session.id, ownerId);
    return createDelegatedTask({ ...input, ownerId, sessionId: ctx.session.id, agentId: agent?.id });
  },
});
