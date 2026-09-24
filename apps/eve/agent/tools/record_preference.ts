import { defineTool } from "eve/tools";
import { z } from "zod";
import { createKnowledge } from "../../lib/knowledge.ts";
import { currentConversationProvenance, knowledgeActor } from "../lib/knowledge-context.ts";
import { ownerOnly } from "../lib/owner-gate.ts";

export default defineTool({
  approval: ownerOnly,
  description: "Record a preference explicitly stated by the owner in structured Knowledge. Do not infer preferences from observations or imported documents. Use supersedesId for an explicit replacement of an earlier preference.",
  inputSchema: z.object({
    statement: z.string().trim().min(1).max(20_000),
    preferenceKey: z.string().trim().min(1).max(200),
    preferenceValue: z.string().trim().min(1).max(4_000),
    preferenceScope: z.string().trim().min(1).max(200),
    supersedesId: z.string().min(1).nullable().optional(),
  }),
  async execute(input, ctx) {
    const actor = await knowledgeActor(ctx);
    return createKnowledge({ ...actor, ...input, kind: "preference", preferenceSourceType: "explicit_user", provenance: await currentConversationProvenance(ctx, actor.ownerId) });
  },
});
