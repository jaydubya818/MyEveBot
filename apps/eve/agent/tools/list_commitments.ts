import { defineTool } from "eve/tools";
import { z } from "zod";
import { listKnowledge } from "../../lib/knowledge.ts";
import { taskOwnerFromAuth } from "../../lib/task-runs.ts";

export default defineTool({
  description: "List durable owner commitments by lifecycle status or related Goal.",
  inputSchema: z.object({ status: z.enum(["open", "fulfilled", "missed", "cancelled", "superseded"]).optional(), goalId: z.string().min(1).optional(), limit: z.number().int().min(1).max(100).default(50) }),
  async execute(input, ctx) { return listKnowledge(taskOwnerFromAuth(ctx.session.auth), { ...input, kind: "commitment" }); },
});
