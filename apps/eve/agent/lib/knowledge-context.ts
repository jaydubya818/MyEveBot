import type { ToolContext } from "eve/tools";

import { createKnowledgeSource, type CreateKnowledgeInput } from "../../lib/knowledge.ts";
import { effectiveCapability } from "../../lib/agents.ts";
import {resolveSessionAgent} from "./session-settings.ts";
import {executionIdentityFromAuth,resolveExecution} from "../../lib/execution-auth.ts";
import { taskOwnerFromAuth } from "../../lib/task-runs.ts";
import {getCapability} from "../../lib/capability-registry.ts";

export async function knowledgeActor(ctx: ToolContext): Promise<Pick<CreateKnowledgeInput, "ownerId" | "createdByType" | "createdById">> {
  const ownerId = taskOwnerFromAuth(ctx.session.auth);
  const auth=ctx.session.auth.current;
  if(!auth || auth.attributes.role==="guest")throw new Error("Knowledge write requires authenticated owner scope.");
  const agent=await resolveSessionAgent({ownerId,sessionId:ctx.session.id,auth:ctx.session.auth,primaryFallback:auth.attributes.owner==="true"});
  const capability=`tool.${ctx.toolName}`;
  if(!agent || agent.status!=="active" || !effectiveCapability(agent,capability).allowed)throw new Error("Knowledge write is unavailable to this Agent.");
  const identity=executionIdentityFromAuth(ctx.session.auth);
  if(identity) {
    const occurrence=await resolveExecution(identity);
    if(occurrence.agentId!==agent.id || !occurrence.configuration.authority.allowedCapabilities.includes(capability))throw new Error("Routine does not grant this Knowledge write.");
    const authority=occurrence.configuration.authority;
    const definition=getCapability(capability),rank={low:0,medium:1,high:2,critical:3};
    if(!definition || rank[definition.risk.level]>rank[authority.maximumRisk] || authority.requiresApprovalFor.includes(capability)
      || authority.allowedTargets.some(t=>t.capabilityId===capability))throw new Error("Routine Knowledge authority cannot be satisfied.");
  }
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
