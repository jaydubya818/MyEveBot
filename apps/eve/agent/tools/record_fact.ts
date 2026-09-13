import { defineTool } from "eve/tools";
import { z } from "zod";
import { createKnowledge } from "../../lib/knowledge.ts";
import { currentConversationProvenance, knowledgeActor } from "../lib/knowledge-context.ts";

export default defineTool({
  description: "Record a durable owner-scoped factual assertion with confidence and provenance. Do not use for guesses, observations, or preferences.",
  inputSchema: z.object({ statement: z.string().min(1).max(20_000), confidence: z.number().min(0).max(1).default(1), goalId: z.string().min(1).nullable().optional(), firstSeenAt: z.string().datetime().nullable().optional(), lastConfirmedAt: z.string().datetime().nullable().optional(), supersedesId: z.string().min(1).nullable().optional() }),
  async execute(input, ctx) { const actor = await knowledgeActor(ctx); return createKnowledge({ ...actor, ...input, kind: "fact", provenance: await currentConversationProvenance(ctx, actor.ownerId) }); },
});
