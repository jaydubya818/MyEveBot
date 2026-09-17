import type { ToolContext } from "eve/tools";

import {
  assertComputerCapability,
  createComputerSession,
  getComputerSessionForRuntime,
  transitionComputerSession,
  updateComputerSessionAllowedDomains,
} from "../../lib/computer-sessions.ts";
import {
  normalizeAllowedDomains,
  PRIVATE_IPV4_CIDRS,
  type ComputerResourceLimits,
} from "../../lib/computer-types.ts";
import { resolveSessionAgent } from "./session-settings.ts";

export function computerOwnerId(ctx: Pick<ToolContext, "session">): string {
  const ownerId = ctx.session.auth.current?.principalId?.trim();
  if (!ownerId) throw new Error("An authenticated owner is required for computer work.");
  return ownerId;
}

export async function computerAgent(ctx: Pick<ToolContext, "session">) {
  const ownerId = computerOwnerId(ctx);
  return resolveSessionAgent({
    ownerId,
    sessionId: ctx.session.id,
    auth: ctx.session.auth,
    primaryFallback: ctx.session.auth.current?.attributes.owner === "true",
  });
}

export async function requireComputerCapability(ctx: ToolContext, capabilityId: string) {
  const ownerId = computerOwnerId(ctx);
  const agent = await computerAgent(ctx);
  if (!agent) throw new Error("The current runtime is not attributed to an Agent.");
  return assertComputerCapability({
    ownerId,
    runtimeSessionId: ctx.session.id,
    agentId: agent.id,
    capabilityId,
  });
}

export async function provisionComputerSession(
  ctx: ToolContext,
  input: {
    goalId?: string;
    taskId?: string;
    runId?: string;
    limits?: Partial<ComputerResourceLimits>;
    allowedDomains?: readonly string[];
  } = {},
) {
  const ownerId = computerOwnerId(ctx);
  const agent = await computerAgent(ctx);
  if (!agent) throw new Error("The current runtime is not attributed to an Agent.");
  const before = await getComputerSessionForRuntime(ownerId, ctx.session.id);
  if (before?.status === "paused") {
    throw new Error("Computer access is paused for owner takeover. Resume it before continuing.");
  }
  const requestedDomains = normalizeAllowedDomains(input.allowedDomains);
  let session = await createComputerSession({
    ownerId,
    agentId: agent.id,
    runtimeSessionId: ctx.session.id,
    goalId: input.goalId,
    taskId: input.taskId,
    runId: input.runId,
    limits: input.limits,
    allowedDomains: requestedDomains,
  });
  try {
    const sandbox = await ctx.getSandbox();
    const currentDomains = Array.isArray(session.networkPolicy.allowedDomains)
      ? session.networkPolicy.allowedDomains.filter((value): value is string => typeof value === "string")
      : [];
    const allowedDomains = normalizeAllowedDomains([...currentDomains, ...requestedDomains]);
    await sandbox.setNetworkPolicy(allowedDomains.length === 0 ? "deny-all" : {
      allow: allowedDomains,
      subnets: { deny: [...PRIVATE_IPV4_CIDRS] },
    });
    session = await updateComputerSessionAllowedDomains({ ownerId, id: session.id, allowedDomains });
    if (session.status === "provisioning") {
      session = await transitionComputerSession({ ownerId, id: session.id, to: "ready", sandboxId: sandbox.id });
    }
    return { session, startedOnDemand: !before || !["ready", "running"].includes(before.status) };
  } catch (error) {
    if (session.status === "provisioning") {
      await transitionComputerSession({
        ownerId,
        id: session.id,
        to: "failed",
        failureCode: "session_provision_failed",
        failureSummary: error instanceof Error ? error.message : "Computer session provisioning failed.",
      });
    }
    throw error;
  }
}
