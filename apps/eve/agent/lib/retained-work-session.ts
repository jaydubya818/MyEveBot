import { db } from './receipts-db.ts';

export function replaySessionId(request: Request): string | null {
  return request.method === 'GET' ? /^\/eve\/v1\/session\/([^/]+)\/stream$/.exec(new URL(request.url).pathname)?.[1] ?? null : null;
}

/** Every web replay, including requests without Work headers, checks runtime ownership. */
export async function retainedSessionOwner(sessionId: string, ownerId: string, threadId?: string): Promise<boolean | null> {
  const rows = await db().query('SELECT DISTINCT owner_id,thread_id FROM agent_runs WHERE session_id=$1', [sessionId]);
  if (!rows.length) return null; // The create acknowledgment can precede turn.started binding.
  return rows.every(row => row.owner_id === ownerId && (!threadId || row.thread_id === threadId));
}

/** Reading an existing owner-bound transcript does not require live Work authority. */
export async function retainedWorkSessionRead(request: Request, ownerId: string, threadId: string, workId: string): Promise<boolean> {
  const sessionId = replaySessionId(request);
  if (!sessionId) return false;
  // The chat JSON is owner-editable. The server-written model ledger, not
  // that JSON, establishes the session's owner and Work association.
  const rows = await db().query(`SELECT t.chat FROM web_chat_threads t
    JOIN engineering_work w ON w.scope_id=t.owner_id AND w.scope_kind='personal' AND w.id=$3
    WHERE t.owner_id=$1 AND t.id=$2 AND EXISTS (
      SELECT 1 FROM engineering_work_model_calls c
      WHERE c.scope_id=w.scope_id AND c.scope_kind=w.scope_kind AND c.work_id=w.id
        AND c.actor_id=$1 AND c.session_id=$4
    )`, [ownerId, threadId, workId, sessionId]);
  if (rows.length !== 1) return false;
  const chat = rows[0].chat;
  return chat?.session?.sessionId === sessionId && chat?.workSelection?.workId === workId && chat?.workContextLocked === true;
}
