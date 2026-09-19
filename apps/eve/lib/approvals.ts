import { createHash, randomUUID } from "node:crypto";

import { db } from "../agent/lib/receipts-db.ts";
import { getCapability, type CapabilityRisk } from "./capability-registry.ts";
import { redactEvidenceText } from "./task-types.ts";

export const ACTION_CLASSES = ["read","write","create","update","delete","send","publish","spend","deploy","execute","transfer"] as const;
export type ActionClass = (typeof ACTION_CLASSES)[number];
export type ApprovalPolicyDecision = "ALLOW" | "REQUIRE_APPROVAL" | "DENY";
export type ApprovalStatus = "pending" | "approved" | "denied" | "expired" | "invalidated";
type Row = Record<string, unknown>;

export interface ApprovalRequestView {
  id: string; taskId: string; goalId: string | null; goalTaskId: string | null; agentId: string | null; roleId: string | null;
  capabilityId: string | null; provider: string | null; resource: string | null; action: string; actionClass: ActionClass;
  parameters: Record<string, unknown>; bindingHash: string; risk: CapabilityRisk; effects: string[]; estimatedCostUsd: number | null;
  prompt: string; requestedBy: string; requestedAt: string; expiresAt: string; status: ApprovalStatus;
  decision: "approved" | "denied" | null; decisionReason: string | null; decidedBy: string | null; decidedAt: string | null;
}

const CONSEQUENTIAL = new Set<ActionClass>(["delete","send","publish","spend","deploy","transfer"]);
const SECRET_KEY = /(authorization|cookie|credential|password|secret|token|api.?key|database.?url|connection.?string)/i;
const PRIVATE_CONTENT_KEY = /^(text|html|content|body|value|command|instruction)$/i;
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a],[b]) => a.localeCompare(b)).map(([key,item]) => [key, SECRET_KEY.test(key) ? "[REDACTED]" : PRIVATE_CONTENT_KEY.test(key)?"[content bound by hash]":stable(item)]));
  return typeof value === "string" ? redactEvidenceText(value).slice(0,1000) : value;
}
export function safeActionParameters(value: Record<string, unknown>): Record<string, unknown> { return stable(value) as Record<string, unknown>; }
// Binding and display have different purposes. Never redact or truncate before
// hashing: two distinct credentials or long message bodies are distinct actions.
export function canonicalActionValue(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map(canonicalActionValue);
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([key, item]) => [key, canonicalActionValue(item)]));
  }
  throw new Error("Action parameters must be finite JSON values.");
}
export function approvalBinding(input: { taskId: string; capabilityId?: string; resource?: string; action: string; parameters: Record<string, unknown> }): string {
  return createHash("sha256").update(JSON.stringify(canonicalActionValue(input))).digest("hex");
}
export function resolveApprovalPolicy(input: { capabilityId: string; actionClass: ActionClass }): { decision: ApprovalPolicyDecision; risk: CapabilityRisk; reason: string } {
  const capability = getCapability(input.capabilityId);
  if (!capability) return { decision: "DENY", risk: "critical", reason: "Capability is not registered." };
  if (["disabled","unavailable","unconfigured"].includes(capability.availability.status)) return { decision: "DENY", risk: capability.risk.level, reason: capability.availability.reason ?? "Capability is unavailable." };
  if (CONSEQUENTIAL.has(input.actionClass) || capability.approvalPolicy.mode !== "none" || capability.risk.level === "critical") {
    return { decision: "REQUIRE_APPROVAL", risk: capability.risk.level, reason: "Policy requires explicit owner authority for this action." };
  }
  return { decision: "ALLOW", risk: capability.risk.level, reason: "Registered policy allows this bounded action." };
}
export async function requestApproval(input:{ownerId:string;taskId:string;requestedBy:string;capabilityId:string;provider?:string;resource?:string;action:string;actionClass:ActionClass;parameters:Record<string,unknown>;effects?:string[];estimatedCostUsd?:number;prompt:string;ttlMinutes?:number;forceApproval?:boolean}):Promise<{decision:ApprovalPolicyDecision;approval:ApprovalRequestView|null;reason:string}>{
  const policy=resolveApprovalPolicy({capabilityId:input.capabilityId,actionClass:input.actionClass});
  if(input.forceApproval && policy.decision==="ALLOW") policy.decision="REQUIRE_APPROVAL";
  if(policy.decision!=="REQUIRE_APPROVAL")return {decision:policy.decision,approval:null,reason:policy.reason};
  const taskRows=await db().query(`SELECT goal_id,goal_task_id,agent_id,role_id,status FROM task_runs WHERE owner_id=$1 AND id=$2 LIMIT 1`,[input.ownerId,input.taskId]) as Row[];const task=taskRows[0];if(!task)throw new Error("Task not found.");
  const parameters=safeActionParameters(input.parameters);const bindingHash=approvalBinding({taskId:input.taskId,capabilityId:input.capabilityId,resource:input.resource,action:input.action,parameters:input.parameters});const id=`approval_${randomUUID()}`;const ttl=Math.max(1,Math.min(1440,input.ttlMinutes??60));
  const rows=await db().query(`INSERT INTO task_approval_decisions (id,task_id,owner_id,goal_id,goal_task_id,agent_id,role_id,capability_id,provider,resource,action,action_class,action_parameters,binding_hash,risk,effects,estimated_cost_usd,expires_at,status,requested_by,prompt) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,$15,$16::jsonb,$17,now()+($18*interval '1 minute'),'pending',$19,$20) RETURNING *`,[id,input.taskId,input.ownerId,task.goal_id,task.goal_task_id,task.agent_id,task.role_id,input.capabilityId,input.provider??null,input.resource?redactEvidenceText(input.resource).slice(0,2000):null,input.action,input.actionClass,JSON.stringify(parameters),bindingHash,policy.risk,JSON.stringify((input.effects??[]).map(effect=>redactEvidenceText(effect).slice(0,300))),input.estimatedCostUsd??null,ttl,input.requestedBy,redactEvidenceText(input.prompt).slice(0,1000)]) as Row[];
  if(String(task.status)==="running")await db().transaction(tx=>[tx`UPDATE task_runs SET status='awaiting_approval',status_reason='Waiting for an exact-action owner approval',updated_at=now() WHERE owner_id=${input.ownerId} AND id=${input.taskId} AND status='running'`,tx`INSERT INTO task_transitions (task_id,from_status,to_status,actor,reason) VALUES (${input.taskId},'running','awaiting_approval','agent','Exact-action owner approval required')`]);
  return {decision:"REQUIRE_APPROVAL",approval:view(rows[0]!),reason:policy.reason};
}
function view(row: Row): ApprovalRequestView {
  const obj = (row.action_parameters && typeof row.action_parameters === "object" ? row.action_parameters : {}) as Record<string, unknown>;
  return { id:String(row.id),taskId:String(row.task_id),goalId:row.goal_id==null?null:String(row.goal_id),goalTaskId:row.goal_task_id==null?null:String(row.goal_task_id),agentId:row.agent_id==null?null:String(row.agent_id),roleId:row.role_id==null?null:String(row.role_id),capabilityId:row.capability_id==null?null:String(row.capability_id),provider:row.provider==null?null:String(row.provider),resource:row.resource==null?null:String(row.resource),action:String(row.action),actionClass:String(row.action_class) as ActionClass,parameters:obj,bindingHash:String(row.binding_hash),risk:String(row.risk) as CapabilityRisk,effects:Array.isArray(row.effects)?row.effects.filter((x):x is string=>typeof x==="string"):[],estimatedCostUsd:row.estimated_cost_usd==null?null:Number(row.estimated_cost_usd),prompt:String(row.prompt),requestedBy:String(row.requested_by),requestedAt:new Date(row.requested_at as string).toISOString(),expiresAt:new Date(row.expires_at as string).toISOString(),status:String(row.status) as ApprovalStatus,decision:row.decision==null?null:String(row.decision) as "approved"|"denied",decisionReason:row.decision_reason==null?null:String(row.decision_reason),decidedBy:row.decided_by==null?null:String(row.decided_by),decidedAt:row.decided_at==null?null:new Date(row.decided_at as string).toISOString() };
}
export async function listApprovalRequests(ownerId: string, status?: ApprovalStatus): Promise<ApprovalRequestView[]> {
  await db().query(`UPDATE task_approval_decisions SET status='expired' WHERE owner_id=$1 AND status='pending' AND expires_at<=now()`,[ownerId]);
  const rows=await db().query(`SELECT * FROM task_approval_decisions WHERE owner_id=$1 AND ($2::text IS NULL OR status=$2) ORDER BY requested_at DESC,id DESC LIMIT 100`,[ownerId,status??null]) as Row[];
  return rows.map(view);
}
export async function decideApproval(input:{ownerId:string;id:string;bindingHash:string;decision:"approved"|"denied";reason?:string;decidedBy:string}):Promise<ApprovalRequestView>{
  const rows=await db().query(`UPDATE task_approval_decisions SET status=$4,decision=$4,decision_reason=$5,decided_by=$6,decided_at=now() WHERE owner_id=$1 AND id=$2 AND binding_hash=$3 AND status='pending' AND expires_at>now() RETURNING *`,[input.ownerId,input.id,input.bindingHash,input.decision,input.reason?redactEvidenceText(input.reason).slice(0,500):null,input.decidedBy]) as Row[];
  if(!rows[0]) throw new Error("Approval is stale, expired, changed, or already decided.");
  await db().query(`INSERT INTO eve_events (id,owner_id,type,source_type,source_id,run_id,summary,payload) VALUES ($1,$2,'APPROVAL_DECIDED','approval_request',$3,(SELECT task_id FROM task_approval_decisions WHERE id=$3),$4,$5::jsonb)`,[`event_${randomUUID()}`,input.ownerId,input.id,`Approval ${input.decision}`,JSON.stringify({decision:input.decision})]);
  return view(rows[0]);
}
