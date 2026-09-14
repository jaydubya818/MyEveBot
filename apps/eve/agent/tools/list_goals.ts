import { defineTool } from "eve/tools";
import { z } from "zod";

import { listGoals } from "../../lib/goals.ts";
import { taskOwnerFromAuth } from "../../lib/task-runs.ts";
import { ownerName } from "../lib/owner.ts";

export default defineTool({
  description: `List ${ownerName()}'s durable goals with status, priority, task progress, and target dates. Use before claiming a goal does or does not exist.`,
  inputSchema: z.object({
    status: z.enum(["draft", "active", "paused", "blocked", "waiting", "completed", "abandoned", "archived"]).optional(),
    query: z.string().max(120).optional(),
    limit: z.number().int().min(1).max(200).default(100),
  }),
  async execute(input, ctx) {
    return listGoals(taskOwnerFromAuth(ctx.session.auth), input);
  },
});
