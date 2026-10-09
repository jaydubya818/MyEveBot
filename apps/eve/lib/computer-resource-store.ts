import { createHash, randomUUID } from "node:crypto";
import { db } from "../agent/lib/receipts-db.ts";

export type ResourceDatabase = { query(sql: string, params?: unknown[]): Promise<Record<string, unknown>[]> };
export interface ComputerResource extends Record<string, unknown> {
  id: string; owner_id: string; agent_id: string; run_id: string; computer_session_id: string; runtime_session_id: string;
  provider: "vercel"; environment: string; resource_name: string; generation: number; provision_id: string;
  preparation_id: string; source_snapshot_id: string; provider_session_id: string | null; owned_snapshot_ids: string[];
  state: "provisioning" | "active" | "cleanup_pending" | "cleaned"; version: number; claim_token: string | null;
  reason: string | null; initiator: "owner" | "agent" | "system" | null;
}
export interface ResourceBinding {
  id: string; ownerId: string; sessionId: string; environment: string; resourceName: string; generation: number; version: number;
}
export function resourceBinding(row: ComputerResource): ResourceBinding {
  return { id: row.id, ownerId: row.owner_id, sessionId: row.computer_session_id, environment: row.environment,
    resourceName: row.resource_name, generation: Number(row.generation), version: Number(row.version) };
}
export function computerResourceEnvironment(env = process.env): string {
  if (!env.VERCEL_PROJECT_ID || !env.VERCEL_TEAM_ID) throw new Error("Computer provider environment is unresolved.");
  return JSON.stringify({ provider: "vercel", team: env.VERCEL_TEAM_ID, project: env.VERCEL_PROJECT_ID,
    host: env.VERCEL ? "hosted" : "local", environment: env.VERCEL_ENV ?? "local",
    deployment: env.VERCEL_DEPLOYMENT_ID ?? env.VERCEL_URL ?? "local" });
}
export function resourceTags(row: ComputerResource) {
  return { application: "myeve-computer-v1", lifecycle: row.id, generation: String(row.generation),
    scope: createHash("sha256").update(`${row.owner_id}\n${row.environment}`).digest("hex") };
}
function resource(row: Record<string, unknown>): ComputerResource {
  return { ...row, generation: Number(row.generation), version: Number(row.version) } as ComputerResource;
}
const exact = `id=$1 AND owner_id=$2 AND computer_session_id=$3 AND environment=$4 AND resource_name=$5 AND generation=$6 AND version=$7`;
const args = (b: ResourceBinding) => [b.id,b.ownerId,b.sessionId,b.environment,b.resourceName,b.generation,b.version];
export class ComputerResourceStore {
  constructor(readonly database: ResourceDatabase = db() as ResourceDatabase) {}
  async establish(input: {ownerId: string; sessionId: string; runId: string; environment: string; provisionId: string; preparationId: string; snapshotId: string}) {
    const id = randomUUID();
    const rows = await this.database.query(`WITH session AS (
      SELECT s.* FROM computer_sessions s JOIN task_runs r ON r.id=s.run_id AND r.owner_id=s.owner_id AND r.agent_id=s.agent_id
      JOIN computer_template_preparations p ON p.id=$7 AND p.template_id=$8 AND p.state='READY'
      WHERE s.id=$2 AND s.owner_id=$1 AND s.run_id=$3 AND s.status='provisioning' AND s.expires_at>now()
        AND r.status IN ('running','awaiting_approval') AND (r.deadline_at IS NULL OR r.deadline_at>now()) FOR UPDATE OF s,p
    ), inserted AS (
      INSERT INTO computer_resource_lifecycles(id,owner_id,agent_id,run_id,computer_session_id,runtime_session_id,provider,environment,
        resource_name,generation,provision_id,preparation_id,source_snapshot_id)
      SELECT $4,s.owner_id,s.agent_id,s.run_id,s.id,s.runtime_session_id,'vercel',$5,'myeve-computer-' || $4,
        coalesce((SELECT max(generation)+1 FROM computer_resource_lifecycles WHERE computer_session_id=s.id),1),$6,$7,$8 FROM session s
      ON CONFLICT DO NOTHING RETURNING *
    ), reserved_template AS (
      UPDATE computer_template_preparations p SET updated_at=clock_timestamp() FROM inserted l WHERE p.id=l.preparation_id
    ), event AS (
      INSERT INTO eve_events(id,owner_id,type,source_type,source_id,summary,payload,idempotency_key)
      SELECT 'event_' || id,owner_id,'computer.resource.established','computer',id,'Computer ownership established',
        jsonb_build_object('lifecycleId',id,'sessionId',computer_session_id,'resource',resource_name,'generation',generation,'environment',environment),
        'computer-resource:' || id || ':established' FROM inserted
    ) SELECT * FROM inserted`,[input.ownerId,input.sessionId,input.runId,id,input.environment,input.provisionId,input.preparationId,input.snapshotId]);
    if (rows.length !== 1) throw new Error("Computer ownership could not be established.");
    return resource(rows[0]);
  }
  async current(ownerId: string, sessionId: string, environment: string) {
    const rows = await this.database.query(`SELECT * FROM computer_resource_lifecycles WHERE owner_id=$1 AND computer_session_id=$2 AND environment=$3
      AND generation=(SELECT max(generation) FROM computer_resource_lifecycles WHERE owner_id=$1 AND computer_session_id=$2 AND environment=$3) LIMIT 2`,[ownerId,sessionId,environment]);
    // Older cleanup tombstones must be recovered by ID, never guessed from a session pointer.
    if (rows.length !== 1) return null;
    return resource(rows[0]);
  }
  async exact(binding: ResourceBinding) {
    const rows = await this.database.query(`SELECT * FROM computer_resource_lifecycles WHERE ${exact}`,args(binding));
    return rows.length === 1 ? resource(rows[0]) : null;
  }
  async activate(row: ComputerResource, providerSessionId: string) {
    const rows = await this.database.query(`UPDATE computer_resource_lifecycles SET state='active',provider_session_id=$8,updated_at=now()
      WHERE ${exact} AND state='provisioning' AND provision_until>now()
        AND EXISTS(SELECT 1 FROM computer_sessions s JOIN computer_control_leases c ON c.computer_session_id=s.id
          WHERE s.id=computer_resource_lifecycles.computer_session_id AND s.owner_id=computer_resource_lifecycles.owner_id
          AND s.status='provisioning' AND s.expires_at>now() AND c.controller='AGENT') RETURNING *`,[...args(resourceBinding(row)),providerSessionId]);
    if (rows.length !== 1) throw new Error("Computer provisioning was fenced.");
    return resource(rows[0]);
  }
  async executable(row: ComputerResource) {
    return (await this.database.query(`SELECT l.id FROM computer_resource_lifecycles l JOIN computer_sessions s ON s.id=l.computer_session_id
      JOIN computer_control_leases c ON c.computer_session_id=s.id JOIN task_runs r ON r.id=l.run_id AND r.owner_id=l.owner_id
      JOIN agents a ON a.id=l.agent_id AND a.owner_id=l.owner_id
      WHERE l.id=$1 AND l.owner_id=$2 AND l.environment=$3 AND l.state='active' AND (s.sandbox_id=l.resource_name OR (s.sandbox_id IS NULL AND s.status='provisioning'))
        AND s.status IN ('provisioning','ready','running','paused') AND s.expires_at>now() AND c.controller<>'NONE'
        AND a.status='active' AND r.status IN ('running','awaiting_approval','waiting_for_owner','paused')
        AND (r.deadline_at IS NULL OR r.deadline_at>now())`,[row.id,row.owner_id,row.environment])).length === 1;
  }
  async claim(binding: ResourceBinding, initiator: "owner" | "agent" | "system", controlVersion?: number) {
    const token = randomUUID();
    const rows = await this.database.query(`WITH claimed AS (
      UPDATE computer_resource_lifecycles l SET state='cleanup_pending',verified_at=NULL,version=version+1,claim_token=$8,
        claimed_until=now()+interval '30 seconds',cleanup_attempts=cleanup_attempts+1,updated_at=now(),
        initiator=coalesce(initiator,$9),reason=coalesce(reason,CASE WHEN $9='owner' THEN 'owner_stop' WHEN $9='agent' THEN 'agent_stop' WHEN NOT EXISTS(SELECT 1 FROM computer_sessions s WHERE s.id=l.computer_session_id) THEN 'orphan_recovery'
          WHEN EXISTS(SELECT 1 FROM task_runs r WHERE r.id=l.run_id AND r.status='cancelled') THEN 'run_cancelled'
          WHEN EXISTS(SELECT 1 FROM task_runs r WHERE r.id=l.run_id AND r.status='completed') THEN 'run_completed'
          WHEN EXISTS(SELECT 1 FROM agents a WHERE a.id=l.agent_id AND a.owner_id=l.owner_id AND a.status<>'active') THEN 'security_revocation'
          WHEN EXISTS(SELECT 1 FROM computer_sessions s WHERE s.id=l.computer_session_id AND s.status IN ('failed','lost')) THEN 'session_failure'
          WHEN EXISTS(SELECT 1 FROM computer_sessions s WHERE s.id=l.computer_session_id AND s.expires_at<=now()) THEN 'session_expired'
          ELSE 'timeout_recovery' END)
      WHERE ${exact} AND (claimed_until IS NULL OR claimed_until<now()) AND (
        ($9 IN ('owner','agent') AND EXISTS(SELECT 1 FROM computer_sessions s JOIN computer_control_leases c ON c.computer_session_id=s.id
          WHERE s.id=l.computer_session_id AND s.owner_id=l.owner_id AND (s.sandbox_id=l.resource_name OR (s.sandbox_id IS NULL AND l.state='provisioning'))
            AND c.version=$10 AND ($9='owner' OR c.controller='AGENT')))
        OR ($9='system' AND (l.state IN ('cleanup_pending','cleaned') OR l.provision_until<now() AND l.state='provisioning'
          OR NOT EXISTS(SELECT 1 FROM computer_sessions s WHERE s.id=l.computer_session_id AND s.owner_id=l.owner_id
            AND s.status IN ('provisioning','ready','running','paused') AND s.expires_at>now())
          OR NOT EXISTS(SELECT 1 FROM task_runs r JOIN agents a ON a.id=r.agent_id AND a.owner_id=r.owner_id
            WHERE r.id=l.run_id AND r.owner_id=l.owner_id AND a.status='active'
              AND r.status IN ('running','awaiting_approval','waiting_for_owner','paused') AND (r.deadline_at IS NULL OR r.deadline_at>now())))))
      RETURNING l.*
    ), fence AS (
      UPDATE computer_control_leases c SET controller='NONE',version=c.version+1,owner_input_enabled=false,
        claimed_by=NULL,claimed_at=NULL,expires_at=NULL,transition_reason='Computer resource termination',updated_at=now()
      FROM claimed l WHERE c.computer_session_id=l.computer_session_id AND c.owner_id=l.owner_id
        AND NOT EXISTS(SELECT 1 FROM computer_resource_lifecycles newer WHERE newer.computer_session_id=l.computer_session_id
          AND newer.generation>l.generation AND newer.state IN ('provisioning','active')) RETURNING c.*
    ), control_receipt AS (
      INSERT INTO computer_control_receipts(id,computer_session_id,owner_id,agent_id,run_id,event_type,previous_controller,new_controller,control_version,requested_by,reason,metadata)
      SELECT 'control_resource_' || l.id || ':' || l.version,c.computer_session_id,c.owner_id,c.agent_id,c.run_id,
        'control.resource_stop',previous.controller,'NONE',c.version,
        CASE WHEN $9='owner' THEN l.owner_id WHEN $9='agent' THEN l.agent_id ELSE 'system' END,
        'Computer resource termination',jsonb_build_object('lifecycleId',l.id,'resource',l.resource_name,'generation',l.generation)
      FROM fence c JOIN claimed l ON l.computer_session_id=c.computer_session_id
      JOIN computer_control_leases previous ON previous.computer_session_id=c.computer_session_id
    ), invalidated AS (
      UPDATE task_approval_decisions p SET status='invalidated',decision_reason='Bound Computer resource terminated'
      WHERE p.status IN ('pending','approved') AND EXISTS(SELECT 1 FROM action_requests a JOIN claimed l
        ON l.owner_id=a.owner_id AND l.computer_session_id=a.computer_session_id
        WHERE a.approval_id=p.id AND (a.target->>'resource'=l.resource_name OR a.target->>'environment'=l.resource_name))
    ) SELECT * FROM claimed`,[...args(binding),token,initiator,controlVersion??null]);
    return rows.length === 1 ? resource(rows[0]) : null;
  }
  async validClaim(row: ComputerResource) {
    return (await this.database.query(`SELECT id FROM computer_resource_lifecycles WHERE ${exact}
      AND state='cleanup_pending' AND claim_token=$8 AND claimed_until>now()`,[...args(resourceBinding(row)),row.claim_token])).length === 1;
  }
  async recordSnapshot(row: ComputerResource, id: string) {
    const rows = await this.database.query(`UPDATE computer_resource_lifecycles SET owned_snapshot_ids=CASE WHEN owned_snapshot_ids ? $9 THEN owned_snapshot_ids ELSE owned_snapshot_ids || jsonb_build_array($9::text) END
      WHERE ${exact} AND claim_token=$8 AND claimed_until>now() RETURNING id`,[...args(resourceBinding(row)),row.claim_token,id]);
    if (!rows.length) throw new Error("Computer cleanup claim expired.");
    if (!row.owned_snapshot_ids.includes(id)) row.owned_snapshot_ids.push(id);
  }
  async finish(row: ComputerResource, success: boolean) {
    const rows=await this.database.query(`WITH finished AS (
      UPDATE computer_resource_lifecycles SET state=CASE WHEN $9 THEN 'cleaned' ELSE 'cleanup_pending' END,
        verified_at=CASE WHEN $9 THEN now() ELSE NULL END,claim_token=NULL,claimed_until=NULL,
        retry_after=now()+interval '5 minutes',failure_code=CASE WHEN $9 THEN NULL ELSE 'cleanup_unverified' END,updated_at=now()
      WHERE ${exact} AND claim_token=$8 AND claimed_until>now() RETURNING *
    ), session AS (
      UPDATE computer_sessions s SET status='stopped',failure_code=NULL,failure_summary=NULL,completed_at=coalesce(completed_at,now()) FROM finished l
      WHERE $9 AND s.id=l.computer_session_id AND s.owner_id=l.owner_id AND s.sandbox_id=l.resource_name RETURNING s.id
    ), drained AS (UPDATE computer_control_leases c SET owner_input_in_flight=0,gateway_actions_in_flight=0
      FROM session s WHERE c.computer_session_id=s.id AND c.controller='NONE'), browser AS (UPDATE browser_sessions SET status='stopped',completed_at=now() WHERE computer_session_id IN (SELECT id FROM session))
    SELECT id FROM finished`,[...args(resourceBinding(row)),row.claim_token,success]);
    return rows.length===1;
  }
  async event(row: ComputerResource, event: string, outcome = "completed") {
    await this.database.query(`INSERT INTO eve_events(id,owner_id,type,source_type,source_id,run_id,summary,payload,idempotency_key)
      VALUES($1,$2,$3,'computer',$4,$5,$3,$6::jsonb,$7) ON CONFLICT DO NOTHING`,[randomUUID(),row.owner_id,`computer.resource.${event}`,row.id,row.run_id,
      JSON.stringify({ lifecycleId:row.id,owner:row.owner_id,environment:row.environment,sessionId:row.computer_session_id,resource:row.resource_name,
        generation:row.generation,reason:row.reason,initiator:row.initiator,classification:"OWNED_RESOURCE_LIFECYCLE",decision:"ALLOW",outcome }),
      `computer-resource:${row.id}:${event}:${event.includes("failed") || event.includes("recovery") ? row.version : "once"}`]);
  }
  async recoverable(environment: string) {
    return (await this.database.query(`SELECT l.* FROM computer_resource_lifecycles l WHERE environment=$1 AND retry_after<=now()
      AND (claimed_until IS NULL OR claimed_until<now()) AND (state<>'cleaned' OR created_at>now()-interval '24 hours')
      AND (l.state IN ('cleanup_pending','cleaned') OR (l.state='provisioning' AND l.provision_until<now())
        OR NOT EXISTS(SELECT 1 FROM computer_sessions s WHERE s.id=l.computer_session_id AND s.owner_id=l.owner_id
          AND s.status IN ('provisioning','ready','running','paused') AND s.expires_at>now())
        OR NOT EXISTS(SELECT 1 FROM task_runs r JOIN agents a ON a.id=r.agent_id AND a.owner_id=r.owner_id
          WHERE r.id=l.run_id AND r.owner_id=l.owner_id AND a.status='active'
          AND r.status IN ('running','awaiting_approval','waiting_for_owner','paused') AND (r.deadline_at IS NULL OR r.deadline_at>now())))
      ORDER BY retry_after,id LIMIT 20`,[environment])).map(resource);
  }
}
