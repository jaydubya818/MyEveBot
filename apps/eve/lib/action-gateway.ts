import { ownerChannelConfiguration } from "./relay/owner/config.ts";
import { PendingActionContinuation } from "./pending-action-continuation.ts";
import { ROUTINE_RELEASE } from "./routine-release.ts";
import {ActionRecovery} from "./action-recovery.ts";
import { randomUUID } from "node:crypto";
import { db } from "../agent/lib/receipts-db.ts";
import { approvalBinding, canonicalActionValue, requestApproval, resolveApprovalPolicy, safeActionParameters, type ActionClass } from "./approvals.ts";
import { effectiveCapability, getAgent } from "./agents.ts";
import { getCapability } from "./capability-registry.ts";
import { type ExecutionDatabase, type RoutineConfiguration } from "./execution-types.ts";

export interface ActionTarget {
  provider: string;
  account: string;
  resource: string;
  environment?: string;
}
export interface ActionRequest {
  ownerId: string; runId: string; actionKey: string; capabilityId: string; actionClass: ActionClass;
  executor: { kind: "primary-agent" | "persistent-agent" | "on-demand-role" | "routine" | "system" | "external-agent"; agentId: string; roleId?: string };
  trigger: { kind: "owner_chat" | "goal_execution" | "scheduled_occurrence" | "webhook" | "proactive_review" | "delegation" | "reminder" | "routine" | "system" | "relay_request"; id?: string };
  parameters: Record<string, unknown>;
  occurrence?: { id: string; claimVersion: number; workerId: string };
  computer?: { sessionId: string; controlVersion: number };
  delivery?: {id:string;claimVersion:number;channel:"push"|"telegram";resultReference:string};
}
export type AuthorityReason = "unqualified_executor"|"capability_allowed"|"approval_required"|"capability_denied"|"target_denied"|"authority_unavailable"|"target_unresolved"|"approval_binding_mismatch"|"execution_precondition_failed";
export type AuthorityDecision = { decision: "ALLOW" | "REQUIRE_APPROVAL" | "DENY"; reason: string; source: string; reasonCode?:AuthorityReason };
export interface AuthorityProvider {
  evaluate(action: ActionRequest, target: ActionTarget, routineAuthority?: RoutineConfiguration["authority"]): Promise<AuthorityDecision>;
}
export interface ActionAdapter<Result> {
  // Resolve from authenticated provider/account state, not a model-supplied label.
  resolveTarget(parameters: Record<string, unknown>): Promise<ActionTarget>;
  execute(parameters: Record<string, unknown>, context: AuthorizedAction): Promise<Result>;
  receipt?(result: Result): Record<string, unknown>;
  verify(result: Result, target: ActionTarget): Promise<{ verified: boolean; receipt: Record<string, unknown> }>;
}
export interface AuthorizedAction {
  readonly idempotencyKey: string;
  readonly authorityId: string;
  readonly executor: Readonly<ActionRequest["executor"]>;
  readonly expiresAt: number;
  readonly target: Readonly<ActionTarget>;
  readonly capabilityId: string;
  readonly signal?: AbortSignal;
}
// Process-local, one-use handles are only the last adapter boundary. Durable
// authorization and deduplication remain the database CAS, never this WeakMap.
interface HandleRecord { binding:string; revalidate:()=>Promise<void> }
const handles = new WeakMap<AuthorizedAction, HandleRecord>();
const providerHandles = new WeakMap<AuthorizedAction, HandleRecord>();
async function takeAuthority(map:WeakMap<AuthorizedAction,HandleRecord>,context:AuthorizedAction|undefined,parameters:Record<string,unknown>,capabilityId:string):Promise<HandleRecord> {
  if(!context || context.capabilityId!==capabilityId || context.signal?.aborted || Date.now()>=context.expiresAt)throw new ActionBlocked("denied","unresolved");
  const record=map.get(context);map.delete(context);
  if(!record || record.binding!==JSON.stringify(canonicalActionValue({parameters,target:context.target})))throw new ActionBlocked("denied",context.idempotencyKey);
  await record.revalidate();
  if(context.signal?.aborted || Date.now()>=context.expiresAt)throw new ActionBlocked("denied",context.idempotencyKey);
  return record;
}
export async function consumeActionAuthority(context:AuthorizedAction|undefined,parameters:Record<string,unknown>,capabilityId:string):Promise<void> {
  const record=await takeAuthority(handles,context,parameters,capabilityId);
  providerHandles.set(context!,record);
}
/** A second, independently consumed boundary immediately before the email transport. */
export async function consumeProviderAuthority(context:AuthorizedAction|undefined,parameters:Record<string,unknown>,capabilityId:string):Promise<void> {
  await takeAuthority(providerHandles,context,parameters,capabilityId);
}

function frozenJson<T>(value:T):T {
  const copy=canonicalActionValue(value) as T;
  function freeze(item:unknown):void {
    if(item && typeof item==="object") {for(const child of Object.values(item))freeze(child);Object.freeze(item);}
  }
  freeze(copy);return copy;
}
export class ActionBlocked extends Error {
  readonly status:"denied"|"awaiting_approval"|"result_unknown";
  readonly actionId:string;
  constructor(status: "denied" | "awaiting_approval" | "result_unknown", actionId: string) {
    super(status === "awaiting_approval" ? "Waiting for exact-action approval." : status === "result_unknown" ? "Result needs verification before retry." : "Action is not authorized.");
    this.status=status;this.actionId=actionId;
  }
}

const riskRank = { low: 0, medium: 1, high: 2, critical: 3 };
export const localAuthorityProvider: AuthorityProvider = {
  async evaluate(action, target, authority) {
    const deny = (reason: string): AuthorityDecision => ({ decision: "DENY", reason, source: "local" });
    const agent = await getAgent(action.ownerId,action.executor.agentId);
    if (action.executor.kind === "external-agent") return deny("External agent authority is not configured.");
    if (action.executor.kind === "system") {
      if(action.capabilityId!=="notification.send" || action.trigger.kind!=="system" || !action.delivery
        || target.account!==action.ownerId || target.provider!==action.delivery.channel
        || Object.keys(action.parameters).some(key=>!["channel","resultReference"].includes(key))
        || action.parameters.channel!==action.delivery.channel || action.parameters.resultReference!==action.delivery.resultReference
        || getCapability("notification.send")?.availability.status!=="available")return deny("System action is outside the bounded delivery policy.");
      return {decision:"ALLOW",reason:"Owner-approved result delivery; database claim is checked before transmission.",source:"routine-delivery-v1"};
    }
    if (!agent || agent.status !== "active" || !effectiveCapability(agent,action.capabilityId).allowed) return deny("Executor capability is unavailable.");
    const capability = getCapability(action.capabilityId);
    if (!capability) return deny("Unknown capability.");
    if (capability.availability.status !== "available" || capability.dependencies.some(id => getCapability(id)?.availability.status !== "available")) {
      return deny("Capability or dependency is unavailable.");
    }
    if (authority) {
      if (!authority.allowedCapabilities.includes(action.capabilityId)) return deny("Routine does not grant this capability.");
      if (riskRank[capability.risk.level] > riskRank[authority.maximumRisk]) return deny("Routine risk limit exceeded.");
      const targets = authority.allowedTargets.filter(t => t.capabilityId === action.capabilityId);
      if (targets.length && !targets.some(t => t.provider === target.provider && t.account === target.account && t.resource === target.resource && (!t.environment || t.environment === target.environment))) {
        return deny("Account or resource is outside routine authority.");
      }
    } else if (["scheduled_occurrence","webhook","proactive_review","delegation","reminder","routine","relay_request"].includes(action.trigger.kind)) {
      return deny("Unattended and delegated execution requires bounded authority.");
    }
    const policy = resolveApprovalPolicy(action);
    return { decision: policy.decision === "ALLOW" && authority?.requiresApprovalFor.includes(action.capabilityId) ? "REQUIRE_APPROVAL" : policy.decision,
      reason: policy.reason,source: "local" };
  },
};

export class ActionGateway {
  private database:ExecutionDatabase;
  private executionEnabled:()=>boolean;
  private authority:AuthorityProvider;
  private approvals:typeof requestApproval;
  constructor(
    database: ExecutionDatabase = db() as ExecutionDatabase,
    authority: AuthorityProvider = localAuthorityProvider,
    approvals: typeof requestApproval = requestApproval,
    executionEnabled:()=>boolean=()=>ROUTINE_RELEASE.enabled,
  ) {this.database=database;this.authority=authority;this.approvals=approvals;this.executionEnabled=executionEnabled;}

  async execute<Result>(action: ActionRequest, adapter: ActionAdapter<Result>, signal?: AbortSignal): Promise<{ actionId: string; receipt: Record<string, unknown> }> {
    action=frozenJson(action);
    if (!action.actionKey || !action.ownerId || !action.runId) throw new Error("Action identity is incomplete.");
    let target: ActionTarget;
    let decision: AuthorityDecision;
    let targetResolved=false;
    const context = await this.database.query(`SELECT r.agent_id,r.role_id,g.updated_at::text AS agent_revision,o.id AS occurrence_id,o.claim_version,o.claimed_by,o.lease_expires_at,
        o.status AS occurrence_status,v.configuration,owner_channel.run_id AS owner_channel_run
      FROM task_runs r JOIN agents g ON g.owner_id=r.owner_id AND g.id=r.agent_id
      LEFT JOIN owner_channel_requests owner_channel ON owner_channel.owner_id=r.owner_id AND owner_channel.run_id=r.id
      LEFT JOIN execution_occurrences o ON o.owner_id=r.owner_id AND o.run_id=r.id
      LEFT JOIN execution_routine_versions v ON v.owner_id=o.owner_id AND v.routine_id=o.routine_id AND v.version=o.routine_version
      WHERE r.owner_id=$1 AND r.id=$2 AND r.agent_id=$3`, [action.ownerId,action.runId,action.executor.agentId]);
    if (!context[0]) throw new ActionBlocked("denied", "unresolved");
    if(context[0].owner_channel_run&&!ownerChannelConfiguration().enabled)throw new ActionBlocked("denied","owner_execution_disabled");
    if((context[0].role_id??null)!==(action.executor.roleId??null))throw new ActionBlocked("denied","unresolved");
    const occurrence = context[0].occurrence_id;
    if(occurrence&&!this.executionEnabled())throw new ActionBlocked("denied","routine_execution_disabled");
    if (occurrence && !action.delivery && (!action.occurrence || occurrence !== action.occurrence.id || action.trigger.kind !== "scheduled_occurrence")) {
      throw new ActionBlocked("denied", "unresolved");
    }
    if(action.delivery && ((context[0].configuration as RoutineConfiguration|undefined)?.deliveryChannel!==action.delivery.channel
      || action.executor.kind!=="system"))throw new ActionBlocked("denied","delivery_policy_mismatch");
    try {
      target = frozenJson(await adapter.resolveTarget(action.parameters));
      if (!target.provider || !target.account || !target.resource) throw new Error("Unresolved target.");
      targetResolved=true;
      decision = await this.authority.evaluate(action,target,(context[0].configuration as RoutineConfiguration | undefined)?.authority);
    } catch {
      // Do not put exception text or provider payloads into an audit surface.
      target = { provider: "unresolved",account: "unresolved",resource: "unresolved" };
      decision = { decision: "DENY",reason: "Authority or target resolution unavailable.",source: "local",reasonCode:targetResolved?"authority_unavailable":"target_unresolved" };
    }
    const deliveryBinding=action.delivery?{id:action.delivery.id,channel:action.delivery.channel,resultReference:action.delivery.resultReference}:null;
    const binding = approvalBinding({ taskId:action.runId,capabilityId:action.capabilityId,resource:JSON.stringify(target),
      action:action.actionClass,parameters:{ payload:action.parameters,target,executor:action.executor,trigger:action.trigger,computer:action.computer??null,...(deliveryBinding?{delivery:deliveryBinding}: {}) } });
    const id = `action_${randomUUID()}`;
    const summary=safeActionParameters(Object.fromEntries(Object.entries(action.parameters).map(([key,value])=>
      [key,/^(text|html|content|body)$/i.test(key)?"[content bound by hash]":value])));
    const reasonCode=decision.reasonCode??(decision.decision==="DENY"?"capability_denied":decision.decision==="REQUIRE_APPROVAL"?"approval_required":"capability_allowed");
    // A tool may return while Approval Center waits. A later tool invocation
    // can continue only the identical pending binding, never a completed grant.
    const existingAction=()=>this.database.query(`SELECT * FROM action_requests WHERE owner_id=$1 AND run_id=$2
      AND (action_key=$4 OR (parameter_hash=$3 AND status IN ('planned','awaiting_approval','authorized','executing','verifying','result_unknown','recovering','needs_you','retryable')))
      ORDER BY (action_key=$4) DESC,created_at LIMIT 1`,[action.ownerId,action.runId,binding,action.actionKey]);
    const pending=await existingAction();
    let rows = pending.length?pending:await this.database.query(`INSERT INTO action_requests(id,owner_id,run_id,occurrence_id,action_key,executor,trigger,capability_id,
        action_class,target,parameter_hash,safe_summary,decision,authority_source,status,computer_session_id,control_version,reason_code)
      VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9,$10::jsonb,$11,$17::jsonb,$12,$13,$14,$15,$16,$18)
      ON CONFLICT DO NOTHING RETURNING *`,
    [id,action.ownerId,action.runId,action.occurrence?.id??null,action.actionKey,JSON.stringify(action.executor),JSON.stringify(action.trigger),action.capabilityId,
      action.actionClass,JSON.stringify(safeActionParameters(target as unknown as Record<string,unknown>)),binding,decision.decision,decision.source,
      decision.decision === "DENY" ? "denied" : "planned",action.computer?.sessionId??null,action.computer?.controlVersion??null,JSON.stringify(summary),reasonCode]);
    if(!rows.length)rows=await existingAction();
    if(!rows.length)throw new ActionBlocked("denied","binding_claim_changed");
    const row = rows[0]!;
    const actionId = String(row.id);
    if (row.parameter_hash !== binding || decision.decision === "DENY") {
      await this.recordDenial(action.ownerId,actionId,row.parameter_hash!==binding?"approval_binding_mismatch":reasonCode);
      throw new ActionBlocked("denied",actionId);
    }
    if (row.status === "completed") return { actionId,receipt:row.provider_receipt as Record<string,unknown> };
    if (["executing","verifying","result_unknown","recovering","needs_you"].includes(String(row.status))) throw new ActionBlocked("result_unknown",actionId);
    if (["denied","cancelled","failed"].includes(String(row.status))) throw new ActionBlocked("denied",actionId);
    if(row.status==="retryable") {
      const retry=await this.database.query(`UPDATE action_requests SET status='planned',approval_id=NULL,updated_at=now()
        WHERE owner_id=$1 AND id=$2 AND status='retryable' AND recovery_result->>'result'='not_executed' RETURNING id`,[action.ownerId,actionId]);
      if(!retry.length)throw new ActionBlocked("denied",actionId);
      row.approval_id=null;
    }
    if(row.decision==="REQUIRE_APPROVAL" && decision.decision==="ALLOW")decision={...decision,decision:"REQUIRE_APPROVAL"};
    if (decision.decision === "REQUIRE_APPROVAL") {
      if(row.approval_id && context[0].owner_channel_run) {
        const [approval]=await this.database.query(`SELECT id FROM task_approval_decisions WHERE owner_id=$1 AND id=$2 AND expires_at>now()`,[action.ownerId,row.approval_id]);
        if(!approval)throw new ActionBlocked("denied",actionId);
      }
      if(row.approval_id) {
        const expired=await this.database.query(`UPDATE action_requests a SET approval_id=NULL,status='planned',approval_generation=approval_generation+1,updated_at=now()
          FROM task_approval_decisions p WHERE a.owner_id=$1 AND a.id=$2 AND p.id=a.approval_id
          AND p.expires_at<=now() AND a.status='awaiting_approval' RETURNING a.id,a.approval_generation`,[action.ownerId,actionId]);
        if(expired.length){row.approval_id=null;row.approval_generation=expired[0].approval_generation;}
      }
      if(row.approval_id) {
        const refused=await this.database.query(`UPDATE action_requests a SET status='denied',reason_code='approval_denied',updated_at=now()
          FROM task_approval_decisions p WHERE a.owner_id=$1 AND a.id=$2 AND p.id=a.approval_id
            AND p.status IN ('denied','invalidated') AND a.status='awaiting_approval' RETURNING a.id`,[action.ownerId,actionId]);
        if(refused.length){await this.recordDenial(action.ownerId,actionId,"approval_denied");throw new ActionBlocked("denied",actionId);}
      }
      if (!row.approval_id) {
        const approval = await this.approvals({ ownerId:action.ownerId,taskId:action.runId,requestedBy:action.executor.agentId,
          capabilityId:action.capabilityId,resource:JSON.stringify(target),action:action.actionClass,actionClass:action.actionClass,
          parameters:{ payload:action.parameters,target,executor:action.executor,trigger:action.trigger,computer:action.computer??null,...(deliveryBinding?{delivery:deliveryBinding}: {}) },
          prompt:"Review the resolved target and exact action before execution.",forceApproval:true,requestKey:`${actionId}:${row.attempt_count}:${row.approval_generation}` });
        await this.database.query(`UPDATE action_requests SET approval_id=$3,status='awaiting_approval',updated_at=now()
          WHERE owner_id=$1 AND id=$2 AND status='planned' AND approval_id IS NULL`, [action.ownerId,actionId,approval.approval?.id??null]);
        if (context[0].owner_channel_run || action.occurrence) {
          await new PendingActionContinuation(this.database).save(action,actionId);
        }
        throw new ActionBlocked("awaiting_approval",actionId);
      }
      if (row.status === "awaiting_approval" && (context[0].owner_channel_run || action.occurrence)) {
        const checkpoint=new PendingActionContinuation(this.database);
        if(context[0].owner_channel_run || !await checkpoint.get(action.ownerId,action.runId))await checkpoint.save(action,actionId);
      }
    }
    // This CAS is the transmission boundary. A crash after it is uncertain even
    // when execute never got CPU time. Safety takes precedence over availability.
    // Re-evaluate after approval lookup and immediately before the durable claim.
    // A provider failure or a newly narrower policy can never become ALLOW.
    try {
      if(context[0].owner_channel_run&&!ownerChannelConfiguration().enabled)throw new ActionBlocked("denied",actionId);
      if(occurrence&&!this.executionEnabled())throw new ActionBlocked("denied",actionId);
      const fresh=await this.authority.evaluate(action,target,(context[0].configuration as RoutineConfiguration | undefined)?.authority);
      if(fresh.decision==="DENY" || (fresh.decision==="REQUIRE_APPROVAL" && decision.decision==="ALLOW")) throw new Error("Authority changed");
    } catch {
      await this.recordDenial(action.ownerId,actionId,"authority_unavailable");
      throw new ActionBlocked("denied",actionId);
    }
    const started = await this.database.query(`WITH channel_reservation AS (
      UPDATE owner_channel_requests SET actions_started=actions_started+1
      WHERE owner_id=$1 AND run_id=$14 AND revoked_at IS NULL AND expires_at>now()
        AND NOT usage_unknown AND tokens_used<12000 AND actions_started<12 RETURNING run_id
    ), started AS (
      UPDATE action_requests a SET status='executing',attempt_count=attempt_count+1,updated_at=now()
      WHERE a.owner_id=$1 AND a.id=$2 AND parameter_hash=$3 AND status IN ('planned','authorized','awaiting_approval')
        AND (NOT EXISTS(SELECT 1 FROM owner_channel_requests w WHERE w.owner_id=a.owner_id AND w.run_id=a.run_id)
          OR EXISTS(SELECT 1 FROM channel_reservation c WHERE c.run_id=a.run_id))
        AND EXISTS(SELECT 1 FROM task_runs r WHERE r.owner_id=a.owner_id AND r.id=a.run_id
          AND ((r.status IN ('running','awaiting_approval') AND $10::text IS NULL AND (r.deadline_at IS NULL OR r.deadline_at>now())
          AND r.model_steps<r.max_model_steps AND r.estimated_cost_usd<r.max_estimated_cost_usd)
          OR (r.status='completed' AND $10::text IS NOT NULL AND EXISTS(SELECT 1 FROM review_deliveries d
            JOIN execution_occurrences o ON o.owner_id=d.owner_id AND o.id=d.occurrence_id
            JOIN execution_routines routine ON routine.owner_id=o.owner_id AND routine.id=o.routine_id
            WHERE d.id=$10 AND d.owner_id=a.owner_id AND d.run_id=a.run_id AND d.claim_version=$11 AND d.status='delivering'
              AND d.claimed_until>now() AND d.channel=$12 AND d.result_reference=$13 AND o.status='completed'
              AND routine.status='active' AND routine.version=o.routine_version))))
        AND NOT EXISTS(SELECT 1 FROM owner_channel_requests w WHERE w.owner_id=a.owner_id AND w.run_id=a.run_id
          AND (w.revoked_at IS NOT NULL OR w.expires_at<=now() OR w.usage_unknown OR w.tokens_used>=12000))
        AND EXISTS(SELECT 1 FROM agents g WHERE g.owner_id=a.owner_id AND g.id=$8 AND g.status='active' AND g.updated_at=$9::timestamptz)
        AND ($4<>'REQUIRE_APPROVAL' OR EXISTS(SELECT 1 FROM task_approval_decisions p
          WHERE p.id=a.approval_id AND p.owner_id=a.owner_id AND p.task_id=a.run_id AND p.binding_hash=a.parameter_hash
            AND p.status='approved' AND p.expires_at>now()))
        AND (a.occurrence_id IS NULL OR EXISTS(SELECT 1 FROM execution_occurrences o JOIN execution_routines r ON r.owner_id=o.owner_id AND r.id=o.routine_id
          WHERE o.owner_id=a.owner_id AND o.id=a.occurrence_id AND o.status='running' AND o.claim_version=$5 AND o.claimed_by=$6
            AND o.lease_expires_at>now() AND r.status='active' AND r.version=o.routine_version))
        AND (a.computer_session_id IS NULL OR EXISTS(SELECT 1 FROM computer_control_leases c
          WHERE c.owner_id=a.owner_id AND c.computer_session_id=a.computer_session_id AND c.agent_id=$8 AND c.controller='AGENT' AND c.version=a.control_version))
      RETURNING *
    ), receipt AS (
      INSERT INTO action_receipts(owner_id,action_id,attempt_number,event,details)
      SELECT owner_id,id,attempt_count,'authorized',jsonb_build_object('authority',$7::text,'decision',$4::text) FROM started
    ) SELECT id FROM started`, [action.ownerId,actionId,binding,decision.decision,action.occurrence?.claimVersion??null,action.occurrence?.workerId??null,decision.source,action.executor.agentId,context[0].agent_revision,
      action.delivery?.id??null,action.delivery?.claimVersion??null,action.delivery?.channel??null,action.delivery?.resultReference??null,action.runId]);
    if (!started[0]) {
      await this.recordDenial(action.ownerId,actionId,"execution_precondition_failed");
      throw new ActionBlocked(decision.decision === "REQUIRE_APPROVAL" ? "awaiting_approval" : "denied",actionId);
    }
    if (action.computer) {
      const reserved = await this.database.query(`UPDATE computer_control_leases SET gateway_actions_in_flight=gateway_actions_in_flight+1
        WHERE owner_id=$1 AND computer_session_id=$2 AND controller='AGENT' AND version=$3 AND gateway_actions_in_flight=0 RETURNING version`,
      [action.ownerId,action.computer.sessionId,action.computer.controlVersion]);
      if (!reserved[0]) {
        await this.database.query(`UPDATE action_requests SET status='denied',updated_at=now() WHERE owner_id=$1 AND id=$2 AND status='executing'`,[action.ownerId,actionId]);
        throw new ActionBlocked("denied",actionId);
      }
    }
    let releaseComputer = false;
    const authorized:AuthorizedAction=Object.freeze({idempotencyKey:actionId,authorityId:actionId,executor:action.executor,expiresAt:Date.now()+30_000,target,capabilityId:action.capabilityId,signal});
    try {
      handles.set(authorized,{binding:JSON.stringify(canonicalActionValue({parameters:action.parameters,target})),revalidate:async()=>{
        if(context[0].owner_channel_run&&!ownerChannelConfiguration().enabled)throw new ActionBlocked("denied",actionId);
        if(occurrence&&!this.executionEnabled())throw new ActionBlocked("denied",actionId);
        const fresh=await this.authority.evaluate(action,target,(context[0].configuration as RoutineConfiguration|undefined)?.authority);
        if(fresh.decision==="DENY" || (fresh.decision==="REQUIRE_APPROVAL" && decision.decision==="ALLOW"))throw new ActionBlocked("denied",actionId);
        const valid=await this.database.query(`SELECT a.id FROM action_requests a
          JOIN task_runs r ON r.owner_id=a.owner_id AND r.id=a.run_id
          JOIN agents g ON g.owner_id=r.owner_id AND g.id=r.agent_id
          WHERE a.owner_id=$1 AND a.id=$2 AND a.status='executing' AND a.parameter_hash=$3
            AND NOT EXISTS(SELECT 1 FROM owner_channel_requests w WHERE w.owner_id=a.owner_id AND w.run_id=a.run_id
              AND (w.revoked_at IS NOT NULL OR w.expires_at<=now() OR w.usage_unknown OR w.tokens_used>=12000))
            AND g.status='active' AND g.updated_at=$4::timestamptz
            AND (($5::text IS NULL AND r.status IN ('running','awaiting_approval') AND (r.deadline_at IS NULL OR r.deadline_at>now())
              AND r.model_steps<r.max_model_steps AND r.estimated_cost_usd<r.max_estimated_cost_usd)
              OR ($5::text IS NOT NULL AND r.status='completed' AND EXISTS(SELECT 1 FROM review_deliveries d
                JOIN execution_occurrences o ON o.owner_id=d.owner_id AND o.id=d.occurrence_id
                JOIN execution_routines routine ON routine.owner_id=o.owner_id AND routine.id=o.routine_id
                WHERE d.id=$5 AND d.owner_id=a.owner_id AND d.run_id=a.run_id AND d.status='delivering' AND d.claim_version=$6
                  AND d.claimed_until>now() AND o.status='completed' AND routine.status='active' AND routine.version=o.routine_version)))
            AND ($7<>'REQUIRE_APPROVAL' OR EXISTS(SELECT 1 FROM task_approval_decisions p WHERE p.id=a.approval_id
              AND p.owner_id=a.owner_id AND p.binding_hash=a.parameter_hash AND p.status='approved' AND p.expires_at>now()))
            AND (a.occurrence_id IS NULL OR EXISTS(SELECT 1 FROM execution_occurrences o JOIN execution_routines routine
              ON routine.owner_id=o.owner_id AND routine.id=o.routine_id WHERE o.owner_id=a.owner_id AND o.id=a.occurrence_id
                AND o.status='running' AND o.claim_version=$8 AND o.claimed_by=$9 AND o.lease_expires_at>now()
                AND routine.status='active' AND routine.version=o.routine_version))
            AND (a.computer_session_id IS NULL OR EXISTS(SELECT 1 FROM computer_control_leases c JOIN computer_sessions s ON s.id=c.computer_session_id
              WHERE c.owner_id=a.owner_id AND c.computer_session_id=a.computer_session_id AND c.controller='AGENT'
                AND c.version=a.control_version AND c.agent_id=g.id AND s.expires_at>now() AND s.status IN ('ready','running')))`,
          [action.ownerId,actionId,binding,context[0].agent_revision,action.delivery?.id??null,action.delivery?.claimVersion??null,decision.decision,action.occurrence?.claimVersion??null,action.occurrence?.workerId??null]);
        if(!valid.length)throw new ActionBlocked("denied",actionId);
      }});
      const result = await adapter.execute(action.parameters,authorized);
      handles.delete(authorized);
      providerHandles.delete(authorized);
      // Persist the provider identifier before potentially slow verification.
      await this.database.query(`WITH changed AS (
        UPDATE action_requests SET status='verifying',provider_receipt=$3::jsonb,updated_at=now()
        WHERE owner_id=$1 AND id=$2 AND status='executing' RETURNING owner_id,id,attempt_count
      ) INSERT INTO action_receipts(owner_id,action_id,attempt_number,event,details)
        SELECT owner_id,id,attempt_count,'provider_returned',$3::jsonb FROM changed`,
      [action.ownerId,actionId,JSON.stringify(safeActionParameters(adapter.receipt?.(result)??{}))]);
      const verified = await adapter.verify(result,target);
      const receipt = safeActionParameters(verified.receipt);
      const recorded = await this.record(action.ownerId,actionId,verified.verified?"completed":"result_unknown",receipt);
      if (!verified.verified || !recorded) throw new ActionBlocked("result_unknown",actionId);
      releaseComputer = true;
      return { actionId,receipt };
    } catch {
      await this.record(action.ownerId,actionId,"result_unknown",{});
      throw new ActionBlocked("result_unknown",actionId);
    } finally {
      handles.delete(authorized);
      providerHandles.delete(authorized);
      // Interrupted processes deliberately leave the reservation in place.
      // Recovery must reconcile the remote action before releasing control.
      if (action.computer && releaseComputer) await this.database.query(`UPDATE computer_control_leases SET gateway_actions_in_flight=greatest(0,gateway_actions_in_flight-1)
        WHERE owner_id=$1 AND computer_session_id=$2 AND version=$3`,[action.ownerId,action.computer.sessionId,action.computer.controlVersion]);
    }
  }

  private async recordDenial(ownerId:string,actionId:string,reason:string) {
    await this.database.query(`WITH updated AS (
      UPDATE action_requests SET reason_code=$3,updated_at=now() WHERE owner_id=$1 AND id=$2 AND status IN ('planned','authorized','awaiting_approval','denied')
    ) INSERT INTO action_receipts(owner_id,action_id,attempt_number,event,details)
      SELECT owner_id,id,attempt_count,'denied',jsonb_build_object('reason',$3::text)
      FROM action_requests WHERE owner_id=$1 AND id=$2`,[ownerId,actionId,reason]);
  }

  /** Read-only provider recovery. This API has no execute/resend callback. */
  async recover(ownerId:string,actionId:string,inspect:(receipt:Record<string,unknown>,target:ActionTarget)=>Promise<{verified:boolean;receipt:Record<string,unknown>}>):Promise<boolean> {
    const result=await new ActionRecovery(this.database).recover(ownerId,actionId,()=>({id:"receipt_inspection.v1",inspect:async({receipt,target})=>{
      const result=await inspect(receipt,target);
      return {outcome:result.verified?"succeeded":"indeterminate",evidence:result.receipt};
    }}));
    return result==="completed";
  }

  private async record(ownerId: string, actionId: string, status: "completed" | "result_unknown", receipt: Record<string,unknown>) {
    const rows = await this.database.query(`WITH changed AS (
      UPDATE action_requests SET status=$3,provider_receipt=coalesce(provider_receipt,'{}'::jsonb)||$4::jsonb,updated_at=now()
      WHERE owner_id=$1 AND id=$2 AND status IN ('executing','verifying') RETURNING *
    ), receipt AS (
      INSERT INTO action_receipts(owner_id,action_id,attempt_number,event,details)
      SELECT owner_id,id,attempt_count,$3,$4::jsonb FROM changed
    ) SELECT id FROM changed`,[ownerId,actionId,status,JSON.stringify(receipt)]);
    return rows.length === 1;
  }
}
