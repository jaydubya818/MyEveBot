import { db } from "../agent/lib/receipts-db.ts";
import type { ExecutionDatabase } from "./execution-types.ts";

export interface ResultDelivery {
  id: string; ownerId: string; runId: string; resultReference: string;
  channel: "in_app" | "push" | "telegram"; attempt: number; version: number;
}
export interface NotificationProvider {
  deliver(delivery: ResultDelivery): Promise<
    | { status: "delivered" }
    | { status: "definitely_failed"; retryable: boolean }
    | { status: "unknown" }
  >;
}

/** Uses the existing Phase 3 outbox and attempts; has no agent/runtime dependency. */
export class ExecutionDelivery {
  constructor(private database: ExecutionDatabase = db() as ExecutionDatabase) {}

  async deliverNext(ownerId: string, provider: NotificationProvider): Promise<boolean> {
    await this.database.query(`WITH expired AS (
      UPDATE review_deliveries SET status='failed',result_unknown=true,claimed_until=NULL,next_attempt_at=NULL,
        failure_category='unknown',failure_code='delivery_interrupted',failure_summary='Notification result needs verification',updated_at=now()
      WHERE owner_id=$1 AND occurrence_id IS NOT NULL AND status='delivering' AND claimed_until<=now() RETURNING *
    ) UPDATE review_delivery_attempts a SET status='failed',failure_category='unknown',failure_code='delivery_interrupted',finished_at=now()
      FROM expired e WHERE a.delivery_id=e.id AND a.attempt_number=e.attempt_count`,[ownerId]);
    const rows = await this.database.query(`WITH candidate AS MATERIALIZED (
      SELECT id FROM review_deliveries WHERE owner_id=$1 AND occurrence_id IS NOT NULL
        AND NOT result_unknown AND attempt_count<3
        AND (status='scheduled' OR (status='failed' AND next_attempt_at IS NOT NULL))
        AND coalesce(next_attempt_at,scheduled_for)<=now()
      ORDER BY scheduled_for,id FOR UPDATE SKIP LOCKED LIMIT 1
    ), claimed AS (
      UPDATE review_deliveries d SET status='delivering',attempt_count=attempt_count+1,claim_version=claim_version+1,
        claimed_until=now()+interval '1 minute',attempted_at=now(),updated_at=now()
      FROM candidate c WHERE d.id=c.id RETURNING d.*
    ), attempt AS (
      INSERT INTO review_delivery_attempts(delivery_id,attempt_number,status) SELECT id,attempt_count,'delivering' FROM claimed
    ) SELECT * FROM claimed`,[ownerId]);
    const row = rows[0];
    if (!row) return false;
    const delivery: ResultDelivery = { id:String(row.id),ownerId,runId:String(row.run_id),resultReference:String(row.result_reference),
      channel:row.channel as ResultDelivery["channel"],attempt:Number(row.attempt_count),version:Number(row.claim_version) };
    let result: Awaited<ReturnType<NotificationProvider["deliver"]>>;
    try { result = await provider.deliver(delivery); }
    catch { result = { status:"unknown" }; }
    const status = result.status === "delivered" ? "delivered" : "failed";
    const retry = result.status === "definitely_failed" && result.retryable && delivery.attempt < 3;
    await this.database.query(`WITH finished AS (
      UPDATE review_deliveries SET status=$4,result_unknown=$5,claimed_until=NULL,updated_at=now(),
        delivered_at=CASE WHEN $4='delivered' THEN now() ELSE NULL END,
        next_attempt_at=CASE WHEN $6 THEN now()+($7*interval '1 second') ELSE NULL END,
        failure_category=CASE WHEN $4='delivered' THEN NULL WHEN $5 THEN 'unknown' ELSE 'transient' END,
        failure_summary=CASE WHEN $4='delivered' THEN NULL WHEN $5 THEN 'Notification result needs verification' ELSE 'Notification failed; work completed' END
      WHERE owner_id=$1 AND id=$2 AND claim_version=$3 AND status='delivering' AND claimed_until>now() RETURNING *
    ) UPDATE review_delivery_attempts a SET status=$4,finished_at=now(),failure_category=f.failure_category,failure_summary=f.failure_summary
      FROM finished f WHERE a.delivery_id=f.id AND a.attempt_number=f.attempt_count`,
    [ownerId,delivery.id,delivery.version,status,result.status === "unknown",retry,delivery.attempt===1?60:300]);
    return true;
  }
}
