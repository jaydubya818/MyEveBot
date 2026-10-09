import { defineTool } from "eve/tools";
import { z } from "zod";
import { ownerName } from "../lib/owner";
import { ActionBlocked, ActionGateway, consumeActionAuthority } from "../../lib/action-gateway.ts";
import { scopeIsAllowed, validateMemoryScope } from "../../lib/memory-scopes.ts";
import { toolActionRequest } from "../lib/action-context.ts";
import { memoryAccessForTool, requestedMemoryScope } from "../lib/memory-tool-context.ts";
import { memoryStore } from "../lib/memory-store.ts";
import { ownerOnly } from "../lib/owner-gate.ts";

export default defineTool({
  approval: ownerOnly,
  description: `Save one durable memory in an authorized owner, current Agent, current Goal, or current Task scope. Owner memory is not automatically shared with every Agent. Phrase it plainly, e.g. '${ownerName()} prefers metric units'. Never save secrets, passwords, tokens, payment details, or temporary run output.`,
  inputSchema: z.object({
    memory: z.string().min(1).max(4000).describe("The fact to remember, phrased plainly and entity-centric"),
    scope: z.enum(["owner", "agent", "goal", "task"]).default("owner")
      .describe("owner for broadly reusable personal context; agent for this Agent only; goal/task only for the current authorized execution"),
    scopeId: z.string().max(200).optional().describe("Required for goal or task scope. It must match the current execution."),
    permanent: z
      .boolean()
      .default(false)
      .describe("True for stable traits that rarely change (name, city, family, profession); false for recent or evolving context"),
  }),
  async execute({ memory, permanent, scope, scopeId }, ctx) {
    try {
      const content = memory.replaceAll("\0", "").trim();
      if (!content) return { status: "invalid_input", retryable: false, message: "Memory must contain text." };
      const action = await toolActionRequest(ctx, {
        capabilityId: "tool.remember", actionClass: "write", parameters: { content, permanent, scope, scopeId },
      });
      const access = await memoryAccessForTool(ctx);
      if (access.ownerId !== action.ownerId || access.agentId !== action.executor.agentId) {
        throw new ActionBlocked("denied", "memory_identity_mismatch");
      }
      const targetScope = requestedMemoryScope(access, scope, scopeId);
      if (validateMemoryScope(targetScope) || !scopeIsAllowed(targetScope, access)) {
        return { status: "denied", retryable: false, message: "Memory scope is outside this execution. Do not retry with another scope." };
      }
      const result = await new ActionGateway().execute(action, {
        async resolveTarget() {
          return { provider: "supermemory", account: access.ownerId, resource: `${targetScope.type}:${targetScope.id}` };
        },
        async execute(parameters, authority) {
          await consumeActionAuthority(authority, parameters, "tool.remember");
          return memoryStore.add(content, {
            context: access, scope: targetScope, permanent, sourceType: "explicit", sourceId: ctx.session.id,
          });
        },
        receipt: entry => ({ memoryId: entry.id, scope: entry.scope }),
        async verify(entry) {
          const saved = (await memoryStore.list(access)).find(candidate => candidate.id === entry.id);
          const verified = !!saved && saved.content === content && saved.permanent === permanent
            && saved.scope.type === targetScope.type && saved.scope.id === targetScope.id;
          return { verified, receipt: { memoryId: entry.id, scope: entry.scope, verified } };
        },
      }, ctx.abortSignal);
      return { status: "saved", id: result.receipt.memoryId, ...result };
    } catch (error) {
      if (error instanceof ActionBlocked) {
        return { status: error.status, actionId: error.actionId, retryable: false,
          message: `${error.message} Do not retry or promise background saves; report this status to the owner.` };
      }
      throw error;
    }
  },
});
