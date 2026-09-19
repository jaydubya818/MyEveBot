import { randomUUID } from "node:crypto";
import { db } from "../agent/lib/receipts-db.ts";
import { safeActionParameters } from "./approvals.ts";
import type { ActionTarget } from "./action-gateway.ts";
import type { ExecutionDatabase } from "./execution-types.ts";

export type RecoveryObservation = {
  outcome:"succeeded"|"not_executed"|"indeterminate";
  evidence:Record<string,unknown>;
};
export interface RecoveryStrategy {
  id:string;
  /** Observation only. A missing result is NOT proof of non-execution. */
  inspect(input:{target:ActionTarget;receipt:Record<string,unknown>}):Promise<RecoveryObservation>;
}
export type RecoveryStatus="completed"|"retryable"|"needs_you";
export class ActionRecovery {
  private database:ExecutionDatabase;
  constructor(database:ExecutionDatabase=db() as ExecutionDatabase){this.database=database;}
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
      const strategy=resolve(String(row.capability_id),String((row.target as ActionTarget).provider));strategyId=strategy.id;
      result=await strategy.inspect({target:row.target as ActionTarget,receipt:row.provider_receipt as Record<string,unknown>??{}});
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
  if(capability==="tool.send_email" && provider==="agentmail")return {
    id:"email.message_identity.v1",
    async inspect({target,receipt}) {
      if(typeof receipt.messageId!=="string")return {outcome:"indeterminate",evidence:{reason:"provider_message_id_missing"}};
      const {inspectBoundMessage}=await import("../agent/lib/agentmail.ts");
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
