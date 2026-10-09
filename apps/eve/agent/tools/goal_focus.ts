import { defineTool } from "eve/tools";
import { z } from "zod";

import { getFocus } from "../../lib/goals.ts";
import { taskOwnerFromAuth } from "../../lib/task-runs.ts";
import { ownerName } from "../lib/owner.ts";

export default defineTool({
  description: `Get ${ownerName()}'s ranked, executable next actions across active goals. Ranking is deterministic and includes a concise why-now explanation; blocked dependencies and unavailable capabilities are excluded.`,
  inputSchema: z.object({ limit: z.number().int().min(1).max(50).default(10) }),
  async execute({ limit }, ctx) {
    return getFocus(taskOwnerFromAuth(ctx.session.auth), limit);
  },
});
