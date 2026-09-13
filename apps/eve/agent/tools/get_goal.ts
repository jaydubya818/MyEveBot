import { defineTool } from "eve/tools";
import { z } from "zod";

import { getGoal } from "../../lib/goals.ts";
import { taskOwnerFromAuth } from "../../lib/task-runs.ts";

export default defineTool({
  description: "Inspect one goal's current plan, milestones, tasks, dependencies, progress, activity, linked runs, and deterministic next action.",
  inputSchema: z.object({ goalId: z.string().startsWith("goal_") }),
  async execute({ goalId }, ctx) {
    const goal = await getGoal(taskOwnerFromAuth(ctx.session.auth), goalId);
    if (goal === null) throw new Error("Goal not found.");
    return goal;
  },
});
