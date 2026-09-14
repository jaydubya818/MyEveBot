import { defineTool } from "eve/tools";
import { z } from "zod";

import { listOutcomes } from "../../lib/outcomes.ts";
import { taskOwnerFromAuth } from "../../lib/task-runs.ts";

export default defineTool({
  description: "List durable owner-scoped outcomes and their linked goal, task, run, evidence, and explicit owner feedback.",
  inputSchema: z.object({ limit: z.number().int().min(1).max(200).default(50) }),
  async execute({ limit }, ctx) {
    return listOutcomes(taskOwnerFromAuth(ctx.session.auth), limit);
  },
});
