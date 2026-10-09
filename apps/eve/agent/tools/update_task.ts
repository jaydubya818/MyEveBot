import { defineTool } from "eve/tools";
import { z } from "zod";

import { taskOwnerFromAuth, transitionTask } from "../../lib/task-runs.ts";
import { ownerName } from "../lib/owner.ts";

export default defineTool({
  description:
    `Update an owner-scoped audited task lifecycle. You can start queued work, request or resume after approval, fail honestly, prepare a failed task for retry, or cancel work when ${ownerName()} asks you to stop. After cancel, stop taking task actions.`,
  inputSchema: z.object({
    taskId: z.string().startsWith("task_"),
    action: z.enum(["start", "request_approval", "resume", "fail", "retry", "cancel"]),
    reason: z.string().min(1).max(1000),
  }),
  async execute(input, ctx) {
    const to = {
      start: "running",
      request_approval: "awaiting_approval",
      resume: "running",
      fail: "failed",
      retry: "queued",
      cancel: "cancelled",
    } as const;
    return transitionTask(
      taskOwnerFromAuth(ctx.session.auth),
      input.taskId,
      to[input.action],
      "agent",
      input.reason,
    );
  },
});
