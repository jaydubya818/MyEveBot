import { randomUUID } from "node:crypto";

import { db } from "../agent/lib/receipts-db.ts";

export interface ThreadSummaryInput {
  purpose: string;
  importantFacts?: string[];
  decisions?: string[];
  openQuestions?: string[];
  commitments?: string[];
  goalId?: string | null;
  sourceMessageCount?: number;
}

function clean(value: string, max = 4000): string { return value.replaceAll("\0", "").trim().slice(0, max); }
function cleanList(values: readonly string[] | undefined): string[] { return (values ?? []).map((value) => clean(value, 1000)).filter(Boolean).slice(0, 50); }

export async function saveThreadSummary(ownerId: string, threadId: string, input: ThreadSummaryInput): Promise<string> {
  const thread = await db().query(`SELECT id FROM web_chat_threads WHERE owner_id=$1 AND id=$2 LIMIT 1`, [ownerId, threadId]);
  if (!thread[0]) throw new Error("Thread does not belong to this owner.");
  if (input.goalId) {
    const goal = await db().query(`SELECT id FROM goals WHERE owner_id=$1 AND id=$2 LIMIT 1`, [ownerId, input.goalId]);
    if (!goal[0]) throw new Error("Goal does not belong to this owner.");
  }
  const id = `thread_summary_${randomUUID()}`;
  await db().transaction((tx) => [
    tx`UPDATE thread_summaries SET status='superseded',updated_at=now() WHERE owner_id=${ownerId} AND thread_id=${threadId} AND status='active'`,
    tx`INSERT INTO thread_summaries
      (id,owner_id,thread_id,goal_id,purpose,important_facts,decisions,open_questions,commitments,source_message_count)
      VALUES (${id},${ownerId},${threadId},${input.goalId ?? null},${clean(input.purpose)},${JSON.stringify(cleanList(input.importantFacts))}::jsonb,
        ${JSON.stringify(cleanList(input.decisions))}::jsonb,${JSON.stringify(cleanList(input.openQuestions))}::jsonb,
        ${JSON.stringify(cleanList(input.commitments))}::jsonb,${Math.max(0, Math.floor(input.sourceMessageCount ?? 0))})`,
  ]);
  return id;
}

export async function addRunContext(input: {
  ownerId: string;
  agentId: string;
  taskRunId: string;
  content: string;
  goalId?: string | null;
  goalTaskId?: string | null;
  sourceType?: string;
  sourceId?: string | null;
  expiresAt?: string | null;
}): Promise<string> {
  const rows = await db().query(
    `SELECT r.id FROM task_runs r JOIN agents a ON a.owner_id=r.owner_id AND a.id=$2
     WHERE r.owner_id=$1 AND r.id=$3 AND (r.agent_id IS NULL OR r.agent_id=$2) LIMIT 1`,
    [input.ownerId, input.agentId, input.taskRunId],
  );
  if (!rows[0]) throw new Error("Run is not authorized for this owner and Agent.");
  const content = clean(input.content, 12_000);
  if (!content) throw new Error("Run context content is required.");
  const id = `run_context_${randomUUID()}`;
  await db().query(
    `INSERT INTO run_context_entries
      (id,owner_id,agent_id,task_run_id,goal_id,goal_task_id,content,source_type,source_id,expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [id, input.ownerId, input.agentId, input.taskRunId, input.goalId ?? null, input.goalTaskId ?? null,
      content, input.sourceType ?? "checkpoint", input.sourceId ?? null, input.expiresAt ?? null],
  );
  return id;
}

export async function contextDiagnostics(ownerId: string, sessionId: string): Promise<Record<string, unknown> | null> {
  const rows = await db().query(
    `SELECT id,agent_id,agent_run_id,thread_id,goal_id,goal_task_id,task_run_id,memory_refs,thread_summary_id,
            source_refs,estimated_tokens,budget,created_at
     FROM context_assemblies WHERE owner_id=$1 AND session_id=$2 ORDER BY created_at DESC LIMIT 1`,
    [ownerId, sessionId],
  ) as Array<Record<string, unknown>>;
  return rows[0] ?? null;
}
