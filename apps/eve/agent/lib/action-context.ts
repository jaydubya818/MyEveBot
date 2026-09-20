import { createHash } from "node:crypto";
import type { ToolContext } from "eve/tools";
import { ActionBlocked, type ActionRequest } from "../../lib/action-gateway.ts";
import { executionIdentityFromAuth, resolveExecution } from "../../lib/execution-auth.ts";
import { resolveSessionAgent } from "./session-settings.ts";
import { db } from "./receipts-db.ts";

/** Derive identity from verified runtime state, never tool/model parameters. */
export async function toolActionRequest(
  ctx: ToolContext,
  input: Pick<ActionRequest,"capabilityId"|"actionClass"|"parameters"|"computer">,
):Promise<ActionRequest> {
  const caller=ctx?.session?.auth.current;
  if(!caller || caller.attributes.role==="guest" || !ctx.callId) throw new ActionBlocked("denied","unresolved");
  const ownerId=caller.principalId;
  const identity=executionIdentityFromAuth(ctx.session.auth);
  const occurrence=identity?await resolveExecution(identity):null;
  const agent=await resolveSessionAgent({ownerId,sessionId:ctx.session.id,auth:ctx.session.auth,primaryFallback:caller.attributes.owner==="true"});
  if(!agent || agent.status!=="active" || (occurrence && occurrence.agentId!==agent.id)) throw new ActionBlocked("denied","unresolved");
  // No inherited parent identity or unbounded grant for children, runtime jobs,
  // inbound email/webhooks, or external callers. Those need explicit adapters.
  if(!occurrence && (ctx.session.parent || caller.principalType!=="user" || caller.attributes.owner!=="true")) {
    throw new ActionBlocked("denied","unresolved");
  }
  let runId=occurrence?.runId;
  if(!runId) {
    const linked=await db().query(`SELECT r.id,r.agent_id FROM task_runs r JOIN task_run_sessions s ON s.task_id=r.id
      WHERE r.owner_id=$1 AND s.session_id=$2`,[ownerId,ctx.session.id]);
    if(linked[0]) {
      if(linked[0].agent_id!==agent.id)throw new ActionBlocked("denied","unresolved");
      runId=String(linked[0].id);
    } else {
      runId=`action_run_${createHash("sha256").update(JSON.stringify([ownerId,ctx.session.id])).digest("hex")}`;
      await db().query(`WITH run AS (
        INSERT INTO task_runs(id,owner_id,kind,title,agent_id,status,max_duration_seconds,max_specialists,
          max_model_steps,max_retries_per_specialist,max_estimated_cost_usd,started_at,deadline_at)
        VALUES($1,$2,'delegated_work','Owner-requested actions',$3,'running',$4::integer,0,$5,0,$6,now(),now()+($4*interval '1 second'))
        ON CONFLICT(id) DO NOTHING RETURNING id
      ) INSERT INTO task_run_sessions(task_id,session_id,role) SELECT id,$7,'orchestrator' FROM run
        ON CONFLICT(session_id) DO NOTHING`,[runId,ownerId,agent.id,agent.limits.maxRuntimeSeconds,agent.limits.maxSteps,agent.limits.maxEstimatedCostUsd,ctx.session.id]);
      const bound=await db().query(`SELECT task_id FROM task_run_sessions WHERE session_id=$1`,[ctx.session.id]);
      if(bound[0]?.task_id!==runId)throw new ActionBlocked("denied","unresolved");
    }
  }
  const roleId=caller.attributes.myeveRoleId;
  return {...input,ownerId,runId,actionKey:`tool:${ctx.callId}`,
    executor:{kind:occurrence?"routine":typeof roleId==="string"?"on-demand-role":agent.isPrimary?"primary-agent":"persistent-agent",agentId:agent.id,...(typeof roleId==="string"?{roleId}:{})},
    trigger:{kind:occurrence?"scheduled_occurrence":"owner_chat",id:occurrence?.occurrenceId??ctx.session.id},
    ...(occurrence?{occurrence:{id:occurrence.occurrenceId,claimVersion:occurrence.version,workerId:occurrence.workerId}}:{})};
}
