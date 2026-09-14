import { defineTool } from "eve/tools";
import { z } from "zod";

import { completeDelegatedTask, taskOwnerFromAuth } from "../../lib/task-runs.ts";

export default defineTool({
  description: "Complete a general work contract with a concise result and explicit verification evidence. The result is published to Results for owner review.",
  inputSchema: z.object({ taskId: z.string().startsWith("task_"), summary: z.string().min(1).max(1000), evidenceSummary: z.string().min(1).max(2000) }),
  execute(input, ctx) { return completeDelegatedTask({ ...input, ownerId: taskOwnerFromAuth(ctx.session.auth) }); },
});
