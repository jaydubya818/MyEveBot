import { ROUTINE_RELEASE } from "./routine-release.ts";
import { createHmac, timingSafeEqual } from "node:crypto";
import { db } from "../agent/lib/receipts-db.ts";
import type { ExecutionClaim, ExecutionDatabase } from "./execution-types.ts";
import { routineConfigurationSchema } from "./execution-types.ts";

export const EXECUTION_HEADER="x-myeve-execution";
export interface ExecutionIdentity {ownerId:string;occurrenceId:string;version:number;workerId:string}
function secret():string {
  const value=process.env.MYEVE_SESSION_SECRET?.trim() || process.env.SOFIE_SESSION_SECRET?.trim();
  if(!value || value.length<32) throw new Error("Execution authentication is not configured.");
  return value;
}
export function signExecution(identity:ExecutionIdentity,key=secret()):string {
  const payload=Buffer.from(JSON.stringify(identity)).toString("base64url");
  return `${payload}.${createHmac("sha256",key).update(`routine-execution:${payload}`).digest("base64url")}`;
}
export function verifyExecution(token:string,key=secret()):ExecutionIdentity {
  if(token.length>2048) throw new Error("Invalid execution credential.");
  const [payload,signature,...extra]=token.split(".");
  const expected=createHmac("sha256",key).update(`routine-execution:${payload}`).digest();
  const actual=Buffer.from(signature??"","base64url");
  if(extra.length || actual.length!==expected.length || !timingSafeEqual(actual,expected)) throw new Error("Invalid execution credential.");
  const value=JSON.parse(Buffer.from(payload!,"base64url").toString("utf8")) as ExecutionIdentity;
  if(typeof value.ownerId!=="string" || !value.ownerId || typeof value.occurrenceId!=="string" || !value.occurrenceId
    || typeof value.workerId!=="string" || !value.workerId || !Number.isSafeInteger(value.version) || value.version<1) throw new Error("Invalid execution credential.");
  return value;
}
export async function resolveExecution(identity:ExecutionIdentity,database:ExecutionDatabase=db() as ExecutionDatabase,executionEnabled:()=>boolean=()=>ROUTINE_RELEASE.enabled):Promise<ExecutionClaim & {agentId:string}> {
  if(!executionEnabled())throw new Error("Routine execution is disabled.");
  const rows=await database.query(`SELECT o.*,r.agent_id,v.configuration FROM execution_occurrences o
    JOIN execution_routines r ON r.owner_id=o.owner_id AND r.id=o.routine_id
    JOIN task_runs t ON t.owner_id=o.owner_id AND t.id=o.run_id AND t.status='running'
    JOIN agents a ON a.owner_id=r.owner_id AND a.id=r.agent_id AND a.status='active'
    JOIN execution_routine_versions v ON v.owner_id=o.owner_id AND v.routine_id=o.routine_id AND v.version=o.routine_version
    WHERE o.owner_id=$1 AND o.id=$2 AND o.claim_version=$3 AND o.claimed_by=$4 AND o.status='running'
      AND o.lease_expires_at>now() AND r.status='active' AND r.version=o.routine_version
      AND t.model_steps<t.max_model_steps AND t.estimated_cost_usd<t.max_estimated_cost_usd
      AND (t.deadline_at IS NULL OR t.deadline_at>now())`,[identity.ownerId,identity.occurrenceId,identity.version,identity.workerId]);
  const row=rows[0];if(!row) throw new Error("Execution lease expired, was revoked, or changed.");
  return {...identity,routineId:String(row.routine_id),runId:String(row.run_id),attempt:Number(row.attempt_count),agentId:String(row.agent_id),configuration:routineConfigurationSchema.parse(row.configuration)};
}
export function executionIdentityFromAuth(auth:{current?:{attributes?:Record<string,unknown>}|null;initiator?:{attributes?:Record<string,unknown>}|null}):ExecutionIdentity|null {
  const attributes=auth.initiator?.attributes?.executionOccurrence ? auth.initiator.attributes : auth.current?.attributes;
  if(!attributes?.executionOccurrence) return null;
  return {ownerId:String(attributes.executionOwner),occurrenceId:String(attributes.executionOccurrence),version:Number(attributes.executionVersion),workerId:String(attributes.executionWorker)};
}
