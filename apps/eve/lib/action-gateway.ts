import { randomUUID } from "node:crypto";
import { db } from "../agent/lib/receipts-db.ts";
import { approvalBinding, requestApproval, resolveApprovalPolicy, safeActionParameters, type ActionClass } from "./approvals.ts";
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
  executor: { kind: "primary-agent" | "persistent-agent" | "on-demand-role" | "routine" | "system"; agentId: string; roleId?: string };
  trigger: { kind: "owner_chat" | "goal_execution" | "scheduled_occurrence" | "webhook" | "proactive_review" | "delegation"; id?: string };
  parameters: Record<string, unknown>;
  occurrence?: { id: string; claimVersion: number; workerId: string };
  computer?: { sessionId: string; controlVersion: number };
}
export type AuthorityDecision = { decision: "ALLOW" | "REQUIRE_APPROVAL" | "DENY"; reason: string; source: string };
export interface AuthorityProvider {
  evaluate(action: ActionRequest, target: ActionTarget, routineAuthority?: RoutineConfiguration["authority"]): Promise<AuthorityDecision>;
}
export interface ActionAdapter<Result> {
  // Resolve from authenticated provider/account state, not a model-supplied label.
  resolveTarget(parameters: Record<string, unknown>): Promise<ActionTarget>;
  execute(parameters: Record<string, unknown>, context: { idempotencyKey: string; signal?: AbortSignal }): Promise<Result>;
  verify(result: Result, target: ActionTarget): Promise<{ verified: boolean; receipt: Record<string, unknown> }>;
}
export class ActionBlocked extends Error {
  constructor(readonly status: "denied" | "awaiting_approval" | "result_unknown", readonly actionId: string) {
    super(status === "awaiting_approval" ? "Waiting for exact-action approval." : status === "result_unknown" ? "Result needs verification before retry." : "Action is not authorized.");
  }
}

const riskRank = { low: 0, medium: 1, high: 2, critical: 3 };
export const localAuthorityProvider: AuthorityProvider = {
  async evaluate(action, target, authority) {
    const deny = (reason: string): AuthorityDecision => ({ decision: "DENY", reason, source: "local" });
    const agent = await getAgent(action.ownerId,action.executor.agentId);
    if (!agent || !effectiveCapability(agent,action.capabilityId).allowed) return deny("Executor capability is unavailable.");
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
    } else if (["scheduled_occurrence","webhook","proactive_review","delegation"].includes(action.trigger.kind)) {
      return deny("Unattended and delegated execution requires bounded authority.");
    }
    const policy = resolveApprovalPolicy(action);
    return { decision: policy.decision === "ALLOW" && authority?.requiresApprovalFor.includes(action.capabilityId) ? "REQUIRE_APPROVAL" : policy.decision,
      reason: policy.reason,source: "local" };
  },
};

export class ActionGateway {
  constructor(
    private database: ExecutionDatabase = db() as ExecutionDatabase,
    private authority: AuthorityProvider = localAuthorityProvider,
    private approvals: typeof requestApproval = requestApproval,
  ) {}

  async execute<Result>(action: ActionRequest, adapter: ActionAdapter<Result>, signal?: AbortSignal): Promise<{ actionId: string; receipt: Record<string, unknown> }> {
    if (!action.actionKey || !action.ownerId || !action.runId) throw new Error("Action identity is incomplete.");
    let target: ActionTarget;
    let decision: AuthorityDecision;
    const context = await this.database.query(`SELECT r.agent_id,o.id AS occurrence_id,o.claim_version,o.claimed_by,o.lease_expires_at,
        o.status AS occurrence_status,v.configuration
      FROM task_runs r LEFT JOIN execution_occurrences o ON o.owner_id=r.owner_id AND o.run_id=r.id
      LEFT JOIN execution_routine_versions v ON v.owner_id=o.owner_id AND v.routine_id=o.routine_id AND v.version=o.routine_version
      WHERE r.owner_id=$1 AND r.id=$2 AND r.agent_id=$3`, [action.ownerId,action.runId,action.executor.agentId]);
    if (!context[0]) throw new ActionBlocked("denied", "unresolved");
    const occurrence = context[0].occurrence_id;
    if (occurrence && (!action.occurrence || occurrence !== action.occurrence.id || action.trigger.kind !== "scheduled_occurrence")) {
      throw new ActionBlocked("denied", "unresolved");
    }
    try {
      target = await adapter.resolveTarget(action.parameters);
      if (!target.provider || !target.account || !target.resource) throw new Error("Unresolved target.");
      decision = await this.authority.evaluate(action,target,(context[0].configuration as RoutineConfiguration | undefined)?.authority);
    } catch {
      // Do not put exception text or provider payloads into an audit surface.
      target = { provider: "unresolved",account: "unresolved",resource: "unresolved" };
      decision = { decision: "DENY",reason: "Authority or target resolution unavailable.",source: "local" };
    }
    const binding = approvalBinding({ taskId:action.runId,capabilityId:action.capabilityId,resource:JSON.stringify(target),
      action:action.actionClass,parameters:{ payload:action.parameters,target,executor:action.executor,trigger:action.trigger,computer:action.computer??null } });
    const id = `action_${randomUUID()}`;
    const rows = await this.database.query(`INSERT INTO action_requests(id,owner_id,run_id,occurrence_id,action_key,executor,trigger,capability_id,
        action_class,target,parameter_hash,safe_summary,decision,authority_source,status,computer_session_id,control_version)
      VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9,$10::jsonb,$11,'{}'::jsonb,$12,$13,$14,$15,$16)
      ON CONFLICT(owner_id,run_id,action_key) DO UPDATE SET action_key=action_requests.action_key RETURNING *`,
    [id,action.ownerId,action.runId,action.occurrence?.id??null,action.actionKey,JSON.stringify(action.executor),JSON.stringify(action.trigger),action.capabilityId,
      action.actionClass,JSON.stringify(safeActionParameters(target as unknown as Record<string,unknown>)),binding,decision.decision,decision.source,
      decision.decision === "DENY" ? "denied" : "planned",action.computer?.sessionId??null,action.computer?.controlVersion??null]);
    const row = rows[0]!;
    const actionId = String(row.id);
    if (row.parameter_hash !== binding || decision.decision === "DENY") throw new ActionBlocked("denied",actionId);
    if (row.status === "completed") return { actionId,receipt:row.provider_receipt as Record<string,unknown> };
    if (["executing","verifying","result_unknown"].includes(String(row.status))) throw new ActionBlocked("result_unknown",actionId);
    if (["denied","cancelled","failed"].includes(String(row.status))) throw new ActionBlocked("denied",actionId);
    if (decision.decision === "REQUIRE_APPROVAL") {
      if (!row.approval_id) {
        const approval = await this.approvals({ ownerId:action.ownerId,taskId:action.runId,requestedBy:action.executor.agentId,
          capabilityId:action.capabilityId,resource:JSON.stringify(target),action:action.actionClass,actionClass:action.actionClass,
          parameters:{ payload:action.parameters,target,executor:action.executor,trigger:action.trigger,computer:action.computer??null },
          prompt:"Review the resolved target and exact action before execution.",forceApproval:true });
        await this.database.query(`UPDATE action_requests SET approval_id=$3,status='awaiting_approval',updated_at=now()
          WHERE owner_id=$1 AND id=$2 AND status='planned' AND approval_id IS NULL`, [action.ownerId,actionId,approval.approval?.id??null]);
        throw new ActionBlocked("awaiting_approval",actionId);
      }
    }
    // This CAS is the transmission boundary. A crash after it is uncertain even
    // when execute never got CPU time. Safety takes precedence over availability.
    const started = await this.database.query(`WITH started AS (
      UPDATE action_requests a SET status='executing',attempt_count=attempt_count+1,updated_at=now()
      WHERE a.owner_id=$1 AND a.id=$2 AND parameter_hash=$3 AND status IN ('planned','authorized','awaiting_approval')
        AND EXISTS(SELECT 1 FROM task_runs r WHERE r.owner_id=a.owner_id AND r.id=a.run_id
          AND r.status IN ('running','awaiting_approval') AND (r.deadline_at IS NULL OR r.deadline_at>now())
          AND r.model_steps<r.max_model_steps AND r.estimated_cost_usd<r.max_estimated_cost_usd)
        AND ($4<>'REQUIRE_APPROVAL' OR EXISTS(SELECT 1 FROM task_approval_decisions p
          WHERE p.id=a.approval_id AND p.owner_id=a.owner_id AND p.task_id=a.run_id AND p.binding_hash=a.parameter_hash
            AND p.status='approved' AND p.expires_at>now()))
        AND (a.occurrence_id IS NULL OR EXISTS(SELECT 1 FROM execution_occurrences o JOIN execution_routines r ON r.owner_id=o.owner_id AND r.id=o.routine_id
          WHERE o.owner_id=a.owner_id AND o.id=a.occurrence_id AND o.status='running' AND o.claim_version=$5 AND o.claimed_by=$6
            AND o.lease_expires_at>now() AND r.status='active' AND r.version=o.routine_version))
        AND (a.computer_session_id IS NULL OR EXISTS(SELECT 1 FROM computer_control_leases c
          WHERE c.owner_id=a.owner_id AND c.computer_session_id=a.computer_session_id AND c.controller='AGENT' AND c.version=a.control_version))
      RETURNING *
    ), receipt AS (
      INSERT INTO action_receipts(owner_id,action_id,attempt_number,event,details)
      SELECT owner_id,id,attempt_count,'authorized',jsonb_build_object('authority',$7::text,'decision',$4::text) FROM started
    ) SELECT id FROM started`, [action.ownerId,actionId,binding,decision.decision,action.occurrence?.claimVersion??null,action.occurrence?.workerId??null,decision.source]);
    if (!started[0]) throw new ActionBlocked(decision.decision === "REQUIRE_APPROVAL" ? "awaiting_approval" : "denied",actionId);
    if (action.computer) {
      const reserved = await this.database.query(`UPDATE computer_control_leases SET gateway_actions_in_flight=gateway_actions_in_flight+1
        WHERE owner_id=$1 AND computer_session_id=$2 AND controller='AGENT' AND version=$3 RETURNING version`,
      [action.ownerId,action.computer.sessionId,action.computer.controlVersion]);
      if (!reserved[0]) {
        await this.database.query(`UPDATE action_requests SET status='denied',updated_at=now() WHERE owner_id=$1 AND id=$2 AND status='executing'`,[action.ownerId,actionId]);
        throw new ActionBlocked("denied",actionId);
      }
    }
    let releaseComputer = false;
    try {
      const result = await adapter.execute(action.parameters,{ idempotencyKey:actionId,signal });
      await this.database.query(`UPDATE action_requests SET status='verifying',updated_at=now() WHERE owner_id=$1 AND id=$2 AND status='executing'`,[action.ownerId,actionId]);
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
      // Interrupted processes deliberately leave the reservation in place.
      // Recovery must reconcile the remote action before releasing control.
      if (action.computer && releaseComputer) await this.database.query(`UPDATE computer_control_leases SET gateway_actions_in_flight=greatest(0,gateway_actions_in_flight-1)
        WHERE owner_id=$1 AND computer_session_id=$2 AND version=$3`,[action.ownerId,action.computer.sessionId,action.computer.controlVersion]);
    }
  }

  private async record(ownerId: string, actionId: string, status: "completed" | "result_unknown", receipt: Record<string,unknown>) {
    const rows = await this.database.query(`WITH changed AS (
      UPDATE action_requests SET status=$3,provider_receipt=$4::jsonb,updated_at=now()
      WHERE owner_id=$1 AND id=$2 AND status IN ('executing','verifying') RETURNING *
    ), receipt AS (
      INSERT INTO action_receipts(owner_id,action_id,attempt_number,event,details)
      SELECT owner_id,id,attempt_count,$3,$4::jsonb FROM changed
    ) SELECT id FROM changed`,[ownerId,actionId,status,JSON.stringify(receipt)]);
    return rows.length === 1;
  }
}
