import type { BetaIntegration } from '../beta-integration/runtime.ts';
import { CanonicalBetaWork } from '../beta-integration/canonical-work.ts';
import { OwnerPublication } from '../engineering/owner-publication.ts';
import { WorkError } from '../engineering/types.ts';
import { workState } from './work-state.ts';
import { getAgent, effectiveCapability } from '../agents.ts';
import { getCapabilities } from '../capability-registry.ts';
import { ROUTINE_RELEASE } from '../routine-release.ts';

/** Agent identity is never inferred from a role label or from the producer. */
export async function readAgentHome(beta: BetaIntegration, owner: string, agentId: string) {
  const agent = await getAgent(owner, agentId, beta);
  if (!agent) throw new WorkError('agent_not_found','Agent not found.',404);
  const [threads, references, routines, runs] = await Promise.all([
    beta.query(`SELECT id,title,updated_at FROM web_chat_threads WHERE owner_id=$1 AND (agent_id=$2 OR (agent_id IS NULL AND $3::boolean)) ORDER BY updated_at DESC,id DESC LIMIT 20`,[owner,agentId,agent.isPrimary]),
    beta.query(`SELECT w.id,max(c.created_at) AS at FROM context_assemblies c
      JOIN agent_runs r ON r.id=c.agent_run_id AND r.owner_id=c.owner_id AND r.agent_id=c.agent_id AND r.thread_id=c.thread_id AND r.session_id=c.session_id
      JOIN engineering_work w ON w.scope_id=c.owner_id AND w.scope_kind='personal' AND c.source_refs @> jsonb_build_array('engineering-work:' || w.id::text)
      WHERE c.owner_id=$1 AND c.agent_id=$2 GROUP BY w.id ORDER BY max(c.created_at) DESC,w.id DESC LIMIT 10`,[owner,agentId]),
    beta.query(`SELECT r.id,r.name,CASE WHEN m.status='cancelled' THEN 'stopped' ELSE r.status END AS status,r.last_success_at,m.next_fire_at,m.timezone,
      (SELECT jsonb_build_object('status',o.status,'at',o.completed_at,'runId',o.run_id) FROM execution_occurrences o WHERE o.owner_id=r.owner_id AND o.routine_id=r.id ORDER BY o.scheduled_for DESC LIMIT 1) AS last_run
      FROM execution_routines r LEFT JOIN reminders m ON m.owner_id=r.owner_id AND m.execution_routine_id=r.id
      WHERE r.owner_id=$1 AND r.agent_id=$2 AND r.status<>'archived' ORDER BY r.updated_at DESC,r.id DESC LIMIT 20`,[owner,agentId]),
    beta.query(`SELECT id,title,status,result_summary,thread_id,updated_at FROM task_runs WHERE owner_id=$1 AND agent_id=$2 ORDER BY updated_at DESC,id DESC LIMIT 20`,[owner,agentId]),
  ]);
  const works = await Promise.all(references.map(async reference => {
    const {projection} = await new CanonicalBetaWork(beta).projection(owner,String(reference.id));
    let publication: Awaited<ReturnType<OwnerPublication["view"]>> | null = null;
    if (projection.nativeResult?.current && projection.factoryWriter && projection.nativeDevelopment?.phase === 'VERIFICATION_PASSED') {
      try { publication = await new OwnerPublication(beta).view(owner, projection.workId); }
      catch (error) { if (!(error instanceof WorkError)) throw error; }
    }
    const state=workState(projection,publication);
    return {projection,needsDecision:state.lane === "Needs You",state};
  }));
  return {
    agent: {id:agent.id,name:agent.name,handle:agent.slug,purpose:agent.description||agent.role,role:agent.role,configurationStatus:agent.status,avatarConfig:agent.avatarConfig},
    authority: getCapabilities().filter(c=>agent.capabilities.some(a=>a.id===c.id)||(agent.isPrimary&&['tool.list_emails','tool.send_email','tool.engineering_work','tool.engineering_factory'].includes(c.id))).slice(0,16).map(c=>{
      const access=effectiveCapability(agent,c.id);
      return {id:c.id,name:c.name,description:c.description,availability:c.availability.status,allowed:access.allowed,reason:access.reason??null,approval:c.approvalPolicy.mode,permissions:[...c.permissions]};
    }),
    // Release-disabled responsibilities must never look like active monitoring.
    routineExecutionQualified:ROUTINE_RELEASE.enabled,
    works, threads:threads.map(t=>({id:String(t.id),title:String(t.title)})),
    routines:routines.map(r=>({id:String(r.id),name:String(r.name),status:String(r.status),timezone:r.timezone?String(r.timezone):null,
      nextRun:r.next_fire_at?new Date(r.next_fire_at).toISOString():null,lastRun:r.last_run??null})),
    runs:runs.map(r=>({id:String(r.id),title:String(r.title),status:String(r.status),summary:r.result_summary?String(r.result_summary):null,threadId:r.thread_id?String(r.thread_id):null})),
    bounds:{threads:20,works:10,routines:20,runs:20},
  };
}
export type AgentHomeView=Awaited<ReturnType<typeof readAgentHome>>;
