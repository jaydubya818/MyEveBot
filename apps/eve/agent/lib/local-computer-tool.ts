import type { ApprovalContext } from "eve/tools/approval";
import type { DynamicResolveContext, ToolContext } from "eve/tools";
import { z } from "zod";
import { ActionBlocked, ActionGateway, consumeActionAuthority, type ActionAdapter } from "../../lib/action-gateway.ts";
import { approvalBinding, approvalRequestId, canonicalActionValue, decideApproval } from "../../lib/approvals.ts";
import { effectiveCapability } from "../../lib/agents.ts";
import { localConfiguredGrant, localOperationCapability, localReadOperation, localTaskSchema, type LocalTask, type LocalOperation } from "../../lib/local-computer-contract.ts";
import { enqueueLocalOperation, localDeviceStatus, localJob, localPairing } from "../../lib/local-computer-store.ts";
import { resolveSessionAgent } from "./session-settings.ts";
import { toolActionRequest } from "./action-context.ts";
import { db } from "./receipts-db.ts";

type Context = Pick<ToolContext, "session" | "callId"> & Partial<Pick<ToolContext,"abortSignal">>;

async function binding(ctx: {session: Pick<ToolContext["session"],"id"|"auth"> & {parent?:unknown}}, input: LocalTask) {
  const caller = ctx.session.auth.current;
  const pairing = localPairing();
  const principals=[caller,ctx.session.auth.initiator];
  if(principals.some(principal=>principal?.attributes.ownerChannelRun || principal?.attributes.myeveEngineeringWorkId))
    throw new ActionBlocked("denied","local_owner_chat_required");
  if (!caller || caller.principalType !== "user" || caller.attributes.owner !== "true"
    || caller.attributes.role === "guest" || caller.attributes.myeveRoleId || ctx.session.parent
    || !pairing || caller.principalId !== pairing.ownerId) throw new ActionBlocked("denied","local_owner_required");
  const agent = await resolveSessionAgent({ownerId:caller.principalId,sessionId:ctx.session.id,auth:ctx.session.auth,primaryFallback:true});
  const capabilityId = localOperationCapability(input);
  if (!localConfiguredGrant(input)) throw new ActionBlocked("denied","computer_grant_required");
  if (!agent || !effectiveCapability(agent,capabilityId).allowed) throw new ActionBlocked("denied","local_capability_denied");
  return {agent,pairing,capabilityId};
}
function target(pairing: NonNullable<ReturnType<typeof localPairing>>) {
  return {provider:"local-mac",account:pairing.ownerId,resource:pairing.deviceId,environment:pairing.hash};
}

export async function executeLocalTool(value: LocalTask, ctx: Context, prepareOnly=false) {
  const input=localTaskSchema.parse(value);
  try {
    const {agent,pairing,capabilityId}=await binding(ctx,input);
    if(input.operation==="status") {
      return input.job_id ? await waitForJob(pairing.ownerId,agent.id,ctx,input.job_id) : await localDeviceStatus(pairing.ownerId);
    }
    const device=await localDeviceStatus(pairing.ownerId);
    if(device.status!=="ready")return {...device,message:"The Mac companion is offline. Check npm run local:service -- status on the Mac; no operation was queued."};
    const action=await toolActionRequest(ctx,{capabilityId,actionClass:localReadOperation(input)?"read":"execute",parameters:input});
    if(action.trigger.kind!=="owner_chat" || action.executor.agentId!==agent.id)throw new ActionBlocked("denied","local_owner_required");
    const adapter:ActionAdapter<{jobId:string;status:string}>={
      async resolveTarget(){return target((await binding(ctx,input)).pairing);},
      async execute(parameters,authority){
        await consumeActionAuthority(authority,parameters,capabilityId);
        await binding(ctx,input);
        return enqueueLocalOperation(parameters as LocalOperation,ctx.session.id,authority);
      },
      receipt:result=>result,
      async verify(result){
        const saved=await localJob(pairing.ownerId,agent.id,ctx.session.id,result.jobId);
        return {verified:saved.status==="queued",receipt:{jobId:result.jobId,status:"queued",meaning:"Dispatch only; inspect the local job result before claiming the operation completed."}};
      },
    };
    if(prepareOnly)return await new ActionGateway().prepare(action,adapter);
    const dispatched=await new ActionGateway().execute(action,adapter,ctx.abortSignal);
    return await waitForJob(pairing.ownerId,agent.id,ctx,String(dispatched.receipt.jobId));
  }catch(error){
    if(error instanceof ActionBlocked)return {status:error.status,actionId:error.actionId,message:error.message};
    throw error;
  }
}
async function waitForJob(ownerId:string,agentId:string,ctx:Context,jobId:string){
  const until=Date.now()+25000;
  while(true){
    ctx.abortSignal?.throwIfAborted();
    const result=await localJob(ownerId,agentId,ctx.session.id,jobId);
    if(!["queued","running"].includes(String(result.status)) || Date.now()>=until)return result;
    await new Promise(resolve=>setTimeout(resolve,1000));
  }
}

export async function prepareLocalApproval(ctx:ApprovalContext){
  const parsed=localTaskSchema.safeParse(ctx.toolInput);
  if(!parsed.success)return "denied" as const;
  await binding(ctx,parsed.data);
  if(localReadOperation(parsed.data))return "not-applicable" as const;
  const result=await executeLocalTool(parsed.data,ctx,true);
  if(!("actionId" in result) || !("status" in result) || result.status!=="awaiting_approval")return {type:"denied" as const,reason:JSON.stringify(result)};
  const pairing=localPairing()!;
  const rows=await db().query(`SELECT a.id FROM action_requests a JOIN task_approval_decisions p ON p.id=a.approval_id
    WHERE a.owner_id=$1 AND a.id=$2 AND a.action_key=$3 AND a.approval_generation=0 AND a.attempt_count=0
      AND a.status='awaiting_approval' AND p.status='pending' AND p.expires_at>now()`,[pairing.ownerId,result.actionId,`tool:${ctx.callId}`]);
  return rows.length===1 ? "user-approval" as const : "denied" as const;
}

/** Only structured framework approval responses can approve a Mac action. */
export function localApprovalResponses(messages:DynamicResolveContext["messages"]){
  const requests=new Map<string,{callId:string;input:LocalTask}>();
  const decisions:Array<{callId:string;input:LocalTask;approved:boolean}>=[];
  for(const message of messages){
    if(!Array.isArray(message.content))continue;
    if(message.role==="assistant")for(const part of message.content){
      if(part.type!=="tool-approval-request" || part.isAutomatic===true)continue;
      const embedded=z.object({toolCall:z.object({toolCallId:z.string(),toolName:z.string(),input:z.unknown()})}).safeParse(part);
      const call=embedded.success?embedded.data.toolCall:message.content.find(item=>item.type==="tool-call" && item.toolCallId===part.toolCallId);
      if(!call || !("input" in call) || !("toolName" in call) || call.toolName!=="local_computer_task")continue;
      const parsed=localTaskSchema.safeParse(call.input);
      if(parsed.success && !localReadOperation(parsed.data))requests.set(part.approvalId,{callId:call.toolCallId,input:parsed.data});
    }
    else if(message.role==="tool")for(const part of message.content){
      if(part.type!=="tool-approval-response")continue;
      const request=requests.get(part.approvalId);
      if(request){decisions.push({...request,approved:part.approved});requests.delete(part.approvalId);}
    }
  }
  return decisions;
}

export async function resolveLocalApprovals(ctx:DynamicResolveContext){
  const resolved:string[]=[];
  for(const response of localApprovalResponses(ctx.messages)){
    const {agent,pairing,capabilityId}=await binding(ctx,response.input);
    const rows=await db().query(`SELECT a.*,p.id AS pending_approval_id,p.status AS approval_status FROM action_requests a
      JOIN task_approval_decisions p ON p.id=a.approval_id AND p.owner_id=a.owner_id AND p.binding_hash=a.parameter_hash AND p.task_id=a.run_id
        AND p.capability_id=a.capability_id AND p.action_class=a.action_class
      JOIN task_run_sessions s ON s.task_id=a.run_id JOIN task_runs r ON r.id=a.run_id AND r.owner_id=a.owner_id
      WHERE a.owner_id=$1 AND s.session_id=$2 AND s.is_current AND a.action_key=$3 AND a.capability_id=$5
        AND a.status='awaiting_approval' AND a.approval_generation=0 AND a.attempt_count=0
        AND p.status IN ('pending','approved','denied') AND p.expires_at>now() AND p.agent_id=$4
        AND r.status IN ('running','awaiting_approval') AND (r.deadline_at IS NULL OR r.deadline_at>now())`,
      [pairing.ownerId,ctx.session.id,`tool:${response.callId}`,agent.id,capabilityId]);
    if(rows.length!==1)continue;
    const row=rows[0]!;
    if(row.pending_approval_id!==approvalRequestId({ownerId:pairing.ownerId,taskId:String(row.run_id),requestKey:`${row.id}:0:0`}))continue;
    const resolvedTarget=target(pairing);
    const hash=approvalBinding({taskId:String(row.run_id),capabilityId,resource:JSON.stringify(canonicalActionValue(resolvedTarget)),action:"execute",
      parameters:{payload:response.input,target:resolvedTarget,executor:{kind:agent.isPrimary?"primary-agent":"persistent-agent",agentId:agent.id},trigger:{kind:"owner_chat",id:ctx.session.id},computer:null}});
    if(hash!==row.parameter_hash || row.action_class!=="execute")continue;
    if(row.approval_status==="pending")await decideApproval({ownerId:pairing.ownerId,id:String(row.pending_approval_id),bindingHash:hash,decision:response.approved?"approved":"denied",decidedBy:pairing.ownerId});
    if(response.approved && row.approval_status!=="denied")resolved.push(response.callId);
  }
  return resolved;
}
