import { defineTool } from "eve/tools";
import { z } from "zod";

import { generateProgressReview } from "../../lib/reviews.ts";
import { taskOwnerFromAuth } from "../../lib/task-runs.ts";

export default defineTool({
  description: "Generate a deterministic daily brief or weekly review from canonical persisted goals, tasks, runs, events, evidence, and outcomes.",
  inputSchema: z.object({
    kind: z.enum(["daily", "weekly"]),
    checkpoint: z.boolean().default(true).describe("Record the manual generation checkpoint."),
  }),
  async execute({ kind, checkpoint }, ctx) {
    return generateProgressReview(taskOwnerFromAuth(ctx.session.auth), kind, { checkpoint });
  },
});
