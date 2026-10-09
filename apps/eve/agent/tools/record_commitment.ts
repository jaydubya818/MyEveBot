import { defineTool } from "eve/tools";
import { z } from "zod";
import { createKnowledge } from "../../lib/knowledge.ts";
import { currentConversationProvenance, knowledgeActor } from "../lib/knowledge-context.ts";

export default defineTool({
  description: "Record an explicit obligation. Do not infer broad commitments from casual language.",
  inputSchema: z.object({ subject: z.string().min(1).max(240), commitment: z.string().min(1).max(20_000), dueAt: z.string().datetime().nullable().optional(), goalId: z.string().min(1).nullable().optional(), supersedesId: z.string().min(1).nullable().optional() }),
  async execute(input, ctx) { const actor = await knowledgeActor(ctx); return createKnowledge({ ...actor, kind: "commitment", subject: input.subject, statement: input.commitment, dueAt: input.dueAt, goalId: input.goalId, supersedesId: input.supersedesId, provenance: await currentConversationProvenance(ctx, actor.ownerId) }); },
});
