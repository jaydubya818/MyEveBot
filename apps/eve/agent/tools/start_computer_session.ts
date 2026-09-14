import { defineTool } from "eve/tools";
import { z } from "zod";

import { createComputerSession, transitionComputerSession } from "../../lib/computer-sessions.ts";
import { computerAgent, computerOwnerId } from "../lib/computer-context.ts";
import { PRIVATE_IPV4_CIDRS, normalizeAllowedDomains } from "../../lib/computer-types.ts";

export default defineTool({
  description: "Start the current Agent's isolated, ephemeral computer session before browser, file, or terminal work. Reuses the active session when one already exists.",
  inputSchema: z.object({
    goalId: z.string().startsWith("goal_").optional(),
    taskId: z.string().startsWith("task_").optional(),
    runId: z.string().startsWith("task_").optional(),
    maxRuntimeSeconds: z.number().int().min(10).max(86_400).optional(),
    maxBrowserActions: z.number().int().min(1).max(500).optional(),
    allowedDomains: z.array(z.string()).max(20).default([]).describe("Exact public hostnames required for this session, such as example.com. All other egress is denied."),
  }),
  async execute(input, ctx) {
    const ownerId = computerOwnerId(ctx);
    const agent = await computerAgent(ctx);
    if (!agent) throw new Error("The current runtime is not attributed to an Agent.");
    const session = await createComputerSession({
      ownerId,
      agentId: agent.id,
      runtimeSessionId: ctx.session.id,
      goalId: input.goalId,
      taskId: input.taskId,
      runId: input.runId,
      limits: { maxRuntimeSeconds: input.maxRuntimeSeconds, maxBrowserActions: input.maxBrowserActions },
      allowedDomains: input.allowedDomains,
    });
    if (session.status !== "provisioning") return session;
    try {
      const sandbox = await ctx.getSandbox();
      const allowedDomains = normalizeAllowedDomains(input.allowedDomains);
      await sandbox.setNetworkPolicy(allowedDomains.length === 0 ? "deny-all" : {
        allow: allowedDomains,
        subnets: { deny: [...PRIVATE_IPV4_CIDRS] },
      });
      return await transitionComputerSession({ ownerId, id: session.id, to: "ready", sandboxId: sandbox.id });
    } catch (error) {
      await transitionComputerSession({
        ownerId, id: session.id, to: "failed", failureCode: "session_provision_failed",
        failureSummary: error instanceof Error ? error.message : "Computer session provisioning failed.",
      });
      throw error;
    }
  },
  toModelOutput(output) {
    return { type: "json", value: { id: output.id, status: output.status, expiresAt: output.expiresAt, limits: output.resourceLimits } };
  },
});
