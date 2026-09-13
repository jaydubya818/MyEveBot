import { defineTool } from "eve/tools";
import { z } from "zod";
import { createKnowledge } from "../../lib/knowledge.ts";
import { currentConversationProvenance, knowledgeActor } from "../lib/knowledge-context.ts";

export default defineTool({
  description: "Record an explicit durable decision with rationale, alternatives, a reopen condition, and current-conversation provenance. Never silently reverse an earlier decision; supersede it.",
  inputSchema: z.object({ title: z.string().min(1).max(240), decision: z.string().min(1).max(20_000), rationale: z.string().min(1).max(20_000), alternatives: z.array(z.string().min(1).max(2_000)).max(20).default([]), reopenCondition: z.string().max(10_000).nullable().optional(), goalId: z.string().min(1).nullable().optional(), supersedesId: z.string().min(1).nullable().optional() }),
  async execute(input, ctx) { const actor = await knowledgeActor(ctx); return createKnowledge({ ...actor, kind: "decision", title: input.title, statement: input.decision, rationale: input.rationale, alternatives: input.alternatives, reopenCondition: input.reopenCondition, goalId: input.goalId, supersedesId: input.supersedesId, decidedAt: new Date().toISOString(), provenance: await currentConversationProvenance(ctx, actor.ownerId) }); },
});
