import { db } from "../../../agent/lib/receipts-db.ts";
import type { ExecutionDatabase } from "../../execution-types.ts";
import { getAgent } from "../../agents.ts";
import { ownerCommandHash,verifyOwnerCommand } from "./signing.ts";
import type { Environment,ExecutionCommand,WorkRequest } from "./contracts.ts";

export class OwnerWorkNotAdmitted extends Error {
 readonly proof;
 constructor(work:WorkRequest){super("Canonical owner work has not been admitted.");this.proof={code:"OWNER_WORK_NOT_ADMITTED" as const,requestId:work.requestId,ownerPrincipalId:work.ownerPrincipalId,agentId:work.agentId,workHash:ownerCommandHash(work)};}
}
export interface OwnerChannelMapping {
 relayAccountId:string;relayOwnerPrincipalId:string;relayAgentId:string;sourceIdentity:string;
 ownerId:string;agentId:string;enabled:boolean;
}
export interface OwnerChannelTrust {environment:Environment;audience:string;keys:Record<string,string>;mappings:OwnerChannelMapping[]}
/** Authenticates/admit only. It does not execute a model, grant a capability,
 * approve an Action, or treat external Federation identity as owner authority.
 */
export class OwnerChannelHandoff {
 constructor(private readonly trust:OwnerChannelTrust,private readonly database:ExecutionDatabase=db() as ExecutionDatabase){}
 async accept(value:unknown){
  const signed=verifyOwnerCommand(value,this.trust),command=signed.command,work=command.work;
  let matches=this.trust.mappings.filter(m=>(m.enabled||command.operation==="cancel")&&m.relayAccountId===work.accountId&&m.relayOwnerPrincipalId===work.ownerPrincipalId&&m.relayAgentId===work.agentId&&m.sourceIdentity===work.sourceIdentity);
  if(command.operation==="cancel"&&matches.length===0){
   const [prior]=await this.database.query(`SELECT owner_id,agent_id FROM owner_channel_requests WHERE relay_account_id=$1 AND request_id=$2 AND work_hash=$3`,[work.accountId,work.requestId,ownerCommandHash(work)]);
   if(prior)matches=[{relayAccountId:work.accountId,relayOwnerPrincipalId:work.ownerPrincipalId,relayAgentId:work.agentId,sourceIdentity:work.sourceIdentity,ownerId:String(prior.owner_id),agentId:String(prior.agent_id),enabled:false}];
  }
  if(matches.length!==1)throw new Error("Explicit owner-channel mapping required.");
  const mapping=matches[0],agent=await getAgent(mapping.ownerId,mapping.agentId,this.database);
  if(!agent||(command.operation!=="cancel"&&agent.status!=="active"))throw new Error("Mapped Agent unavailable.");
  const requested=Date.parse(work.requestedAt),expiry=Date.parse(work.expiresAt);
  if(requested>Date.now()+5000||(command.operation!=="cancel"&&expiry<=Date.now())||expiry-requested>86400000||work.requestId!==work.taskId)throw new Error("Work lifetime or identity invalid.");
  const nonce=await this.database.query(`INSERT INTO owner_channel_nonces(nonce,relay_account_id,owner_id,environment,expires_at)
   VALUES($1,$2,$3,$4,to_timestamp($5)) ON CONFLICT DO NOTHING RETURNING nonce`,[signed.nonce,work.accountId,mapping.ownerId,signed.environment,signed.expiresAt]);
  if(!nonce.length)throw new Error("Owner ingress replay denied.");
  const hash=ownerCommandHash(work),runId=`owner_run_${ownerCommandHash([work.accountId,work.requestId]).slice(7)}`;
  if(command.operation==="start"||command.operation==="cancel"){
   // Run + mapping are admitted atomically. A retry can only observe this Run.
   // A mismatched command identity deliberately violates the receipt's
   // NOT NULL constraint, rolling back Run + projection + receipt together.
   try {await this.database.query(`WITH admitted AS (
    INSERT INTO task_runs(id,owner_id,kind,title,agent_id,status,max_duration_seconds,max_specialists,max_model_steps,max_retries_per_specialist,max_estimated_cost_usd,cancelled_at)
    SELECT $1,$2,'delegated_work','Owner channel request',$3,CASE WHEN $13='cancel' THEN 'cancelled' ELSE 'queued' END,LEAST(60,max_runtime_seconds),0,LEAST(8,max_steps),0,LEAST(0.1,max_estimated_cost_usd),CASE WHEN $13='cancel' THEN now() ELSE NULL END
    FROM agents WHERE owner_id=$2 AND id=$3 AND (status='active' OR $13='cancel')
    ON CONFLICT(id) DO NOTHING RETURNING id
   ), linked AS (INSERT INTO owner_channel_requests(relay_account_id,request_id,owner_id,agent_id,source_identity,relay_thread_id,work_hash,run_id,request,expires_at)
    SELECT $4,$5,$2,$3,$6,$7,$8,id,$9::jsonb,$10::timestamptz FROM admitted
    ON CONFLICT(relay_account_id,request_id) DO NOTHING RETURNING run_id
   ) INSERT INTO owner_channel_commands(command_id,relay_account_id,request_id,owner_id,payload_hash,operation)
    VALUES($11,$4,$5,$2,$12,$13) ON CONFLICT(command_id) DO UPDATE SET payload_hash=
    CASE WHEN owner_channel_commands.owner_id=EXCLUDED.owner_id AND owner_channel_commands.relay_account_id=EXCLUDED.relay_account_id
      AND owner_channel_commands.request_id=EXCLUDED.request_id AND owner_channel_commands.payload_hash=EXCLUDED.payload_hash
      THEN owner_channel_commands.payload_hash ELSE NULL END`,[runId,mapping.ownerId,mapping.agentId,work.accountId,work.requestId,work.sourceIdentity,work.threadId,hash,JSON.stringify(work),work.expiresAt,command.commandId,ownerCommandHash(command),command.operation]);}
   catch{throw new Error("Owner handoff binding changed or admission unavailable.");}
  }
  const rows=await this.database.query(`SELECT * FROM owner_channel_requests WHERE relay_account_id=$1 AND request_id=$2 AND owner_id=$3`,[work.accountId,work.requestId,mapping.ownerId]);
  const row=rows[0];
  if(!row){if(command.operation==="status")throw new OwnerWorkNotAdmitted(work);throw new Error("Canonical Run not admitted; status never starts work.");}
  if(row.work_hash!==hash||row.agent_id!==mapping.agentId||row.source_identity!==work.sourceIdentity||(row.revoked_at&&command.operation!=="cancel"))throw new Error("Owner handoff binding changed or revoked.");
  const receipt=await this.database.query(`INSERT INTO owner_channel_commands(command_id,relay_account_id,request_id,owner_id,payload_hash,operation)
   VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(command_id) DO UPDATE SET command_id=owner_channel_commands.command_id
   WHERE owner_channel_commands.owner_id=EXCLUDED.owner_id AND owner_channel_commands.relay_account_id=EXCLUDED.relay_account_id
    AND owner_channel_commands.request_id=EXCLUDED.request_id AND owner_channel_commands.payload_hash=EXCLUDED.payload_hash
   RETURNING command_id`,[command.commandId,work.accountId,work.requestId,mapping.ownerId,ownerCommandHash(command),command.operation]);
  if(!receipt.length)throw new Error("Command identity changed.");
  return {command,mapping,runId:String(row.run_id)};
 }
 async revoke(mapping:OwnerChannelMapping){
  // Revocation denies subsequent model steps and Action Gateway effects.
  // Provider work already in flight retains its canonical receipt/recovery state.
  await this.database.query(`WITH revoked AS (
   UPDATE owner_channel_requests SET revoked_at=now() WHERE owner_id=$1 AND agent_id=$2 AND relay_account_id=$3 AND source_identity=$4 AND revoked_at IS NULL RETURNING run_id
  ), current AS (
   SELECT id,status FROM task_runs WHERE owner_id=$1 AND id IN(SELECT run_id FROM revoked)
    AND status IN ('queued','running','awaiting_approval','waiting_for_owner','paused') FOR UPDATE
  ), cancelled AS (
   UPDATE task_runs r SET status='cancelled',cancelled_at=now(),updated_at=now() FROM current c WHERE r.id=c.id RETURNING r.id,c.status
  ) INSERT INTO task_transitions(task_id,from_status,to_status,actor,reason)
   SELECT id,status,'cancelled','owner','Owner channel source revoked' FROM cancelled`,[mapping.ownerId,mapping.agentId,mapping.relayAccountId,mapping.sourceIdentity]);
 }
}
export type AcceptedOwnerCommand={command:ExecutionCommand;mapping:OwnerChannelMapping;runId:string};
