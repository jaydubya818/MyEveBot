import { close } from "@agent-browser/eve/tools";
import { defineTool } from "eve/tools";
import { z } from "zod";

import { getComputerSessionForRuntime, stopComputerSession } from "../../lib/computer-sessions.ts";
import { computerAgent, computerOwnerId } from "../lib/computer-context.ts";

export default defineTool({
  description: "Stop the current Agent computer session. This revokes further actions and closes ephemeral browser state when available.",
  inputSchema: z.object({}),
  async execute(_input, ctx) {
    const ownerId = computerOwnerId(ctx);
    const current = await getComputerSessionForRuntime(ownerId, ctx.session.id);
    if (!current) throw new Error("No computer session exists for this runtime.");
    const agent = await computerAgent(ctx);
    if (!agent || current.agentId !== agent.id) throw new Error("This computer session belongs to another Agent.");
    try { await (await ctx.getSandbox()).setNetworkPolicy("deny-all"); } catch { /* Session state still stops fail-closed. */ }
    const session = await stopComputerSession(ownerId, current.id);
    let browserClosed = true;
    try { await close.execute({}, ctx); } catch { browserClosed = false; }
    return { session, browserClosed };
  },
  toModelOutput(output) {
    return { type: "json", value: { id: output.session.id, status: output.session.status, browserClosed: output.browserClosed } };
  },
});
