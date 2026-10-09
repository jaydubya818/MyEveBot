import type { BetaIntegration } from '../beta-integration/runtime.ts';
import { CanonicalBetaWork } from '../beta-integration/canonical-work.ts';
import { OwnerPublication } from '../engineering/owner-publication.ts';
import { WorkError } from '../engineering/types.ts';
import { ownerWorkPresentation } from './owner-work.ts';
import { workState, type WorkLane } from './work-state.ts';

export async function readWorkInbox(beta: BetaIntegration, owner: string, offset = 0) {
  const rows = await beta.query(`SELECT id FROM engineering_work WHERE scope_id=$1 AND scope_kind='personal' ORDER BY updated_at DESC,id DESC LIMIT 21 OFFSET $2`,[owner,offset]);
  const works = await Promise.all(rows.slice(0,20).map(async row => {
    const {projection} = await new CanonicalBetaWork(beta).projection(owner,String(row.id));
    let publication: Awaited<ReturnType<OwnerPublication['view']>> | null = null;
    if (projection.nativeResult?.current && projection.factoryWriter && projection.nativeDevelopment?.phase === 'VERIFICATION_PASSED') {
      try { publication = await new OwnerPublication(beta).view(owner,projection.workId); }
      catch(error) { if (!(error instanceof WorkError)) throw error; }
    }
    const [thread] = await beta.query(`SELECT c.thread_id,a.name AS agent_name FROM context_assemblies c
      JOIN agent_runs r ON r.id=c.agent_run_id AND r.owner_id=c.owner_id AND r.agent_id=c.agent_id AND r.session_id=c.session_id AND r.thread_id=c.thread_id
      JOIN agents a ON a.owner_id=c.owner_id AND a.id=c.agent_id
      JOIN web_chat_threads t ON t.owner_id=c.owner_id AND t.id=c.thread_id
      WHERE c.owner_id=$1 AND c.source_refs @> jsonb_build_array($2::text)
      ORDER BY c.created_at DESC,c.id DESC LIMIT 1`,[owner,'engineering-work:'+projection.workId]);
    return {id:projection.workId,title:projection.title,...workState(projection,publication),display:ownerWorkPresentation(projection),
      result:projection.latestResult?.summary??null,resultId:projection.latestResult?.id??projection.nativeResult?.id??null,
      version:projection.workVersion,generation:projection.workGeneration,
      agentName:thread?.agent_name ? String(thread.agent_name) : null,
      threadId:thread?.thread_id ? String(thread.thread_id) : null};
  }));
  const counts: Record<WorkLane,number> = {'Needs You':0,Working:0,Monitoring:0,Completed:0,Waiting:0,Stopped:0,Ready:0};
  works.forEach(work=>counts[work.lane]++);
  return {works,counts,nextOffset:rows.length>20?offset+20:null,offset,limit:20};
}
export type WorkInboxView = Awaited<ReturnType<typeof readWorkInbox>>;
