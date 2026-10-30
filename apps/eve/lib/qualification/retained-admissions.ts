import { prepareAuthenticatedLocalFactoryInputV4 } from "../engineering/factory-authenticated-result.ts";
import { canonical } from "../engineering/factory-producer-protocol.ts";
import type { RetainedFactoryAdmission } from "./factory-live-port.ts";

/**
 * Durable retention of the per-stage Factory admission in the qdev journal database (the app database, never the accounting database).
 *
 * `FactoryStageAdmitter` memoizes in process, so a restart would prepare the same stage again. This store makes preparation at-most-once
 * across restarts and processes:
 *   1. A CLAIM row is inserted first (primary key journey+stage). Only the inserter may call the inner admitter.
 *   2. The completed admission is inserted once and read back; every later read, in any process, returns the stored admission.
 *   3. A claim without an admission (crash or failure after the claim) is NEVER re-prepared: it surfaces as QDEV_RETAINED_ADMISSION_PENDING,
 *      which the journey treats as a halt, so recovery reconciles the retained attempt instead of preparing a second one.
 * Both tables are append-only (updates and deletes raise). Stored admissions are re-validated on every read with the same authenticated
 * binding parser the Factory port uses; a row that fails is refused, never repaired.
 */
export const RETAINED_ADMISSION_SCHEMA = `
CREATE TABLE IF NOT EXISTS qdev_admission_claim (
 journey_id text NOT NULL, stage integer NOT NULL CHECK (stage BETWEEN 1 AND 3), created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY (journey_id, stage));
CREATE TABLE IF NOT EXISTS qdev_retained_admission (
 journey_id text NOT NULL, stage integer NOT NULL CHECK (stage BETWEEN 1 AND 3), admission jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY (journey_id, stage));
CREATE OR REPLACE FUNCTION qdev_retention_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'QDEV_RETENTION_IMMUTABLE'; END $$;
DROP TRIGGER IF EXISTS qdev_admission_claim_immutable ON qdev_admission_claim;
CREATE TRIGGER qdev_admission_claim_immutable BEFORE UPDATE OR DELETE ON qdev_admission_claim FOR EACH ROW EXECUTE FUNCTION qdev_retention_immutable();
DROP TRIGGER IF EXISTS qdev_retained_admission_immutable ON qdev_retained_admission;
CREATE TRIGGER qdev_retained_admission_immutable BEFORE UPDATE OR DELETE ON qdev_retained_admission FOR EACH ROW EXECUTE FUNCTION qdev_retention_immutable();`;

export class RetainedAdmissionRefused extends Error { constructor(readonly code: string) { super(code); } }
type Db = { query(sql: string, params?: unknown[]): Promise<Array<Record<string, unknown>>> };
type Stage = 1 | 2 | 3;

/** Same consistency the Factory port proves against Factory, applied to what came back from storage. */
function validate(value: unknown, stage: Stage): RetainedFactoryAdmission {
  const refuse = (): never => { throw new RetainedAdmissionRefused("QDEV_RETAINED_ADMISSION_INVALID"); };
  const a = value as RetainedFactoryAdmission;
  if (!a || typeof a !== "object" || Object.keys(a).sort().join(",") !== "binding,identity,request") return refuse();
  let binding;
  try { binding = prepareAuthenticatedLocalFactoryInputV4(a.binding); } catch { return refuse(); }
  const i = a.identity, r = a.request;
  if (!i || !r || i.workId !== binding.workId || i.workGeneration !== binding.workGeneration || i.factoryId !== binding.factoryId || i.factoryVersion !== binding.factoryVersion
    || i.requestId !== binding.requestId || i.workOrderId !== binding.workOrderId || i.remoteRunId !== binding.runId || i.baseSha !== binding.inputCommit
    || r.requestId !== binding.requestId || r.workId !== binding.workId || r.workGeneration !== binding.workGeneration || r.input?.baseRef !== binding.inputCommit
    || canonical(i.allowedPaths) !== canonical(r.input.allowedPaths)) return refuse();
  void stage;
  return a;
}

export class DurableStageAdmitter {
  constructor(private readonly c: { db: Db; journeyId: string; inner: { retained(stage: Stage): Promise<RetainedFactoryAdmission> } }) {
    if (!c.journeyId || c.journeyId.length > 200) throw new RetainedAdmissionRefused("QDEV_RETAINED_ADMISSION_JOURNEY");
  }

  private async stored(stage: Stage): Promise<RetainedFactoryAdmission | null> {
    const rows = await this.c.db.query("SELECT admission FROM qdev_retained_admission WHERE journey_id=$1 AND stage=$2", [this.c.journeyId, stage]);
    return rows.length ? validate(rows[0].admission, stage) : null;
  }

  private readonly inflight = new Map<Stage, Promise<RetainedFactoryAdmission>>();

  /** Concurrent callers in one process share one admission attempt; a failed attempt is not memoized (the claim row fences any retry). */
  retained(stage: Stage): Promise<RetainedFactoryAdmission> {
    if (stage !== 1 && stage !== 2 && stage !== 3) return Promise.reject(new RetainedAdmissionRefused("QDEV_RETAINED_ADMISSION_STAGE"));
    if (!this.inflight.has(stage)) this.inflight.set(stage, this.admit(stage).finally(() => this.inflight.delete(stage)));
    return this.inflight.get(stage)!;
  }

  private async admit(stage: Stage): Promise<RetainedFactoryAdmission> {
    const existing = await this.stored(stage);
    if (existing) return existing;
    const claimed = await this.c.db.query(
      "INSERT INTO qdev_admission_claim(journey_id,stage) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING stage", [this.c.journeyId, stage]);
    // Somebody else (or an earlier life of this process) already began preparing this stage: never prepare it again.
    if (!claimed.length) throw new RetainedAdmissionRefused("QDEV_RETAINED_ADMISSION_PENDING");
    const admission = validate(await this.c.inner.retained(stage), stage);
    await this.c.db.query(
      "INSERT INTO qdev_retained_admission(journey_id,stage,admission) VALUES($1,$2,$3::jsonb) ON CONFLICT DO NOTHING", [this.c.journeyId, stage, JSON.stringify(admission)]);
    const readBack = await this.stored(stage);
    if (!readBack || canonical(readBack) !== canonical(admission)) throw new RetainedAdmissionRefused("QDEV_RETAINED_ADMISSION_READBACK");
    return readBack;
  }
}
