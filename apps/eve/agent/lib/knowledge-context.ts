import type { ToolContext } from "eve/tools";

import { createKnowledgeSource, type CreateKnowledgeInput } from "../../lib/knowledge.ts";
import { ensurePrimaryAgent } from "../../lib/agents.ts";
import { taskOwnerFromAuth } from "../../lib/task-runs.ts";

export async function knowledgeActor(ctx: ToolContext): Promise<Pick<CreateKnowledgeInput, "ownerId" | "createdByType" | "createdById">> {
  const ownerId = taskOwnerFromAuth(ctx.session.auth);
  const rawAgentId = ctx.session.auth.current?.attributes.myeveAgentId;
  const requestedId = typeof rawAgentId === "string" ? rawAgentId : undefined;
  const agent = requestedId ? { id: requestedId } : await ensurePrimaryAgent(ownerId);
  return { ownerId, createdByType: "agent", createdById: agent.id };
}

export async function currentConversationProvenance(ctx: ToolContext, ownerId: string) {
  const rawThreadId = ctx.session.auth.current?.attributes.webThreadId;
  const threadId = typeof rawThreadId === "string" ? rawThreadId : undefined;
  const source = await createKnowledgeSource({
    ownerId,
    sourceType: "chat",
    provider: "eve",
    externalId: ctx.session.id,
    referenceUri: threadId ? `/?thread=${encodeURIComponent(threadId)}` : null,
    capturedAt: new Date().toISOString(),
  });
  return [{ sourceId: source.id, relation: "mentioned_in" as const, confidence: 1 }];
}
