import { defineTool } from "eve/tools";
import { z } from "zod";

import { getComputerSessionForRuntime, listComputerActions } from "../../lib/computer-sessions.ts";
import { computerAgent, computerOwnerId } from "../lib/computer-context.ts";

export default defineTool({
  description: "Inspect the current Agent computer session, including lifecycle, current page, actions, and durable artifacts.",
  inputSchema: z.object({}),
  async execute(_input, ctx) {
    const ownerId = computerOwnerId(ctx);
    const session = await getComputerSessionForRuntime(ownerId, ctx.session.id);
    if (!session) return { session: null, actions: [] };
    const agent = await computerAgent(ctx);
    if (!agent || session.agentId !== agent.id) throw new Error("This computer session belongs to another Agent.");
    return { session, actions: await listComputerActions(ownerId, session.id) };
  },
  toModelOutput(output) {
    return { type: "json", value: output.session ? {
      session: {
        id: output.session.id, status: output.session.status, currentUrl: output.session.browser?.currentUrl,
        expiresAt: output.session.expiresAt, actionCount: output.session.actionCount, artifacts: output.session.artifacts,
      }, actions: output.actions,
    } : output };
  },
});
