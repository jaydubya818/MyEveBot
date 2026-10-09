import { defineTool } from "eve/tools";
import { z } from "zod";
import { createKnowledge } from "../../lib/knowledge.ts";
import { currentConversationProvenance, knowledgeActor } from "../lib/knowledge-context.ts";

export default defineTool({
  description: "Record an explicitly proposed hypothesis as uncertain Knowledge, with a test and evidence threshold. Never present it as a confirmed fact.",
  inputSchema: z.object({
    statement: z.string().trim().min(1).max(20_000),
    confidence: z.number().min(0).max(1).default(0.5),
    testDescription: z.string().trim().min(1).max(10_000),
    decisionTrigger: z.string().max(10_000).nullable().optional(),
    goalId: z.string().min(1).nullable().optional(),
  }),
  async execute(input, ctx) {
    const actor = await knowledgeActor(ctx);
    return createKnowledge({ ...actor, ...input, kind: "hypothesis", provenance: await currentConversationProvenance(ctx, actor.ownerId) });
  },
});
