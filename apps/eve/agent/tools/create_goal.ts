import { defineTool } from "eve/tools";
import { z } from "zod";

import { createGoal } from "../../lib/goals.ts";
import { taskOwnerFromAuth } from "../../lib/task-runs.ts";
import { ownerName } from "../lib/owner.ts";

export default defineTool({
  description:
    `Create a durable owner goal. Use this when ${ownerName()} expresses an outcome worth tracking across sessions. After creation, add the active plan, milestones, and concrete tasks with manage_goal_structure and manage_goal_task. Pass the current webThreadId from client context when available.`,
  inputSchema: z.object({
    title: z.string().min(1).max(200),
    description: z.string().max(10_000).optional(),
    motivation: z.string().max(4_000).optional(),
    priority: z.enum(["low", "normal", "high", "critical"]).default("normal"),
    planningMode: z.enum(["instant", "simple", "structured", "complex"]).default("simple"),
    successCriteria: z.array(z.string().min(1).max(500)).max(20).default([]),
    targetDate: z.string().date().nullable().optional(),
    threadId: z.string().min(1).max(240).nullable().optional(),
    idempotencyKey: z.string().min(1).max(200).optional(),
  }),
  async execute(input, ctx) {
    return createGoal({
      ownerId: taskOwnerFromAuth(ctx.session.auth),
      ...input,
      source: "agent",
      sourceReference: ctx.session.id,
    });
  },
});
