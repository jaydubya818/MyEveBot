import { defineTool } from "eve/tools";
import { z } from "zod";

import { getComputerSessionForRuntime, pauseComputerSession, resumeComputerSession } from "../../lib/computer-sessions.ts";
import { computerAgent, computerOwnerId } from "../lib/computer-context.ts";

export default defineTool({
  description: "Pause the current Agent computer for owner takeover or MFA, or resume it after the owner is finished. Paused sessions deny browser, file, and terminal actions.",
  inputSchema: z.object({
    action: z.enum(["pause_for_takeover", "resume"]),
    reason: z.string().min(1).max(500).optional(),
  }),
  async execute({ action }, ctx) {
    const ownerId = computerOwnerId(ctx);
    const current = await getComputerSessionForRuntime(ownerId, ctx.session.id);
    if (!current) throw new Error("No computer session exists for this runtime.");
    const agent = await computerAgent(ctx);
    if (!agent || current.agentId !== agent.id) throw new Error("This computer session belongs to another Agent.");
    return action === "pause_for_takeover"
      ? pauseComputerSession(ownerId, current.id)
      : resumeComputerSession(ownerId, current.id);
  },
  toModelOutput(session) {
    return { type: "json", value: { id: session.id, status: session.status, expiresAt: session.expiresAt } };
  },
});
