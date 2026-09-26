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
  description: `Save one durable memory in an authorized owner, current Agent, current Goal, or current Task scope. Owner memory is not automatically shared with every Agent. Check the returned syncState before telling the owner it is synced: local_only means the local record was saved without remote semantic sync; remote_unknown means the remote write outcome is uncertain and must not be retried. Phrase it plainly, e.g. '${ownerName()} prefers metric units'. Never save secrets, passwords, tokens, payment details, or temporary run output.`,
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
      // Provenance comes from the authenticated Action, never from model input.
      // A scheduled occurrence may consolidate prior facts; it is not a new
      // explicit statement by the owner.
      const sourceType = action.trigger.kind === "owner_chat" ? "chat" : "run";
      const sourceId = action.trigger.id ?? action.runId;
      const result = await new ActionGateway().execute(action, {
        async resolveTarget() {
          return { provider: "supermemory", account: access.ownerId, resource: `${targetScope.type}:${targetScope.id}` };
        },
        async execute(parameters, authority) {
          await consumeActionAuthority(authority, parameters, "tool.remember");
          return memoryStore.add(content, {
            context: access, scope: targetScope, permanent, sourceType, sourceId,
          });
        },
        receipt: entry => ({ memoryId: entry.id, scope: entry.scope, syncState: entry.syncState, degraded: entry.degraded }),
        async verify(entry) {
          const saved = (await memoryStore.list(access)).find(candidate => candidate.id === entry.id);
          const verified = !!saved && saved.content === content && saved.permanent === permanent
            && saved.scope.type === targetScope.type && saved.scope.id === targetScope.id;
          return { verified, receipt: { memoryId: entry.id, scope: entry.scope, verified,
            syncState: saved?.syncState ?? null, degraded: saved?.degraded ?? true } };
        },
      }, ctx.abortSignal);
      const receiptState = result.receipt.syncState;
      const syncState = receiptState === "synced" || receiptState === "local_only" || receiptState === "remote_unknown"
        ? receiptState : "unknown";
      const outcome = syncState === "synced"
        ? { status: "saved" as const, message: "Memory saved locally and synced to semantic Memory." }
        : syncState === "local_only"
          ? { status: "saved_local_only" as const, message: "Memory saved locally. Remote semantic Memory is unavailable; it has not been synced." }
          : syncState === "remote_unknown"
            ? { status: "saved_remote_unknown" as const, message: "Memory saved locally. The remote write outcome is unknown; do not retry or claim it is synced." }
            : { status: "saved_sync_unknown" as const, message: "The Action completed, but its receipt does not establish remote sync. Check Memory status before claiming it is synced." };
      return { ...outcome, id: result.receipt.memoryId, syncState, retryable: false, ...result };
    } catch (error) {
      if (error instanceof ActionBlocked) {
        return { status: error.status, actionId: error.actionId, retryable: false,
          message: `${error.message} Do not retry or promise background saves; report this status to the owner.` };
      }
      throw error;
    }
  },
});
