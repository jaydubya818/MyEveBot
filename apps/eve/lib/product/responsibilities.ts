import type {ExecutionDatabase} from '../execution-types.ts';
import {ROUTINE_RELEASE} from '../routine-release.ts';

const textOrNull=(value:unknown)=>value==null?null:String(value);
const instant=(value:unknown)=>value==null?null:new Date(String(value)).toISOString();
/** Read existing owner records. This projection creates no schedule, notification,
 * Work association or authority and never infers success from agent prose. */
export async function readResponsibilities(db:ExecutionDatabase,ownerId:string){
 const [routines,results]=await Promise.all([
  db.query(`SELECT r.id,r.name,r.status,r.agent_id,a.name AS agent_name,m.next_fire_at,m.timezone,
    o.status AS last_status,(o.lease_expires_at>now()) AS live_claim,o.scheduled_for,o.completed_at,o.run_id,t.result_summary,
    h.id AS thread_id
    FROM execution_routines r JOIN agents a ON a.owner_id=r.owner_id AND a.id=r.agent_id
    LEFT JOIN reminders m ON m.owner_id=r.owner_id AND m.execution_routine_id=r.id AND r.source_kind='reminder' AND m.id::text=r.source_id
    LEFT JOIN LATERAL (SELECT * FROM execution_occurrences o WHERE o.owner_id=r.owner_id AND o.routine_id=r.id ORDER BY o.scheduled_for DESC,o.id DESC LIMIT 1) o ON true
    LEFT JOIN task_runs t ON t.owner_id=r.owner_id AND t.id=o.run_id
    LEFT JOIN web_chat_threads h ON h.owner_id=r.owner_id AND h.id=t.thread_id
    WHERE r.owner_id=$1 ORDER BY r.updated_at DESC,r.id DESC LIMIT 20`,[ownerId]),
  db.query(`SELECT d.id,o.id AS occurrence_id,r.name,r.agent_id,a.name AS agent_name,t.id AS run_id,t.result_summary,o.completed_at,h.id AS thread_id
    FROM review_deliveries d JOIN execution_occurrences o ON o.owner_id=d.owner_id AND o.id=d.occurrence_id AND o.run_id=d.run_id
    JOIN execution_routines r ON r.owner_id=o.owner_id AND r.id=o.routine_id
    JOIN agents a ON a.owner_id=r.owner_id AND a.id=r.agent_id
    JOIN task_runs t ON t.owner_id=d.owner_id AND t.id=d.run_id
    LEFT JOIN web_chat_threads h ON h.owner_id=t.owner_id AND h.id=t.thread_id
    WHERE d.owner_id=$1 AND o.status='completed' AND t.status='completed'
    ORDER BY o.completed_at DESC,d.id DESC LIMIT 10`,[ownerId]),
 ]);
 return {
  executionQualified:ROUTINE_RELEASE.enabled,
  routines:routines.map(r=>({id:String(r.id),name:String(r.name),agentId:String(r.agent_id),agentName:String(r.agent_name),
   state:r.status!=='active'?(r.status==='disabled'?'Stopped':String(r.status).replaceAll('_',' ')):['waiting','recovery_required','failed','blocked_precheck'].includes(String(r.last_status))?'Needs you':!ROUTINE_RELEASE.enabled?'Waiting':r.last_status==='running'?(r.live_claim?'Working':'Needs you'):'Scheduled',
   nextRun:r.status==='active'?instant(r.next_fire_at):null,timezone:textOrNull(r.timezone),
   lastRun:instant(r.completed_at??r.scheduled_for),lastStatus:textOrNull(r.last_status),
   summary:textOrNull(r.result_summary),threadId:textOrNull(r.thread_id)})),
  results:results.map(r=>({id:String(r.id),occurrenceId:String(r.occurrence_id),runId:String(r.run_id),name:String(r.name),agentId:String(r.agent_id),agentName:String(r.agent_name),summary:textOrNull(r.result_summary),completedAt:instant(r.completed_at),threadId:textOrNull(r.thread_id)})),
  bounds:{routines:20,results:10},
 };
}
export type ResponsibilitiesView=Awaited<ReturnType<typeof readResponsibilities>>;
