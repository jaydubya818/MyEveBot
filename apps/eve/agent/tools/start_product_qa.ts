import { defineTool } from "eve/tools";
import { z } from "zod";

import { createProductQaTask, taskOwnerFromAuth } from "../../lib/task-runs.ts";
import { agentName } from "../lib/owner.ts";
import { agentForSession } from "../lib/session-settings.ts";

export default defineTool({
  description:
    `Start ${agentName()}'s fixed three-specialist product QA pilot with Balanced guardrails. Use only for the local plus isolated-preview critical-path self-test. Pass the current webThreadId from client context so progress appears in this chat.`,
  inputSchema: z.object({
    threadId: z.string().min(1).max(200).optional(),
    localUrl: z.string().url().describe("Local personal-agent URL, normally http://localhost:3000"),
    previewUrl: z.string().url().describe("Isolated Vercel preview URL"),
    goalId: z.string().startsWith("goal_").optional().describe("Optional durable goal to link to this run."),
    goalTaskId: z.string().startsWith("gtask_").optional().describe("Optional task within goalId to link to this run."),
  }),
  async execute(input, ctx) {
    const ownerId = taskOwnerFromAuth(ctx.session.auth);
    const persistentAgent = await agentForSession(ctx.session.id, ownerId);
    return createProductQaTask({
      ownerId,
      agentId: persistentAgent?.id,
      sessionId: ctx.session.id,
      threadId: input.threadId,
      localUrl: input.localUrl,
      previewUrl: input.previewUrl,
      goalId: input.goalId,
      goalTaskId: input.goalTaskId,
    });
  },
});
