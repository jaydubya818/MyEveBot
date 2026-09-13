import { defineTool } from "eve/tools";
import { z } from "zod";

import { claimTaskSpecialist, taskOwnerFromAuth } from "../../lib/task-runs.ts";
import type { QaSpecialistRole } from "../../lib/task-types.ts";

export function createClaimTaskSpecialistTool(role: QaSpecialistRole) {
  // The role is fixed by each specialist's tool module, not model input.
  return defineTool({
    description: `Claim the active product-QA assignment for ${role}. This must be your first tool call so usage and retries are enforced.`,
    inputSchema: z.object({ taskId: z.string().startsWith("task_") }),
    execute(input, ctx) {
      return claimTaskSpecialist({
        ownerId: taskOwnerFromAuth(ctx.session.auth),
        taskId: input.taskId,
        sessionId: ctx.session.id,
        callId: ctx.callId,
        role,
      });
    },
  });
}
