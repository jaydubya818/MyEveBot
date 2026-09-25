import { randomUUID } from "node:crypto";
import { ownerRuntimeFromAuth,resolveOwnerRuntime } from "../../lib/relay/owner/runtime.ts";
import type { ToolContext } from "eve/tools";
import { ActionBlocked, type ActionRequest } from "../../lib/action-gateway.ts";
import { executionIdentityFromAuth, resolveExecution } from "../../lib/execution-auth.ts";
import { resolveSessionAgent } from "./session-settings.ts";
import { db } from "./receipts-db.ts";

/** Derive identity from verified runtime state, never tool/model parameters. */
export async function toolActionRequest(
  ctx: Pick<ToolContext, "session" | "callId">,
  input: Pick<ActionRequest,"capabilityId"|"actionClass"|"parameters"|"computer">,
):Promise<ActionRequest> {
  const caller=ctx?.session?.auth.current;
  if(!caller || caller.attributes.role==="guest" || !ctx.callId) throw new ActionBlocked("denied","unresolved");
  const ownerId=caller.principalId;
  const ownerRuntime=ownerRuntimeFromAuth(ctx.session.auth);
  if(ownerRuntime){const binding=await resolveOwnerRuntime(ownerRuntime);if(binding.session_id!==ctx.session.id||ownerRuntime.ownerId!==ownerId)throw new ActionBlocked("denied","unresolved");}
  const identity=executionIdentityFromAuth(ctx.session.auth);
  const occurrence=identity?await resolveExecution(identity):null;
  const agent=await resolveSessionAgent({ownerId,sessionId:ctx.session.id,auth:ctx.session.auth,primaryFallback:caller.attributes.owner==="true"});
  if(!agent || agent.status!=="active" || (occurrence && occurrence.agentId!==agent.id)) throw new ActionBlocked("denied","unresolved");
  // No inherited parent identity or unbounded grant for children, runtime jobs,
  // inbound email/webhooks, or external callers. Those need explicit adapters.
  if(!occurrence && (ctx.session.parent || caller.principalType!=="user" || caller.attributes.owner!=="true")) {
    throw new ActionBlocked("denied","unresolved");
  }
  let runId=ownerRuntime?.runId??occurrence?.runId;
  if(!runId) {
    // Replays resolve their original durable Run, even after the session rolls over.
    const historical=await db().query(`SELECT a.run_id FROM action_requests a
      JOIN task_run_sessions s ON s.task_id=a.run_id
      WHERE a.owner_id=$1 AND s.session_id=$2 AND a.action_key=$3`,[ownerId,ctx.session.id,`tool:${ctx.callId}`]);
    if(historical.length>1)throw new ActionBlocked("denied","RUN_BINDING_INVALID");
    if(historical[0])runId=String(historical[0].run_id);
    else runId=await ownerChatRun({ownerId,sessionId:ctx.session.id,agentId:agent.id,recover:false,initialize:true});

  }
  const roleId=caller.attributes.myeveRoleId;
  return {...input,ownerId,runId,actionKey:`tool:${ctx.callId}`,
    executor:{kind:occurrence?"routine":typeof roleId==="string"?"on-demand-role":agent.isPrimary?"primary-agent":"persistent-agent",agentId:agent.id,...(typeof roleId==="string"?{roleId}:{})},
    trigger:{kind:occurrence?"scheduled_occurrence":"owner_chat",id:occurrence?.occurrenceId??ctx.session.id},
    ...(occurrence?{occurrence:{id:occurrence.occurrenceId,claimVersion:occurrence.version,workerId:occurrence.workerId}}:{})};
}

/** Recovery is only invoked on new owner input, never from a tool retry. */
export async function ownerChatRun(input:{ownerId:string;sessionId:string;agentId:string;recover:boolean;initialize:boolean}):Promise<string> {
  try {
    const rows=await db().query(`SELECT owner_chat_run($1,$2,$3,$4,$5,$6) AS id`,
      [input.ownerId,input.sessionId,input.agentId,`action_run_${randomUUID()}`,input.recover,input.initialize]);
    if(input.initialize && !rows[0]?.id)throw new Error("RUN_CREATION_FAILED");
    return rows[0]?.id==null?"":String(rows[0].id);
  } catch(error) {
    const message=error instanceof Error?error.message:"";
    const reason=["RUN_EXPIRED","RUN_NOT_EXECUTABLE","RUN_BINDING_INVALID","RUN_RECOVERY_REQUIRES_OWNER_REVIEW"].find(code=>message.includes(code));
    throw new ActionBlocked("denied",reason??"RUN_CREATION_FAILED");
  }
}
