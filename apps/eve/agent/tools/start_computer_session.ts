import { defineTool } from "eve/tools";
import { z } from "zod";

import { provisionComputerSession } from "../lib/computer-context.ts";

export default defineTool({
  description: "Start the current Agent's isolated, ephemeral computer session before browser, file, or terminal work. Reuses the active session when one already exists.",
  inputSchema: z.object({
    goalId: z.string().startsWith("goal_").optional(),
    goalTaskId: z.string().startsWith("task_").optional().describe("Optional Goal OS task id. This is not the work Run returned by start_task."),
    taskId: z.string().startsWith("task_").optional().describe("Deprecated alias for goalTaskId. Use runId for a start_task work contract."),
    runId: z.string().startsWith("task_").optional().describe("Work Run id returned by start_task or start_product_qa."),
    maxRuntimeSeconds: z.number().int().min(10).max(86_400).optional(),
    maxBrowserActions: z.number().int().min(1).max(500).optional(),
    allowedDomains: z.array(z.string()).max(20).default([]).describe("Exact public hostnames required for this session, such as example.com. All other egress is denied."),
  }),
  async execute(input, ctx) {
    if (input.goalTaskId && input.taskId && input.goalTaskId !== input.taskId) throw new Error("Provide goalTaskId only; taskId is its deprecated alias.");
    const { session } = await provisionComputerSession(ctx, {
      goalId: input.goalId,
      taskId: input.goalTaskId ?? input.taskId,
      runId: input.runId,
      limits: { maxRuntimeSeconds: input.maxRuntimeSeconds, maxBrowserActions: input.maxBrowserActions },
      allowedDomains: input.allowedDomains,
    });
    return session;
  },
  toModelOutput(output) {
    return { type: "json", value: { id: output.id, status: output.status, expiresAt: output.expiresAt, limits: output.resourceLimits } };
  },
});
