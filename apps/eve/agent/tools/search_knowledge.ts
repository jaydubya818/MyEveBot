import { defineTool } from "eve/tools";
import { z } from "zod";
import { listKnowledge } from "../../lib/knowledge.ts";
import { taskOwnerFromAuth } from "../../lib/task-runs.ts";

export default defineTool({
  description: "Search canonical structured knowledge by text, type, status, Goal, confidence, or date. This is not conversation-memory retrieval.",
  inputSchema: z.object({ query: z.string().max(500).optional(), type: z.enum(["fact", "observation", "hypothesis", "decision", "commitment", "preference", "insight"]).optional(), status: z.string().max(40).optional(), goalId: z.string().min(1).optional(), minConfidence: z.number().min(0).max(1).optional(), from: z.string().datetime().optional(), to: z.string().datetime().optional(), limit: z.number().int().min(1).max(100).default(25) }),
  async execute(input, ctx) { const { type, ...filters } = input; return listKnowledge(taskOwnerFromAuth(ctx.session.auth), { ...filters, kind: type }); },
});
