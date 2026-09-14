import type { ModelMessage } from "ai";

import { ensurePrimaryAgent, getAgent, type AgentReasoning, type AgentView } from "../../lib/agents.ts";
import { db } from "./receipts-db.ts";

const CLIENT_CONTEXT_PREFIX = "Client context:\n";
const MODEL_ID_PATTERN = /^[\w.-]+\/[\w.:-]+$/;

export interface ClientTurnSettings {
  model: string | null;
  reasoning: AgentReasoning | null;
}

const EMPTY: ClientTurnSettings = { model: null, reasoning: null };

interface SessionPrincipal {
  principalId?: string;
  attributes?: Record<string, unknown>;
}

export interface SessionAgentResolutionInput {
  ownerId: string | undefined;
  sessionId: string;
  auth: {
    current?: SessionPrincipal | null;
    initiator?: SessionPrincipal | null;
  };
  primaryFallback?: boolean;
}

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

function attribute(principal: SessionPrincipal | null | undefined, name: string): string | null {
  const value = principal?.attributes?.[name];
  return typeof value === "string" && value.trim().length > 0 && value.length <= 100 ? value.trim() : null;
}

export async function resolveSessionAgent(input: SessionAgentResolutionInput): Promise<AgentView | null> {
  if (!input.ownerId) return null;
  const currentAgentId = attribute(input.auth.current, "myeveAgentId");
  const initiatingAgentId = attribute(input.auth.initiator, "myeveAgentId");
  const currentThreadId = attribute(input.auth.current, "webThreadId");
  const initiatingThreadId = attribute(input.auth.initiator, "webThreadId");
  if (currentThreadId && initiatingThreadId && currentThreadId !== initiatingThreadId) {
    throw new Error("Thread binding does not match the persisted session binding.");
  }
  const threadId = initiatingThreadId ?? currentThreadId;
  const runRows = await db().query(
    `SELECT DISTINCT owner_id,agent_id FROM agent_runs WHERE session_id=$1`,
    [input.sessionId],
  ) as Array<Record<string, unknown>>;
  if (runRows.some((row) => String(row.owner_id) !== input.ownerId)) {
    throw new Error("Session does not belong to the current owner.");
  }
  const runAgentIds = [...new Set(runRows.map((row) => String(row.agent_id)))];
  if (runAgentIds.length > 1) throw new Error("Session has conflicting persisted Agent bindings.");

  let threadAgentId: string | null = null;
  if (threadId) {
    const threadRows = await db().query(`SELECT owner_id,agent_id FROM web_chat_threads WHERE id=$1 LIMIT 1`, [threadId]) as Array<Record<string, unknown>>;
    const thread = threadRows[0];
    if (thread && String(thread.owner_id) !== input.ownerId) throw new Error("Thread does not belong to the current owner.");
    if (typeof thread?.agent_id === "string" && thread.agent_id.length > 0) threadAgentId = thread.agent_id;
  }

  const persistedIds = [...new Set([initiatingAgentId, runAgentIds[0] ?? null, threadAgentId].filter((id): id is string => id !== null))];
  if (persistedIds.length > 1) throw new Error("Agent binding does not match the persisted session or thread binding.");
  const persistedAgentId = persistedIds[0] ?? null;
  if (currentAgentId && persistedAgentId && currentAgentId !== persistedAgentId) {
    throw new Error("Requested Agent does not match the persisted session or thread binding.");
  }
  const effectiveAgentId = persistedAgentId ?? currentAgentId;
  if (!effectiveAgentId) return input.primaryFallback ? ensurePrimaryAgent(input.ownerId) : null;
  const agent = await getAgent(input.ownerId, effectiveAgentId);
  if (!agent) throw new Error("Persisted Agent binding does not belong to the current owner.");
  if (agent.status !== "active") throw new Error(`${agent.name} is ${agent.status} and cannot execute new work.`);
  return agent;
}

export async function bindAgentRun(sessionId: string, turnId: string, ownerId: string, agent: AgentView, threadId: string | null): Promise<void> {
  const existing = await db().query(`SELECT DISTINCT agent_id FROM agent_runs WHERE session_id=$1 AND owner_id=$2`, [sessionId, ownerId]) as Array<Record<string, unknown>>;
  if (existing.some((row) => String(row.agent_id) !== agent.id)) throw new Error("Cannot change a persisted session Agent binding.");
  if (threadId) {
    await db().query(`UPDATE web_chat_threads SET agent_id=$3 WHERE owner_id=$1 AND id=$2 AND agent_id IS NULL`, [ownerId, threadId, agent.id]);
    const threads = await db().query(`SELECT owner_id,agent_id FROM web_chat_threads WHERE id=$1 LIMIT 1`, [threadId]) as Array<Record<string, unknown>>;
    const thread = threads[0];
    if (thread && String(thread.owner_id) !== ownerId) throw new Error("Thread does not belong to the current owner.");
    if (typeof thread?.agent_id === "string" && thread.agent_id !== agent.id) throw new Error("Cannot change a persisted thread Agent binding.");
  }
  await db().query(
    `INSERT INTO agent_runs (id, session_id, owner_id, agent_id, thread_id) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (id) DO UPDATE SET agent_id=EXCLUDED.agent_id, thread_id=coalesce(EXCLUDED.thread_id,agent_runs.thread_id), status='running', completed_at=NULL, updated_at=now()`,
    [`agent_run_${sessionId}_${turnId}`, sessionId, ownerId, agent.id, threadId],
  );
}

export async function agentForSession(sessionId: string, ownerId: string): Promise<AgentView | null> {
  const rows = await db().query(`SELECT agent_id FROM agent_runs WHERE session_id=$1 AND owner_id=$2 ORDER BY updated_at DESC LIMIT 1`, [sessionId, ownerId]) as Array<Record<string, unknown>>;
  return rows[0] ? getAgent(ownerId, String(rows[0].agent_id)) : null;
}
