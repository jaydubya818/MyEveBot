import { defineTool } from "eve/tools";
import { z } from "zod";

import { createComputerSession, getComputerSession, transitionComputerSession } from "../../lib/computer-sessions.ts";
import { PRIVATE_IPV4_CIDRS, normalizeAllowedDomains } from "../../lib/computer-types.ts";
import { computerAgent, computerOwnerId } from "../lib/computer-context.ts";

export default defineTool({
  description: "Recover terminal or expired computer work into a fresh isolated session with the same task lineage, bounded resources, and network allowlist. Durable artifacts remain on the prior session.",
  inputSchema: z.object({ priorSessionId: z.string().startsWith("computer_") }),
  async execute({ priorSessionId }, ctx) {
    const ownerId = computerOwnerId(ctx);
    const agent = await computerAgent(ctx);
    if (!agent) throw new Error("The current runtime is not attributed to an Agent.");
    const prior = await getComputerSession(ownerId, priorSessionId);
    if (!prior) throw new Error("Prior computer session not found.");
    if (prior.agentId !== agent.id) throw new Error("Prior computer session belongs to another Agent.");
    if (["provisioning", "ready", "running", "paused"].includes(prior.status)) throw new Error("The prior computer session is still active; inspect or resume it instead.");
    const allowedDomains = normalizeAllowedDomains(Array.isArray(prior.networkPolicy.allowedDomains) ? prior.networkPolicy.allowedDomains.filter((item): item is string => typeof item === "string") : []);
    const session = await createComputerSession({ ownerId, agentId: agent.id, runtimeSessionId: ctx.session.id, goalId: prior.goalId ?? undefined, taskId: prior.taskId ?? undefined, runId: prior.runId ?? undefined, limits: prior.resourceLimits, allowedDomains });
    try {
      const sandbox = await ctx.getSandbox();
      await sandbox.setNetworkPolicy(allowedDomains.length === 0 ? "deny-all" : { allow: allowedDomains, subnets: { deny: [...PRIVATE_IPV4_CIDRS] } });
      return transitionComputerSession({ ownerId, id: session.id, to: "ready", sandboxId: sandbox.id });
    } catch (error) {
      await transitionComputerSession({ ownerId, id: session.id, to: "failed", failureCode: "session_recovery_failed", failureSummary: error instanceof Error ? error.message : "Computer recovery failed." });
      throw error;
    }
  },
});
