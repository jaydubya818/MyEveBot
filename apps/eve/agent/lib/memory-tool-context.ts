import type { MemoryScope } from "../../lib/memory-scopes.ts";
import { db } from "./receipts-db.ts";
import type { MemoryAccessContext } from "./memory-store.ts";
import { resolveSessionAgent } from "./session-settings.ts";

interface ToolContext {
  session: {
    id: string;
    auth: {
      current: {
        principalId?: string;
        principalType?: string;
        attributes: Record<string, unknown>;
      } | null;
      initiator?: {
        principalId?: string;
        principalType?: string;
        attributes: Record<string, unknown>;
      } | null;
    };
  };
}

export async function memoryAccessForTool(ctx: ToolContext): Promise<MemoryAccessContext> {
  const principal = ctx.session.auth.current;
  const ownerId = principal?.principalType === "user"
    ? principal.principalId?.trim()
    : process.env.MYEVE_OWNER_ID?.trim() || process.env.SOFIE_OWNER_ID?.trim();
  if (!ownerId) throw new Error("An owner identity is required for memory access.");
  const agent = await resolveSessionAgent({ ownerId, sessionId: ctx.session.id, auth: ctx.session.auth, primaryFallback: true });
  if (!agent) throw new Error("Agent does not belong to the current owner.");
  const rows = await db().query(
    `SELECT goal_id,coalesce(goal_task_id,task_run_id) AS task_id
     FROM context_assemblies WHERE owner_id=$1 AND agent_id=$2 AND session_id=$3
     ORDER BY created_at DESC LIMIT 1`,
    [ownerId, agent.id, ctx.session.id],
  ) as Array<Record<string, unknown>>;
  return {
    ownerId,
    agentId: agent.id,
    goalId: typeof rows[0]?.goal_id === "string" ? rows[0].goal_id : null,
    taskId: typeof rows[0]?.task_id === "string" ? rows[0].task_id : null,
  };
}

export function requestedMemoryScope(context: MemoryAccessContext, type: MemoryScope["type"], scopeId?: string): MemoryScope {
  if (type === "owner") return { type, id: context.ownerId };
  if (type === "agent") return { type, id: context.agentId };
  if (!scopeId) throw new Error(`A ${type} scope id is required.`);
  return { type, id: scopeId };
}
