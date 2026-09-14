import { defineTool } from "eve/tools";
import { z } from "zod";
import { createKnowledge } from "../../lib/knowledge.ts";
import { currentConversationProvenance, knowledgeActor } from "../lib/knowledge-context.ts";

export default defineTool({
  description: "Record something noticed as an observation. An observation is evidence, not an automatically trusted preference.",
  inputSchema: z.object({ statement: z.string().min(1).max(20_000), confidence: z.number().min(0).max(1).default(0.7), occurrenceCount: z.number().int().min(1).default(1), firstObservedAt: z.string().datetime().nullable().optional(), lastObservedAt: z.string().datetime().nullable().optional(), goalId: z.string().min(1).nullable().optional() }),
  async execute(input, ctx) { const actor = await knowledgeActor(ctx); const now = new Date().toISOString(); return createKnowledge({ ...actor, ...input, kind: "observation", firstObservedAt: input.firstObservedAt ?? now, lastObservedAt: input.lastObservedAt ?? now, provenance: await currentConversationProvenance(ctx, actor.ownerId) }); },
});
