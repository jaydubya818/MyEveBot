import { randomUUID } from "node:crypto";
import { db } from "../agent/lib/receipts-db.ts";
import type { Preparation, TemplateFailure, TemplateKey, TemplateStore } from "./computer-template-lifecycle.ts";
type Database = { query: (sql: string, params?: unknown[]) => Promise<Record<string, unknown>[]> };
function preparation(row: Record<string, unknown>): Preparation {
  return { id: String(row.id), scope: String(row.scope), fingerprint: String(row.fingerprint), provider: String(row.provider),
    state: row.state as Preparation["state"], deadline: new Date(row.deadline as string).getTime(), templateId: row.template_id == null ? null : String(row.template_id),
    failure: row.failure_code as TemplateFailure | null, retryAfter: new Date(row.retry_after as string).getTime() };
}
export class SqlComputerTemplateStore implements TemplateStore {
  constructor(private database: Database = db() as Database) {}
  async cleanupFailures(scope: string) {
    const rows = await this.database.query(`SELECT count(*) AS count FROM computer_template_preparations
      WHERE scope=$1 AND cleanup_failed`, [scope]);
    return Number(rows[0]?.count ?? 0);
  }
  async metrics(scope: string) {
    const rows = await this.database.query(`SELECT
      count(*) FILTER(WHERE e.event='template.prepare.started') AS preparations,
      count(*) FILTER(WHERE e.event='template.resolve.cold') AS cold_starts,
      count(*) FILTER(WHERE e.event='template.resolve.warm') AS warm_hits,
      count(*) FILTER(WHERE e.event='template.prepare.failed') AS failures,
      count(*) FILTER(WHERE e.event='template.cleanup.failed') AS cleanup_failures,
      count(*) FILTER(WHERE e.event='template.orphan.recovered') AS recovered,
      avg(e.duration_ms) FILTER(WHERE e.event='template.prepare.ready') AS preparation_ms
      FROM computer_template_events e JOIN computer_template_preparations p ON p.id=e.preparation_id
      WHERE p.scope=$1 AND e.created_at>=now()-interval '24 hours'`, [scope]);
    const row = rows[0] ?? {};
    return { preparations: Number(row.preparations ?? 0), coldStarts: Number(row.cold_starts ?? 0), warmHits: Number(row.warm_hits ?? 0),
      failures: Number(row.failures ?? 0), cleanupFailures: Number(row.cleanup_failures ?? 0), recovered: Number(row.recovered ?? 0),
      preparationMs: row.preparation_ms == null ? null : Number(row.preparation_ms) };
  }
  async current(key: TemplateKey) {
    const rows = await this.database.query(`SELECT * FROM computer_template_preparations WHERE scope=$1 AND fingerprint=$2
      ORDER BY (state IN ('PREPARING','READY','CLEANING')) DESC,created_at DESC,id DESC LIMIT 1`, [key.scope,key.fingerprint]);
    return rows[0] ? preparation(rows[0]) : null;
  }
  async claim(key: TemplateKey, deadline: number) {
    const rows = await this.database.query(`INSERT INTO computer_template_preparations(id,scope,fingerprint,provider,state,deadline)
      SELECT $1,$2,$3,$4,'PREPARING',$5 WHERE NOT EXISTS(SELECT 1 FROM computer_template_preparations WHERE scope=$2 AND fingerprint=$3 AND (retry_after>now() OR cleanup_failed))
      ON CONFLICT DO NOTHING RETURNING *`, [randomUUID(),key.scope,key.fingerprint,key.provider,new Date(deadline).toISOString()]);
    return rows[0] ? preparation(rows[0]) : null;
  }
  async ready(id: string, templateId: string, costUsd?: number) {
    return (await this.database.query(`UPDATE computer_template_preparations SET state='READY',template_id=$2,cost_usd=$3,updated_at=now()
      WHERE id=$1 AND state='PREPARING' AND deadline>clock_timestamp()
        AND EXISTS(SELECT 1 FROM computer_template_waiters w WHERE w.scope=computer_template_preparations.scope
          AND w.fingerprint=computer_template_preparations.fingerprint AND w.expires_at>now()) RETURNING id`, [id,templateId,costUsd ?? null])).length === 1;
  }
  async cleaning(id: string, failure: TemplateFailure) {
    // A concurrent canonical resource reservation changes this version while holding
    // the preparation row lock. Retirement must retry with a fresh dependency view.
    const observed=await this.database.query('SELECT updated_at::text AS version FROM computer_template_preparations WHERE id=$1',[id]);
    if (!observed[0]) return null;
    const token = randomUUID();
    const rows = await this.database.query(`UPDATE computer_template_preparations
      SET state=CASE WHEN state='CLEANED' THEN state ELSE 'CLEANING' END,failure_code=$2,cleanup_token=$3,
        deadline=now()+interval '15 seconds',cleanup_attempts=cleanup_attempts+1,updated_at=now()
      WHERE id=$1 AND updated_at=$4::timestamptz AND NOT EXISTS(SELECT 1 FROM computer_resource_lifecycles l WHERE l.preparation_id=computer_template_preparations.id AND l.state<>'cleaned')
        AND (state<>'READY' OR NOT EXISTS(SELECT 1 FROM computer_template_waiters w WHERE w.scope=computer_template_preparations.scope AND w.fingerprint=computer_template_preparations.fingerprint AND w.expires_at>now()))
        AND (state IN ('PREPARING','FAILED') OR (state='READY' AND $2='invalid_template')
        OR (state='CLEANING' AND deadline<=now())
        OR (state='CLEANED' AND (cleanup_token IS NULL OR deadline<=now()))) RETURNING id`, [id,failure,token,observed[0].version]);
    return rows.length === 1 ? token : null;
  }
  async cleaned(id: string, token: string, success: boolean, retryAfter: number) {
    await this.database.query(`UPDATE computer_template_preparations
      SET state=CASE WHEN state='CLEANED' THEN state ELSE $2 END,
        retry_after=CASE WHEN state='CLEANED' THEN retry_after ELSE $3::timestamptz END,
        cleanup_token=NULL,cleanup_failed=$5,deadline=now()+interval '5 minutes',updated_at=now()
      WHERE id=$1 AND cleanup_token=$4`, [id,success ? 'CLEANED' : 'CLEANING',new Date(retryAfter).toISOString(),token,!success]);
  }
  async identifySnapshot(id: string, token: string, templateId: string) {
    await this.database.query('UPDATE computer_template_preparations SET template_id=$3 WHERE id=$1 AND cleanup_token=$2', [id,token,templateId]);
  }
  async enter(key: TemplateKey, waiterId: string, expiresAt: number) {
    await this.database.query('INSERT INTO computer_template_waiters(id,scope,fingerprint,expires_at) VALUES($1,$2,$3,$4)',[waiterId,key.scope,key.fingerprint,new Date(expiresAt).toISOString()]);
  }
  async leave(waiterId: string) { await this.database.query('DELETE FROM computer_template_waiters WHERE id=$1',[waiterId]); }
  async hasWaiters(key: TemplateKey) {
    return (await this.database.query('SELECT id FROM computer_template_waiters WHERE scope=$1 AND fingerprint=$2 AND expires_at>now() LIMIT 1',[key.scope,key.fingerprint])).length>0;
  }
  async recoverable(scope: string, limit: number) {
    await this.database.query('DELETE FROM computer_template_waiters WHERE scope=$1 AND expires_at<=now()',[scope]);
    // Retain short-lived tombstones to catch provider creates that settled after a crashed caller timed out.
    const rows=await this.database.query(`SELECT * FROM computer_template_preparations WHERE scope=$1
      AND (state IN ('PREPARING','CLEANING') OR (state='CLEANED' AND (recovery_until>now() OR cleanup_failed)))
      AND deadline<=now() ORDER BY deadline LIMIT $2`,[scope,limit]);
    return rows.map(preparation);
  }
  async event(id: string, event: string, failure?: TemplateFailure, durationMs?: number) {
    await this.database.query('INSERT INTO computer_template_events(preparation_id,event,failure_code,duration_ms) VALUES($1,$2,$3,$4)',[id,event,failure??null,durationMs??null]);
  }
}
