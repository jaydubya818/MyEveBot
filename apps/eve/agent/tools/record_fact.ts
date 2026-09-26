import { defineTool } from "eve/tools";
import { z } from "zod";
import { createKnowledge } from "../../lib/knowledge.ts";
import { EngineeringKnowledgeStore } from "../../lib/engineering/knowledge.ts";
import { WorkStore } from "../../lib/engineering/store.ts";
import { currentConversationProvenance, knowledgeActor } from "../lib/knowledge-context.ts";
import { assertEngineeringKnowledgeWorkBinding } from "../lib/engineering-knowledge-binding.ts";

export default defineTool({
  description: "Record a durable owner-scoped fact with conversation provenance. For a repository fact about selected Engineering Work, include engineeringWorkId; corrections must give supersedesId and new evidence. Do not use for guesses, observations, or preferences.",
  inputSchema: z.object({ statement: z.string().min(1).max(20_000), confidence: z.number().min(0).max(1).default(1), goalId: z.string().min(1).nullable().optional(), firstSeenAt: z.string().datetime().nullable().optional(), lastConfirmedAt: z.string().datetime().nullable().optional(), supersedesId: z.string().min(1).nullable().optional(), engineeringWorkId: z.string().uuid().optional() }),
  async execute(input, ctx) {
    const actor = await knowledgeActor(ctx);
    if (ctx.session.auth.current?.attributes.myeveEngineeringWorkId && !input.engineeringWorkId)
      throw new Error("Selected Engineering Work requires engineeringWorkId for fact recording.");
    if (input.engineeringWorkId) {
      if (input.goalId || input.firstSeenAt || input.lastConfirmedAt)
        throw new Error("Engineering Work facts do not accept Goal or generic fact dates.");
      await assertEngineeringKnowledgeWorkBinding(ctx, actor.ownerId, input.engineeringWorkId);
      const provenance = await currentConversationProvenance(ctx, actor.ownerId, input.engineeringWorkId);
      const store = new EngineeringKnowledgeStore(new WorkStore({
        scopeId: actor.ownerId, scopeKind: "personal", actorId: actor.createdById!,
      }));
      return store.save({
        workId: input.engineeringWorkId, statement: input.statement, confidence: input.confidence,
        sourceId: provenance[0]!.sourceId, origin: { type: "agent", agentId: actor.createdById! },
        supersedesId: input.supersedesId ?? undefined,
      });
    }
    const provenance = await currentConversationProvenance(ctx, actor.ownerId);
    const { engineeringWorkId: _engineeringWorkId, ...knowledgeInput } = input;
    return createKnowledge({ ...actor, ...knowledgeInput, kind: "fact", provenance });
  },
});
