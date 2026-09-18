import { defineTool } from "eve/tools";
import { z } from "zod";

import { getComputerSessionForRuntime, requestOwnerTakeover } from "../../lib/computer-sessions.ts";
import { computerAgent, computerOwnerId } from "../lib/computer-context.ts";

export default defineTool({
  description: "Pause the current Agent computer and request owner takeover for login, MFA, consent, or other sensitive input. Only the owner can resume it.",
  inputSchema: z.object({
    action: z.literal("pause_for_takeover"),
    reason: z.string().min(1).max(500).optional(),
  }),
  async execute({ reason }, ctx) {
    const ownerId = computerOwnerId(ctx);
    const current = await getComputerSessionForRuntime(ownerId, ctx.session.id);
    if (!current) throw new Error("No computer session exists for this runtime.");
    const agent = await computerAgent(ctx);
    if (!agent || current.agentId !== agent.id) throw new Error("This computer session belongs to another Agent.");
    return requestOwnerTakeover({ownerId,id:current.id,agentId:agent.id,reason:reason??"Sensitive owner input is required"});
  },
  toModelOutput(session) {
    return { type: "json", value: { id: session.id, status: session.status, expiresAt: session.expiresAt } };
  },
});
