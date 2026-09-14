import { defineTool } from "eve/tools";
import { z } from "zod";

import { transitionGoal, updateGoal } from "../../lib/goals.ts";
import { taskOwnerFromAuth } from "../../lib/task-runs.ts";

const schema = z.object({
  action: z.enum(["update", "transition"]),
  goalId: z.string().startsWith("goal_"),
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(10_000).optional(),
  motivation: z.string().max(4_000).optional(),
  priority: z.enum(["low", "normal", "high", "critical"]).optional(),
  planningMode: z.enum(["instant", "simple", "structured", "complex"]).optional(),
  successCriteria: z.array(z.string().min(1).max(500)).max(20).optional(),
  targetDate: z.string().date().nullable().optional(),
  status: z.enum(["draft", "active", "paused", "blocked", "waiting", "completed", "abandoned", "archived"]).optional(),
  reason: z.string().min(1).max(1_000).optional(),
});

export default defineTool({
  description: "Edit a durable goal or apply a legal lifecycle transition. Never mark a goal completed while its non-cancelled tasks remain incomplete.",
  inputSchema: schema,
  async execute(input, ctx) {
    const ownerId = taskOwnerFromAuth(ctx.session.auth);
    if (input.action === "transition") {
      if (!input.status || !input.reason) throw new Error("A status and reason are required for a goal transition.");
      return transitionGoal(ownerId, input.goalId, input.status, "agent", input.reason);
    }
    const { action: _action, goalId, status: _status, reason: _reason, ...patch } = input;
    return updateGoal(ownerId, goalId, patch);
  },
});
