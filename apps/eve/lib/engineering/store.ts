import { assertBusinessEffect } from "../business-effects.ts";
import { createHash, randomUUID } from "node:crypto";
import { db } from "../../agent/lib/receipts-db.ts";
import {
  createWorkSchema,
  nextWorkState,
  workCommandSchema,
  WorkError,
  type Work,
  type WorkEvent,
  type WorkPrincipal,
  type CriteriaRevision,
} from "./types.ts";

export interface WorkDatabase {
  query(sql: string, params?: unknown[]): Promise<Record<string, any>[]>;
}
const projection = `w.*,c.items AS criteria FROM engineering_work w JOIN engineering_work_criteria c
  ON c.scope_id=w.scope_id AND c.scope_kind=w.scope_kind AND c.work_id=w.id AND c.version=w.criteria_version`;
const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v));
function work(row: Record<string, any>): Work {
  return {
    id: row.id,
    scopeId: row.scope_id,
    title: row.title,
    objective: row.objective,
    repository: row.repository,
    lifecycle: row.lifecycle,
    control: row.control,
    version: Number(row.version),
    generation: Number(row.generation),
    criteriaVersion: Number(row.criteria_version),
    criteria: row.criteria,
    maxCostUsd: Number(row.max_cost_usd),
    maxDurationSeconds: Number(row.max_duration_seconds),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

/** Only server-verified principals enter this service; actor and data-owner scope are separate. */
export class WorkStore {
  constructor(
    readonly principal: WorkPrincipal,
    readonly database: WorkDatabase = db(),
  ) {}
  private scope() {
    return [this.principal.scopeId, this.principal.scopeKind];
  }
  async list() {
    return (
      await this.database.query(
        `SELECT ${projection} WHERE w.scope_id=$1 AND w.scope_kind=$2 ORDER BY w.updated_at DESC,w.id LIMIT 100`,
        this.scope(),
      )
    ).map(work);
  }
  async get(id: string) {
    const [row] = await this.database.query(
      `SELECT ${projection} WHERE w.scope_id=$1 AND w.scope_kind=$2 AND w.id=$3`,
      [...this.scope(), id],
    );
    if (!row)
      throw new WorkError(
        "work_not_found",
        "Work was not found in this workspace.",
        404,
      );
    return work(row);
  }
  async events(id: string): Promise<WorkEvent[]> {
    await this.get(id);
    return (
      await this.database.query(
        `SELECT id,kind,actor_id,version,created_at FROM engineering_work_events
      WHERE scope_id=$1 AND scope_kind=$2 AND work_id=$3 ORDER BY version DESC LIMIT 100`,
        [...this.scope(), id],
      )
    ).map((r) => ({
      id: r.id,
      kind: r.kind,
      actorId: r.actor_id,
      version: Number(r.version),
      createdAt: iso(r.created_at),
    }));
  }
  async criteriaHistory(id: string): Promise<CriteriaRevision[]> {
    await this.get(id);
    const rows = await this.database.query(
      `SELECT version,items,created_at FROM engineering_work_criteria
       WHERE scope_id=$1 AND scope_kind=$2 AND work_id=$3 ORDER BY version DESC LIMIT 100`,
      [...this.scope(), id],
    );
    return rows.map((row) => ({
      version: Number(row.version),
      criteria: row.items,
      createdAt: iso(row.created_at),
    }));
  }
  async create(value: unknown) {
    const input = createWorkSchema.parse(value);
    const hash = createHash("sha256")
      .update(JSON.stringify(input))
      .digest("hex");
    // One statement commits intent, immutable criteria and history together.
    const rows = await this.database.query(
      `WITH inserted AS (
      INSERT INTO engineering_work(id,scope_id,scope_kind,created_by,title,objective,repository,max_cost_usd,max_duration_seconds,idempotency_key,request_hash)
      VALUES($3,$1,$2,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(scope_id,scope_kind,idempotency_key) DO NOTHING RETURNING *
    ), criteria AS (
      INSERT INTO engineering_work_criteria(scope_id,scope_kind,work_id,version,items,created_by)
      SELECT scope_id,scope_kind,id,1,$12::jsonb,$4 FROM inserted RETURNING work_id
    ), event AS (
      INSERT INTO engineering_work_events(id,scope_id,scope_kind,work_id,version,actor_id,kind)
      SELECT $13,scope_id,scope_kind,id,1,$4,'created' FROM inserted RETURNING work_id
    ) SELECT id FROM inserted`,
      [
        ...this.scope(),
        randomUUID(),
        this.principal.actorId,
        input.title,
        input.objective,
        input.repository,
        input.maxCostUsd,
        input.maxDurationSeconds,
        input.idempotencyKey,
        hash,
        JSON.stringify(input.criteria),
        randomUUID(),
      ],
    );
    // Fresh statement sees a concurrent winner after ON CONFLICT waits.
    const [stored] = await this.database.query(
      `SELECT id,request_hash FROM engineering_work WHERE scope_id=$1 AND scope_kind=$2 AND idempotency_key=$3`,
      [...this.scope(), input.idempotencyKey],
    );
    if (!stored || stored.request_hash !== hash)
      throw new WorkError(
        "idempotency_conflict",
        "This request identifier already belongs to different Work. Review before creating a new request.",
      );
    return { work: await this.get(stored.id), created: rows.length === 1 };
  }
  async change(id: string, value: unknown) {
    const input = workCommandSchema.parse(value);
    const current = await this.get(id);
    if (current.version !== input.expectedVersion)
      throw new WorkError(
        "work_changed",
        "This Work changed in another session. Reload before saving.",
      );
    await assertBusinessEffect(this,id,input);
    const state = nextWorkState(current, input);
    const revise = input.operation === "revise";
    const rows = await this.database.query(
      `WITH changed AS (
      UPDATE engineering_work SET lifecycle=$5,control=$6,version=version+1,generation=generation+1,
        criteria_version=criteria_version+CASE WHEN $7 THEN 1 ELSE 0 END,updated_at=now()
      WHERE scope_id=$1 AND scope_kind=$2 AND id=$3 AND version=$4
        AND NOT EXISTS(SELECT 1 FROM engineering_execution e WHERE e.scope_id=$1 AND e.scope_kind=$2 AND e.work_id=$3
          AND EXISTS(SELECT 1 FROM jsonb_array_elements(e.state->'effects') effect WHERE effect->>'status' IN ('PREPARED','UNKNOWN')))
      RETURNING *
    ), criteria AS (
      INSERT INTO engineering_work_criteria(scope_id,scope_kind,work_id,version,items,created_by)
      SELECT scope_id,scope_kind,id,criteria_version,$8::jsonb,$9 FROM changed WHERE $7 RETURNING work_id
    ), event AS (
      INSERT INTO engineering_work_events(id,scope_id,scope_kind,work_id,version,actor_id,kind)
      SELECT $10,scope_id,scope_kind,id,version,$9,$11 FROM changed RETURNING work_id
    ) SELECT id FROM changed`,
      [
        ...this.scope(),
        id,
        input.expectedVersion,
        state.lifecycle,
        state.control,
        revise,
        JSON.stringify(revise ? input.criteria : []),
        this.principal.actorId,
        randomUUID(),
        input.operation,
      ],
    );
    if (!rows.length)
      throw new WorkError(
        "work_changed",
        "This Work changed in another session. Reload before saving.",
      );
    return this.get(id);
  }
}
