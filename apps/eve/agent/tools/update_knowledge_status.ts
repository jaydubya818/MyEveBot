import { defineTool } from "eve/tools";
import { z } from "zod";
import { transitionKnowledge } from "../../lib/knowledge.ts";
import { KNOWLEDGE_STATUSES, type KnowledgeStatus } from "../../lib/knowledge-types.ts";
import { knowledgeActor } from "../lib/knowledge-context.ts";

export default defineTool({
  description: "Update a structured Knowledge record's status when the owner explicitly confirms the change, such as fulfilling a commitment or rejecting a hypothesis. Inspect the record first; only valid transitions are allowed. Record a replacement with supersedesId when changing its content.",
  inputSchema: z.object({
    id: z.string().min(1),
    status: z.enum([...new Set(Object.values(KNOWLEDGE_STATUSES).flat())] as [KnowledgeStatus, ...KnowledgeStatus[]]),
  }),
  async execute({ id, status }, ctx) {
    const actor = await knowledgeActor(ctx);
    return transitionKnowledge(actor.ownerId, id, status);
  },
});
