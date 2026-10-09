import { defineTool } from "eve/tools";
import { z } from "zod";

import { completeTask, taskOwnerFromAuth } from "../../lib/task-runs.ts";

export default defineTool({
  description:
    "Complete an audited QA task. The server refuses completion unless exactly three approved specialists completed and every required check passed with stored evidence.",
  inputSchema: z.object({ taskId: z.string().startsWith("task_") }),
  async execute({ taskId }, ctx) {
    return completeTask(taskOwnerFromAuth(ctx.session.auth), taskId);
  },
});
