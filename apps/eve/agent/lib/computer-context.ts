import type { ToolContext } from "eve/tools";

import { assertComputerCapability } from "../../lib/computer-sessions.ts";
import { sessionAgent } from "./session-settings.ts";

export function computerOwnerId(ctx: Pick<ToolContext, "session">): string {
  const ownerId = ctx.session.auth.current?.principalId?.trim();
  if (!ownerId) throw new Error("An authenticated owner is required for computer work.");
  return ownerId;
}

export async function requireComputerCapability(ctx: ToolContext, capabilityId: string) {
  const ownerId = computerOwnerId(ctx);
  const agent = await sessionAgent(ownerId, ctx.session.auth.current?.attributes.myeveAgentId, ctx.session.auth.current?.attributes.owner === "true");
  if (!agent) throw new Error("The current runtime is not attributed to an Agent.");
  return assertComputerCapability({
    ownerId,
    runtimeSessionId: ctx.session.id,
    agentId: agent.id,
    capabilityId,
  });
}
