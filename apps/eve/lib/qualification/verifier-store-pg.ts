import type { ExecutionDatabase } from "../execution-types.ts";
import { verdictSchema, type SignedVerdict } from "./verdict.ts";
import type { VerifierRecord, VerifierStore, VerifierUsage } from "./verifier-service.ts";

/**
 * Durable production store for the verifier service, over the verifier's OWN PostgreSQL database (never the qdev ledger or journal).
 * Each candidate has one append-only lifecycle row HANDED_OFF -> RUNNING -> FINAL. The transitions are single atomic UPDATEs guarded by the
 * current phase, so the single charged evaluation is claimed exactly once across processes and restarts, and a final verdict is written once.
 * Triggers make the history immutable: no deletes, no field other than the phase transition's own may change, and a FINAL row never changes.
 */
export const VERIFIER_SCHEMA = `
CREATE TABLE IF NOT EXISTS qdev_verifier_candidate (
  candidate_key text PRIMARY KEY CHECK (candidate_key ~ '^[a-f0-9]{40}:[a-f0-9]{40}:[a-f0-9]{64}$'),
  handoff_sha256 text NOT NULL CHECK (handoff_sha256 ~ '^[a-f0-9]{64}$'),
  phase text NOT NULL CHECK (phase IN ('HANDED_OFF','RUNNING','FINAL')),
  reserve_microusd bigint CHECK (reserve_microusd BETWEEN 1 AND 1300000),
  began_at_ms bigint,
  settled_microusd bigint CHECK (settled_microusd >= 0),
  quiescent boolean,
  verdict jsonb,
  signature_base64 text,
  CHECK ((phase = 'HANDED_OFF') = (reserve_microusd IS NULL AND began_at_ms IS NULL)),
  CHECK ((phase = 'FINAL') = (quiescent IS NOT NULL AND verdict IS NOT NULL AND signature_base64 IS NOT NULL)),
  CHECK (settled_microusd IS NULL OR quiescent IS NOT NULL)
);
CREATE OR REPLACE FUNCTION qdev_verifier_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'QDEV_VERIFIER_HISTORY_IMMUTABLE'; END IF;
  IF NEW.candidate_key IS DISTINCT FROM OLD.candidate_key OR NEW.handoff_sha256 IS DISTINCT FROM OLD.handoff_sha256 THEN RAISE EXCEPTION 'QDEV_VERIFIER_HISTORY_IMMUTABLE'; END IF;
  IF OLD.phase = 'HANDED_OFF' AND NEW.phase = 'RUNNING' THEN RETURN NEW; END IF;
  IF OLD.phase = 'RUNNING' AND NEW.phase = 'FINAL' AND NEW.reserve_microusd IS NOT DISTINCT FROM OLD.reserve_microusd AND NEW.began_at_ms IS NOT DISTINCT FROM OLD.began_at_ms THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'QDEV_VERIFIER_HISTORY_IMMUTABLE';
END $$;
DROP TRIGGER IF EXISTS qdev_verifier_guard ON qdev_verifier_candidate;
CREATE TRIGGER qdev_verifier_guard BEFORE UPDATE OR DELETE ON qdev_verifier_candidate FOR EACH ROW EXECUTE FUNCTION qdev_verifier_guard();
`;

type Row = { handoff_sha256: string; phase: string; reserve_microusd: string | number | null; began_at_ms: string | number | null; settled_microusd: string | number | null; quiescent: boolean | null; verdict: unknown; signature_base64: string | null };
const num = (v: string | number | null) => v === null ? null : Number(v);

export class PostgresVerifierStore implements VerifierStore {
  constructor(private readonly db: ExecutionDatabase) {}

  private static record(r: Row): VerifierRecord {
    const phase = r.phase as VerifierRecord["phase"];
    const usage: VerifierUsage | null = phase === "FINAL" ? { settledMicrousd: num(r.settled_microusd), quiescent: r.quiescent === true } : null;
    const signed: SignedVerdict | null = phase === "FINAL" ? { verdict: verdictSchema.parse(r.verdict), signatureBase64: r.signature_base64! } : null;
    return { handoffSha256: r.handoff_sha256, phase, reserveMicrousd: num(r.reserve_microusd), beganAtMs: num(r.began_at_ms), usage, signed };
  }
  private async row(key: string): Promise<Row | null> {
    const rows = await this.db.query("SELECT handoff_sha256, phase, reserve_microusd, began_at_ms, settled_microusd, quiescent, verdict, signature_base64 FROM qdev_verifier_candidate WHERE candidate_key = $1", [key]) as Row[];
    return rows[0] ?? null;
  }

  async putHandoff(key: string, handoffSha256: string) {
    await this.db.query("INSERT INTO qdev_verifier_candidate (candidate_key, handoff_sha256, phase) VALUES ($1, $2, 'HANDED_OFF') ON CONFLICT (candidate_key) DO NOTHING", [key, handoffSha256]);
    const r = await this.row(key);
    return { handoffSha256: r!.handoff_sha256 };
  }
  async get(key: string) { const r = await this.row(key); return r ? PostgresVerifierStore.record(r) : null; }
  async begin(key: string, reserveMicrousd: number, nowMs: number) {
    const rows = await this.db.query("UPDATE qdev_verifier_candidate SET phase = 'RUNNING', reserve_microusd = $2, began_at_ms = $3 WHERE candidate_key = $1 AND phase = 'HANDED_OFF' RETURNING candidate_key", [key, reserveMicrousd, nowMs]) as unknown[];
    return rows.length === 1;
  }
  async finish(key: string, usage: VerifierUsage, signed: SignedVerdict) {
    await this.db.query("UPDATE qdev_verifier_candidate SET phase = 'FINAL', settled_microusd = $2, quiescent = $3, verdict = $4::jsonb, signature_base64 = $5 WHERE candidate_key = $1 AND phase = 'RUNNING'",
      [key, usage.settledMicrousd, usage.quiescent, JSON.stringify(signed.verdict), signed.signatureBase64]);
    const r = await this.row(key);
    if (!r || r.phase !== "FINAL") throw new Error("QDEV_VERIFIER_FINISH");
    return PostgresVerifierStore.record(r);
  }
}
