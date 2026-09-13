import type { ModelMessage } from "ai";

import { ensurePrimaryAgent, getAgent, type AgentReasoning, type AgentView } from "../../lib/agents.ts";

const CLIENT_CONTEXT_PREFIX = "Client context:\n";
const MODEL_ID_PATTERN = /^[\w.-]+\/[\w.:-]+$/;

export interface ClientTurnSettings {
  model: string | null;
  reasoning: AgentReasoning | null;
}

const EMPTY: ClientTurnSettings = { model: null, reasoning: null };

function marker(text: string): ClientTurnSettings | null {
  if (!text.startsWith(CLIENT_CONTEXT_PREFIX)) return null;
  try {
    const value: unknown = JSON.parse(text.slice(CLIENT_CONTEXT_PREFIX.length));
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    const reasoningLevels = ["none", "minimal", "low", "medium", "high", "xhigh"];
    return {
      model: typeof record.eveWebModel === "string" && MODEL_ID_PATTERN.test(record.eveWebModel) ? record.eveWebModel : null,
      reasoning: typeof record.eveWebReasoning === "string" && reasoningLevels.includes(record.eveWebReasoning) ? record.eveWebReasoning as AgentReasoning : null,
    };
  } catch { return null; }
}

export function clientTurnSettings(messages: readonly ModelMessage[]): ClientTurnSettings {
  for (let index = messages.length - 1; index >= 0; index--) {
    const content = messages[index].content;
    const texts = typeof content === "string" ? [content] : content.map((part) => "text" in part && typeof part.text === "string" ? part.text : "");
    for (const text of texts) { const parsed = marker(text); if (parsed) return parsed; }
  }
  return EMPTY;
}

export async function sessionAgent(ownerId: string | undefined, authenticatedAgentId?: unknown, primaryFallback = false): Promise<AgentView | null> {
  if (!ownerId) return null;
  const agentId = typeof authenticatedAgentId === "string" && authenticatedAgentId.length <= 100 ? authenticatedAgentId : null;
  if (!agentId) return primaryFallback ? ensurePrimaryAgent(ownerId) : null;
  return getAgent(ownerId, agentId);
}

export async function bindAgentRun(sessionId: string, turnId: string, ownerId: string, agent: AgentView, threadId: string | null): Promise<void> {
  const { db } = await import("./receipts-db.ts");
  await db().query(
    `INSERT INTO agent_runs (id, session_id, owner_id, agent_id, thread_id) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (id) DO UPDATE SET agent_id=EXCLUDED.agent_id, thread_id=coalesce(EXCLUDED.thread_id,agent_runs.thread_id), status='running', completed_at=NULL, updated_at=now()`,
    [`agent_run_${sessionId}_${turnId}`, sessionId, ownerId, agent.id, threadId],
  );
}

export async function agentForSession(sessionId: string, ownerId: string): Promise<AgentView | null> {
  const { db } = await import("./receipts-db.ts");
  const rows = await db().query(`SELECT agent_id FROM agent_runs WHERE session_id=$1 AND owner_id=$2 ORDER BY updated_at DESC LIMIT 1`, [sessionId, ownerId]) as Array<Record<string, unknown>>;
  return rows[0] ? getAgent(ownerId, String(rows[0].agent_id)) : null;
}
