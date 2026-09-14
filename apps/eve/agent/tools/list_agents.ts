import { defineTool } from "eve/tools";
import { z } from "zod";

import { listAgents } from "../../lib/agents.ts";
import { taskOwnerFromAuth } from "../../lib/task-runs.ts";

export default defineTool({
  description: "List the owner's persistent Agents, their lifecycle state, role, capability assignments, availability, and limits.",
  inputSchema: z.object({ includeArchived: z.boolean().default(false) }),
  async execute({ includeArchived }, ctx) {
    return { agents: await listAgents(taskOwnerFromAuth(ctx.session.auth), includeArchived) };
  },
});
