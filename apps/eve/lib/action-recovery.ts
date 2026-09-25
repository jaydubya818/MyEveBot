import { randomUUID } from "node:crypto";
import { getToken } from "@vercel/connect";
import { z } from "zod";
import { db } from "../agent/lib/receipts-db.ts";
import { inspectBoundMessage } from "../agent/lib/agentmail.ts";
import { approvalBinding, canonicalActionValue, safeActionParameters } from "./approvals.ts";
import type { ActionTarget } from "./action-gateway.ts";
import type { ExecutionDatabase } from "./execution-types.ts";

export type RecoveryObservation = {
  outcome:"succeeded"|"not_executed"|"indeterminate";
  evidence:Record<string,unknown>;
};
export type RecoveryBinding = {
  taskId:string;
  capabilityId:string;
  actionClass:string;
  parameterHash:string;
  executor:Record<string,unknown>;
  trigger:Record<string,unknown>;
  ownerChannelRun:boolean;
  hasComputer:boolean;
};
export interface RecoveryStrategy {
  id:string;
  /** Observation only. A missing result is NOT proof of non-execution. */
  inspect(input:{target:ActionTarget;receipt:Record<string,unknown>;binding?:RecoveryBinding}):Promise<RecoveryObservation>;
}
const foremanRecoveryResponseSchema=z.object({
  data:z.object({
    viewer:z.object({id:z.string(),organization:z.object({id:z.string()})}),
    issues:z.object({nodes:z.array(z.object({
      id:z.string(),identifier:z.string(),url:z.string().url(),title:z.string(),description:z.string().nullable(),
      team:z.object({id:z.string()}),delegate:z.object({id:z.string()}).nullable(),
      agentSessions:z.object({nodes:z.array(z.object({id:z.string(),status:z.string()}))}),
    }))}),
  }),
  errors:z.array(z.unknown()).optional(),
}).passthrough();
export type RecoveryStatus="completed"|"retryable"|"needs_you";
export class ActionRecovery {
  private database:ExecutionDatabase;
  constructor(database:ExecutionDatabase=db() as ExecutionDatabase){this.database=database;}
  /** Owner attestation is recorded separately from provider verification. Never transmits. */
  async resolveByOwner(ownerId:string,actionId:string,decision:"occurred"|"not_occurred"|"cancel",expectedUpdatedAt:string):Promise<string|null> {
    const status=decision==="occurred"?"completed":decision==="not_occurred"?"retryable":"cancelled";
    const result=decision==="occurred"?"succeeded":decision==="not_occurred"?"not_executed":"indeterminate";
    const rows=await this.database.query(`WITH resolved AS (
      UPDATE action_requests SET status=$4,
        recovery_result=jsonb_build_object('originalAction',id,'originalAttempt',attempt_count,
          'strategy','owner_attestation.v1','result',$5::text,'ownerDecision',$3::text,
          'decidedBy',owner_id,'decidedAt',now(),'anotherExecutionOccurred',false),
        approval_id=CASE WHEN $4='retryable' THEN NULL ELSE approval_id END,updated_at=now()
      WHERE owner_id=$1 AND id=$2 AND status='needs_you' AND updated_at=$6::timestamptz RETURNING *
    ), receipt AS (
      INSERT INTO action_receipts(owner_id,action_id,attempt_number,event,details)
      SELECT owner_id,id,attempt_count,'owner_resolution',recovery_result FROM resolved
    ), released AS (
      UPDATE computer_control_leases c SET gateway_actions_in_flight=greatest(0,gateway_actions_in_flight-1)
      FROM resolved a WHERE c.owner_id=a.owner_id AND c.computer_session_id=a.computer_session_id
        AND c.version=a.control_version AND a.status IN ('completed','retryable')
    ) SELECT status FROM resolved`,[ownerId,actionId,decision,status,result,expectedUpdatedAt]);
    return rows[0]?String(rows[0].status):null;
  }
  async recover(ownerId:string,actionId:string,resolve:(capability:string,provider:string)=>RecoveryStrategy):Promise<RecoveryStatus|null> {
    const token=randomUUID();
    // An executing worker may still be alive. Wait beyond its 30s handle TTL;
    // never overlap a live transmission or steal an unexpired recovery claim.
    const rows=await this.database.query(`UPDATE action_requests SET status='recovering',recovery_token=$3,
      recovery_expires_at=now()+interval '60 seconds',updated_at=now()
      WHERE owner_id=$1 AND id=$2 AND (status IN ('result_unknown','needs_you')
        OR (status IN ('executing','verifying') AND updated_at<now()-interval '2 minutes')
        OR (status='recovering' AND recovery_expires_at<now())) RETURNING *`,[ownerId,actionId,token]);
    const row=rows[0];if(!row)return null;
    let result:RecoveryObservation={outcome:"indeterminate",evidence:{reason:"inspection_unavailable"}};
    let strategyId="unsupported";
    try {
      const ownerChannelRows=await this.database.query(`SELECT EXISTS(
        SELECT 1 FROM owner_channel_requests WHERE owner_id=$1 AND run_id=$2
      ) AS owner_channel_run`,[ownerId,String(row.run_id)]);
      const strategy=resolve(String(row.capability_id),String((row.target as ActionTarget).provider));strategyId=strategy.id;
      result=await strategy.inspect({target:row.target as ActionTarget,receipt:row.provider_receipt as Record<string,unknown>??{},binding:{
        taskId:String(row.run_id),capabilityId:String(row.capability_id),actionClass:String(row.action_class),parameterHash:String(row.parameter_hash),
        executor:row.executor as Record<string,unknown>,trigger:row.trigger as Record<string,unknown>,
        ownerChannelRun:ownerChannelRows[0]?.owner_channel_run===true,hasComputer:row.computer_session_id!=null,
      }});
      if(!["succeeded","not_executed","indeterminate"].includes(result.outcome))throw new Error("Invalid recovery evidence");
    }catch{result={outcome:"indeterminate",evidence:{reason:"inspection_unavailable"}};}
    const status:RecoveryStatus=result.outcome==="succeeded"?"completed":result.outcome==="not_executed"?"retryable":"needs_you";
    const receipt=safeActionParameters({originalAction:actionId,originalAttempt:Number(row.attempt_count),strategy:strategyId,
      result:result.outcome,evidence:result.evidence,anotherExecutionOccurred:false});
    const saved=await this.database.query(`WITH recovered AS (
      UPDATE action_requests SET status=$4,recovery_result=$5::jsonb,recovery_token=NULL,recovery_expires_at=NULL,
        approval_id=CASE WHEN $4='retryable' THEN NULL ELSE approval_id END,updated_at=now()
      WHERE owner_id=$1 AND id=$2 AND status='recovering' AND recovery_token=$3 AND recovery_expires_at>now()
      RETURNING *
    ), receipt AS (
      INSERT INTO action_receipts(owner_id,action_id,attempt_number,event,details)
      SELECT owner_id,id,attempt_count,'recovery',$5::jsonb FROM recovered
    ), released AS (
      UPDATE computer_control_leases c SET gateway_actions_in_flight=greatest(0,gateway_actions_in_flight-1)
      FROM recovered a WHERE c.owner_id=a.owner_id AND c.computer_session_id=a.computer_session_id AND c.version=a.control_version
        AND a.status IN ('completed','retryable')
    ) SELECT id FROM recovered`,[ownerId,actionId,token,status,JSON.stringify(receipt)]);
    return saved.length?status:null;
  }
}

/** Production strategies never infer "not executed" from absence/eventual consistency. */
export function recoveryStrategy(capability:string,provider:string):RecoveryStrategy {
  if(capability==="tool.delegate_foreman_issue" && provider==="linear")return {
    id:"linear.issue_binding_readback.v1",
    async inspect({target,receipt,binding}) {
      const connector=process.env.FOREMAN_LINEAR_CONNECTOR?.trim();
      const workspaceId=process.env.FOREMAN_LINEAR_WORKSPACE_ID?.trim();
      const teamId=process.env.FOREMAN_LINEAR_TEAM_ID?.trim();
      const delegateId=process.env.FOREMAN_LINEAR_DELEGATE_ID?.trim();
      const repository=process.env.FOREMAN_REPO?.trim();
      const issueId=typeof receipt.issueId==="string"?receipt.issueId:"";
      const issueIdentifier=typeof receipt.issueIdentifier==="string"?receipt.issueIdentifier:"";
      const issueUrl=typeof receipt.issueUrl==="string"?receipt.issueUrl:"";
      const validRepository=!!repository&&/^[\w.-]+\/[\w.-]+$/.test(repository);
      if(!connector||!workspaceId||!teamId||!delegateId||!validRepository||!issueId||!issueIdentifier||!issueUrl
        ||target.provider!=="linear"||target.account!==workspaceId||target.resource!==`${teamId}/${delegateId}/${repository}`
        ||!binding||binding.capabilityId!==capability||binding.actionClass!=="create"||binding.ownerChannelRun||binding.hasComputer
        ||binding.trigger.kind!=="owner_chat"||binding.executor.kind!=="primary-agent"||!binding.parameterHash) {
        return {outcome:"indeterminate",evidence:{reason:"foreman_binding_unavailable"}};
      }
      let receiptUrl:URL;
      try { receiptUrl=new URL(issueUrl); } catch { return {outcome:"indeterminate",evidence:{reason:"provider_receipt_invalid"}}; }
      if(receiptUrl.origin!=="https://linear.app")return {outcome:"indeterminate",evidence:{reason:"provider_receipt_invalid"}};

      try {
        const token=await getToken(connector,{subject:{type:"app"},scopes:["read"]});
        const query=`query($id:ID!){ viewer { id organization { id } } issues(filter:{id:{eq:$id}}) { nodes { id identifier url title description team { id } delegate { id } agentSessions { nodes { id status } } } } }`;
        const response=await fetch("https://api.linear.app/graphql",{method:"POST",redirect:"error",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify({query,variables:{id:issueId}}),signal:AbortSignal.timeout(20000)});
        const payload=foremanRecoveryResponseSchema.safeParse(await response.json());
        if(!response.ok||!payload.success||payload.data.errors?.length)return {outcome:"indeterminate",evidence:{reason:"provider_readback_unavailable"}};
        const data=payload.data.data;
        const issue=data.issues?.nodes?.[0];
        if(!issue)return {outcome:"indeterminate",evidence:{reason:"provider_issue_not_visible",issueId}};
        const sessions=issue.agentSessions?.nodes??[];
        const startedSession=sessions.find(session=>typeof session.id==="string"&&["active","running","started","complete","completed","finished","succeeded"].includes(String(session.status).trim().toLowerCase()));
        const observedPayload={issueId:issue.id,title:issue.title,description:issue.description};
        const observedBinding=approvalBinding({taskId:binding.taskId,capabilityId:binding.capabilityId,resource:JSON.stringify(canonicalActionValue(target)),action:binding.actionClass,
          parameters:{payload:observedPayload,target,executor:binding.executor,trigger:binding.trigger,computer:null}});
        const checks={
          appIdentity:data.viewer?.id===delegateId,
          workspace:data.viewer?.organization?.id===workspaceId,
          issueId:issue.id===issueId,
          issueIdentifier:issue.identifier===issueIdentifier,
          issueUrl:issue.url===issueUrl,
          team:issue.team?.id===teamId,
          delegate:issue.delegate?.id===delegateId,
          exactActionBinding:observedBinding===binding.parameterHash,
          foremanSession:!!startedSession,
        };
        const verified=Object.values(checks).every(Boolean);
        return {outcome:verified?"succeeded":"indeterminate",evidence:{issueId,issueIdentifier,issueUrl,
          sessionId:typeof startedSession?.id==="string"?startedSession.id:null,
          sessionStatus:typeof startedSession?.status==="string"?startedSession.status:null,checks}};
      } catch {
        return {outcome:"indeterminate",evidence:{reason:"provider_readback_unavailable"}};
      }
    },
  };
  if(capability==="tool.send_email" && provider==="agentmail")return {
    id:"email.message_identity.v1",
    async inspect({target,receipt}) {
      if(typeof receipt.messageId!=="string")return {outcome:"indeterminate",evidence:{reason:"provider_message_id_missing"}};
      const message=await inspectBoundMessage(target.account,receipt.messageId);
      const verified=message.message_id===receipt.messageId && message.inbox_id===target.account && message.thread_id===receipt.threadId;
      return {outcome:verified?"succeeded":"indeterminate",evidence:{messageId:message.message_id,account:message.inbox_id,verified}};
    },
  };
  if(capability==="files.write" && provider==="sandbox")return {
    id:"file.checksum.v1",
    async inspect({target,receipt}) {
      const checksum=receipt.expectedChecksum??receipt.checksum;
      if(typeof checksum!=="string" || !/^[a-f0-9]{64}$/.test(checksum) || !target.resource.startsWith("/workspace/") || target.resource.split("/").includes(".."))return {outcome:"indeterminate",evidence:{reason:"file_evidence_missing"}};
      const {Sandbox}=await import("@vercel/sandbox");
      const {createHash}=await import("node:crypto");
      // Connect to the recorded existing sandbox; never create a replacement.
      const sandbox=await Sandbox.get({name:target.account,resume:false});
      const stream=await sandbox.readFile({path:target.resource});
      if(!stream)return {outcome:"indeterminate",evidence:{reason:"file_unavailable"}};
      const hash=createHash("sha256");for await(const chunk of stream)hash.update(chunk);
      const observed=hash.digest("hex");
      return {outcome:observed===checksum?"succeeded":"indeterminate",evidence:{checksum:observed,expectedChecksum:checksum}};
    },
  };
  return {id:"manual_review.v1",inspect:async()=>({outcome:"indeterminate",evidence:{reason:"provider_has_no_safe_inspection_strategy"}})};
}
