import type { BetaIntegration } from '../beta-integration/runtime.ts';
import { CanonicalBetaWork } from '../beta-integration/canonical-work.ts';
import { WorkError } from '../engineering/types.ts';

/** Read-only association from server-retained context. Chat payloads, forked
 * transcripts and model-authored Work IDs are deliberately not authority. */
export async function readWorkThread(beta: BetaIntegration, owner: string, threadId: string, offset = 0) {
  const [thread] = await beta.query('SELECT id FROM web_chat_threads WHERE owner_id=$1 AND id=$2', [owner, threadId]);
  if (!thread) throw new WorkError('thread_not_found', 'Conversation not found.', 404);
  const rows = await beta.query(`
    SELECT w.id, max(c.created_at) AS associated_at
    FROM context_assemblies c
    JOIN agent_runs r ON r.id=c.agent_run_id AND r.owner_id=c.owner_id
      AND r.agent_id=c.agent_id AND r.session_id=c.session_id AND r.thread_id=c.thread_id
    JOIN agents a ON a.owner_id=c.owner_id AND a.id=c.agent_id
    JOIN engineering_work w ON w.scope_id=c.owner_id AND w.scope_kind='personal'
      AND c.source_refs @> jsonb_build_array('engineering-work:' || w.id::text)
    WHERE c.owner_id=$1 AND c.thread_id=$2
    GROUP BY w.id ORDER BY max(c.created_at) DESC,w.id DESC LIMIT 11 OFFSET $3`, [owner, threadId, offset]);
  const works = await Promise.all(rows.slice(0, 10).map(async row => ({
    ...await new CanonicalBetaWork(beta).projection(owner, String(row.id)),
    associatedAt: new Date(row.associated_at).toISOString(),
  })));
  return { works, nextOffset: rows.length > 10 ? offset + 10 : null };
}
export type WorkThreadView = Awaited<ReturnType<typeof readWorkThread>>;
