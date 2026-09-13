import { defineTool } from "eve/tools";
import { z } from "zod";

import { getAgent } from "../../lib/agents.ts";
import { taskOwnerFromAuth } from "../../lib/task-runs.ts";

export default defineTool({
  description: "Inspect one owner-scoped persistent Agent and its effective capability availability.",
  inputSchema: z.object({ agentId: z.string().min(1).max(100) }),
  async execute({ agentId }, ctx) {
    const agent = await getAgent(taskOwnerFromAuth(ctx.session.auth), agentId);
    return agent ? { agent } : { error: "Agent not found." };
  },
});
