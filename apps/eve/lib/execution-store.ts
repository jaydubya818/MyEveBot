import { db } from "../agent/lib/receipts-db.ts";
import { LostExecutionClaim, occurrenceIdentity, retryDecision, routineConfigurationSchema,
  type ExecutionClaim, type ExecutionDatabase, type FailureCategory, type RoutineConfiguration } from "./execution-types.ts";

export class ExecutionStore {
  constructor(private database: ExecutionDatabase = db() as ExecutionDatabase) {}

  async pauseRoutine(ownerId: string, routineId: string): Promise<void> {
    await this.database.query(`UPDATE execution_routines SET status='paused',paused_at=now(),updated_at=now()
      WHERE owner_id=$1 AND id=$2 AND status='active'`,[ownerId,routineId]);
  }

  /** Call only after owner authentication and capability/dependency preflight. */
  async resumeRoutine(ownerId: string, routineId: string, expectedVersion: number): Promise<void> {
    const rows = await this.database.query(`WITH resumed AS (
      UPDATE execution_routines SET status='active',paused_at=NULL,consecutive_failures=0,updated_at=now()
      WHERE owner_id=$1 AND id=$2 AND version=$3 AND status IN ('paused','auto_paused') RETURNING *
    ), skipped AS (
      UPDATE execution_occurrences o SET status='cancelled',updated_at=now()
      FROM resumed r WHERE o.owner_id=r.owner_id AND o.routine_id=r.id AND o.status IN ('pending','retrying')
        AND o.scheduled_for<now() RETURNING o.*
    ), runs AS (
      UPDATE task_runs t SET status='cancelled',cancelled_at=now(),status_reason='Missed occurrence skipped on owner resume',updated_at=now()
      FROM skipped s WHERE t.owner_id=s.owner_id AND t.id=s.run_id
    ) SELECT id FROM resumed`,[ownerId,routineId,expectedVersion]);
    if (!rows[0]) throw new Error("Routine changed or is not paused.");
  }

  async createRoutine(input: { ownerId: string; id: string; sourceKind: string; sourceId: string;
    name: string; agentId: string; configuration: RoutineConfiguration; changedBy: string }) {
    const configuration = routineConfigurationSchema.parse(input.configuration);
    // Authority-bearing creation belongs behind an authenticated owner route.
    return this.database.query(`WITH routine AS (
      INSERT INTO execution_routines(id,owner_id,source_kind,source_id,name,agent_id,configuration)
      VALUES($1,$2,$3,$4,$5,$6,$7::jsonb) RETURNING *
    ), revision AS (
      INSERT INTO execution_routine_versions(owner_id,routine_id,version,configuration,changed_by)
      SELECT owner_id,id,version,configuration,$8 FROM routine
    ) SELECT * FROM routine`, [input.id,input.ownerId,input.sourceKind,input.sourceId,input.name,input.agentId,JSON.stringify(configuration),input.changedBy]);
  }

  async enqueue(input: { ownerId: string; routineId: string; key: string; scheduledFor: string }): Promise<string | null> {
    const id = occurrenceIdentity(input.ownerId,input.routineId,input.key);
    if (!Number.isFinite(Date.parse(input.scheduledFor))) throw new Error("Invalid scheduled instant.");
    // Lock the routine before creating the run and occurrence together. Replayed
    // ticks find the same key even after completion; revisions do not change it.
    const rows = await this.database.query(`WITH routine AS MATERIALIZED (
      SELECT r.* FROM execution_routines r WHERE owner_id=$1 AND id=$2 AND status='active' FOR UPDATE
    ), new_run AS (
      INSERT INTO task_runs(id,owner_id,kind,title,agent_id,status,target,max_duration_seconds,max_specialists,
        max_model_steps,max_retries_per_specialist,max_estimated_cost_usd,objective,expected_output)
      SELECT $3||'_run',owner_id,'delegated_work',name,agent_id,'queued','{}'::jsonb,
        (configuration->'limits'->>'maxRuntimeSeconds')::int,0,(configuration->'limits'->>'maxSteps')::int,0,
        (configuration->'limits'->>'maxCostUsd')::numeric,configuration->>'instructions','Routine result'
      FROM routine ON CONFLICT(id) DO NOTHING RETURNING id
    ), occurrence AS (
      INSERT INTO execution_occurrences(id,owner_id,routine_id,routine_version,occurrence_key,scheduled_for,run_id)
      SELECT $3,owner_id,id,version,$4,$5::timestamptz,$3||'_run' FROM routine
      WHERE EXISTS(SELECT 1 FROM new_run) ON CONFLICT(owner_id,routine_id,occurrence_key) DO NOTHING RETURNING id
    ) SELECT id FROM occurrence UNION ALL
      SELECT id FROM execution_occurrences WHERE owner_id=$1 AND routine_id=$2 AND occurrence_key=$4 LIMIT 1`,
    [input.ownerId,input.routineId,id,input.key,input.scheduledFor]);
    return rows[0] ? String(rows[0].id) : null;
  }

  async claim(ownerId: string, workerId: string, leaseSeconds = 60): Promise<ExecutionClaim | null> {
    if (!workerId || !Number.isInteger(leaseSeconds) || leaseSeconds < 1 || leaseSeconds > 300) throw new Error("Invalid worker lease.");
    const rows = await this.database.query(`WITH candidate AS MATERIALIZED (
      SELECT o.id FROM execution_occurrences o JOIN execution_routines r ON r.owner_id=o.owner_id AND r.id=o.routine_id
      WHERE o.owner_id=$1 AND o.status IN ('pending','retrying') AND o.next_attempt_at<=now()
        AND o.scheduled_for<=now() AND r.status='active'
        AND NOT EXISTS(SELECT 1 FROM action_requests a WHERE a.owner_id=o.owner_id AND a.run_id=o.run_id
          AND a.action_class<>'read' AND a.status IN ('executing','verifying','completed','result_unknown'))
      ORDER BY o.scheduled_for,o.id FOR UPDATE OF o SKIP LOCKED LIMIT 1
    ), claimed AS (
      UPDATE execution_occurrences o SET status='running',claimed_by=$2,claimed_at=now(),heartbeat_at=now(),
        lease_expires_at=now()+($3*interval '1 second'),claim_version=claim_version+1,attempt_count=attempt_count+1,updated_at=now()
      FROM candidate c WHERE o.id=c.id RETURNING o.*
    ), attempt AS (
      INSERT INTO execution_attempts(owner_id,occurrence_id,attempt_number,claim_version,worker_id,status)
      SELECT owner_id,id,attempt_count,claim_version,claimed_by,'running' FROM claimed
    ), run AS (
      UPDATE task_runs r SET status='running',started_at=coalesce(started_at,now()),
        deadline_at=coalesce(deadline_at,now()+(max_duration_seconds*interval '1 second')),updated_at=now()
      FROM claimed c WHERE r.owner_id=c.owner_id AND r.id=c.run_id
    ) SELECT c.*,v.configuration FROM claimed c JOIN execution_routine_versions v
      ON v.owner_id=c.owner_id AND v.routine_id=c.routine_id AND v.version=c.routine_version`, [ownerId,workerId,leaseSeconds]);
    const row = rows[0];
    return row ? { ownerId, workerId, occurrenceId:String(row.id),routineId:String(row.routine_id),runId:String(row.run_id),
      version:Number(row.claim_version),attempt:Number(row.attempt_count),configuration:routineConfigurationSchema.parse(row.configuration) } : null;
  }

  async heartbeat(claim: ExecutionClaim, leaseSeconds = 60): Promise<void> {
    if (!Number.isInteger(leaseSeconds) || leaseSeconds < 1 || leaseSeconds > 300) throw new Error("Invalid lease duration.");
    const rows = await this.database.query(`UPDATE execution_occurrences SET heartbeat_at=now(),lease_expires_at=now()+($5*interval '1 second')
      WHERE owner_id=$1 AND id=$2 AND claim_version=$3 AND claimed_by=$4 AND status='running' AND lease_expires_at>now() RETURNING id`,
    [claim.ownerId,claim.occurrenceId,claim.version,claim.workerId,leaseSeconds]);
    if (!rows[0]) throw new LostExecutionClaim();
  }

  async complete(claim: ExecutionClaim, resultReference: string): Promise<void> {
    if (!resultReference) throw new Error("A persisted result is required before completion.");
    const rows = await this.database.query(`WITH completed AS (
      UPDATE execution_occurrences o SET status='completed',completed_at=now(),claimed_by=NULL,lease_expires_at=NULL,updated_at=now()
      WHERE owner_id=$1 AND id=$2 AND claim_version=$3 AND claimed_by=$4 AND status='running' AND lease_expires_at>now()
        AND NOT EXISTS(SELECT 1 FROM action_requests a WHERE a.owner_id=o.owner_id AND a.run_id=o.run_id
          AND a.status NOT IN ('completed','cancelled','denied')) RETURNING *
    ), attempt AS (
      UPDATE execution_attempts a SET status='completed',finished_at=now() FROM completed c
      WHERE a.owner_id=c.owner_id AND a.occurrence_id=c.id AND a.attempt_number=c.attempt_count
    ), run AS (
      UPDATE task_runs r SET status='completed',completed_at=now(),updated_at=now(),result_summary='Routine result available'
      FROM completed c WHERE r.owner_id=c.owner_id AND r.id=c.run_id
    ), routine AS (
      UPDATE execution_routines r SET consecutive_failures=0,last_success_at=now(),last_failure=NULL,updated_at=now()
      FROM completed c WHERE r.owner_id=c.owner_id AND r.id=c.routine_id
    ), delivery AS (
      INSERT INTO review_deliveries(id,owner_id,local_period_key,scheduled_for,requested_channel,channel,deduplication_key,
        occurrence_id,run_id,result_reference)
      SELECT c.id||'_delivery',c.owner_id,c.occurrence_key,c.scheduled_for,$6,$6,c.id||':result',$2,c.run_id,$5 FROM completed c
      ON CONFLICT(deduplication_key) DO NOTHING
    ) SELECT id FROM completed`, [claim.ownerId,claim.occurrenceId,claim.version,claim.workerId,resultReference,claim.configuration.deliveryChannel]);
    if (!rows[0]) throw new LostExecutionClaim();
  }

  async fail(claim: ExecutionClaim, category: FailureCategory): Promise<void> {
    const actions = await this.database.query(`SELECT status FROM action_requests WHERE owner_id=$1 AND run_id=$2 AND action_class<>'read'`, [claim.ownerId,claim.runId]);
    const uncertain = actions.some(a => !["failed","denied","cancelled","planned","awaiting_approval","authorized"].includes(String(a.status)));
    const decision = retryDecision({ category,attempt:claim.attempt,policy:claim.configuration.retry,consequentialOutcome:uncertain?"unknown":"none" });
    const status = decision.eligibility === "retry" ? "retrying" : decision.eligibility === "wait" ? "waiting" : decision.eligibility === "recovery_required" ? "recovery_required" : "failed";
    const rows = await this.database.query(`WITH finished AS (
      UPDATE execution_occurrences SET status=$5,failure_category=$6,next_attempt_at=now()+($7*interval '1 second'),
        claimed_by=NULL,lease_expires_at=NULL,updated_at=now()
      WHERE owner_id=$1 AND id=$2 AND claim_version=$3 AND claimed_by=$4 AND status='running' AND lease_expires_at>now() RETURNING *
    ), attempt AS (
      UPDATE execution_attempts a SET status=CASE WHEN $5='waiting' THEN 'waiting' ELSE 'failed' END,
        failure_category=$6,retry_decision=$8,finished_at=now() FROM finished f
      WHERE a.owner_id=f.owner_id AND a.occurrence_id=f.id AND a.attempt_number=f.attempt_count
    ), run AS (
      UPDATE task_runs r SET status=CASE WHEN $5='failed' THEN 'failed' ELSE 'paused' END,
        status_reason=CASE WHEN $5='recovery_required' THEN 'Result needs verification' WHEN $5='retrying' THEN 'Waiting for a safe retry' ELSE 'Execution needs attention' END,updated_at=now()
      FROM finished f WHERE r.owner_id=f.owner_id AND r.id=f.run_id
    ), routine AS (
      UPDATE execution_routines r SET consecutive_failures=consecutive_failures+1,last_failure=$6,
        status=CASE WHEN consecutive_failures+1>=failure_threshold THEN 'auto_paused' ELSE r.status END,
        pause_sequence=pause_sequence+CASE WHEN consecutive_failures+1>=failure_threshold THEN 1 ELSE 0 END,
        paused_at=CASE WHEN consecutive_failures+1>=failure_threshold THEN now() ELSE paused_at END,updated_at=now()
      FROM finished f WHERE r.owner_id=f.owner_id AND r.id=f.routine_id AND f.status='failed' RETURNING r.*
    ), notification AS (
      INSERT INTO eve_events(id,owner_id,type,source_type,source_id,summary,payload,delivery_classification)
      SELECT id||'_pause_'||pause_sequence,owner_id,'ROUTINE_AUTO_PAUSED','routine',id,'Routine paused after repeated failures',
        jsonb_build_object('href','/control','failureCategory',$6),'activity' FROM routine WHERE status='auto_paused'
      ON CONFLICT(id) DO NOTHING
    ) SELECT id FROM finished`, [claim.ownerId,claim.occurrenceId,claim.version,claim.workerId,status,category,decision.delaySeconds??0,decision.eligibility]);
    if (!rows[0]) throw new LostExecutionClaim();
  }

  async recoverExpired(ownerId: string): Promise<number> {
    // Never restart an interrupted agent automatically. Even a read-looking run
    // may have crossed an adapter boundary before persisting its result.
    const rows = await this.database.query(`WITH expired AS (
      UPDATE execution_occurrences o SET status='recovery_required',claimed_by=NULL,lease_expires_at=NULL,
        claim_version=claim_version+1,updated_at=now() WHERE owner_id=$1 AND (
          (status='running' AND lease_expires_at<=now()) OR
          (status='retrying' AND EXISTS(SELECT 1 FROM action_requests a WHERE a.owner_id=o.owner_id AND a.run_id=o.run_id
            AND a.action_class<>'read' AND a.status IN ('executing','verifying','completed','result_unknown')))
        ) RETURNING *
    ), attempts AS (
      UPDATE execution_attempts a SET status='interrupted',finished_at=now(),retry_decision='recovery_required'
      FROM expired e WHERE a.owner_id=e.owner_id AND a.occurrence_id=e.id AND a.attempt_number=e.attempt_count
    ), actions AS (
      UPDATE action_requests a SET status='result_unknown',updated_at=now() FROM expired e
      WHERE a.owner_id=e.owner_id AND a.run_id=e.run_id AND a.status IN ('executing','verifying')
    ), runs AS (
      UPDATE task_runs r SET status='paused',status_reason='Worker stopped; verify results before resuming',updated_at=now()
      FROM expired e WHERE r.owner_id=e.owner_id AND r.id=e.run_id
    ) SELECT id FROM expired`, [ownerId]);
    return rows.length;
  }
}
