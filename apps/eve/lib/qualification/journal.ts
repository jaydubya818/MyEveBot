/**
 * Durable orchestration journal for the qdev journey. It is NOT an accounting
 * system: the qdev_* ledger remains the only authority for charges, claims and
 * fencing. The journal only lets a restarted orchestrator recover without ever
 * re-sending: an operation journaled as claimed but not settled is ambiguous
 * exposure and halts the journey (the ledger fences it).
 */
export type JournalEvent =
  | { kind: "STAGE_BOUND"; stage: number; workId: string; allowanceId: string }
  | { kind: "OP_CLAIMED"; stage: number; key: string }
  | { kind: "OP_SETTLED"; stage: number; key: string }
  /** Full canonical Result expectations for stages 1-3, persisted before any stage effect and compared on resume. */
  | { kind: "STAGE_EXPECTATION"; stage: 1 | 2 | 3; digest: string; expected: unknown }
  /** The exact authenticated identity accepted for the stage. A resumed journey must reproduce it or halt. */
  | { kind: "STAGE_ACCEPTED"; stage: number; digest: string; candidate?: { commit: string; tree: string }; buildArtifactSha256?: string }
  | { kind: "AGENT_EXECUTION"; stage: number; requestId: string; workOrderId: string; runId: string }
  | { kind: "HALTED"; stage: number; code: string };

export interface JourneyJournal {
  append(event: JournalEvent): Promise<void>;
  read(): Promise<JournalEvent[]>;
}

export class InMemoryJournal implements JourneyJournal {
  private readonly events: JournalEvent[] = [];
  async append(event: JournalEvent) { this.events.push(structuredClone(event)); }
  async read() { return structuredClone(this.events); }
}

/** Idempotent schema for the orchestration journal; lives in the app database, never in the accounting database. */
export const JOURNAL_SCHEMA = `
CREATE TABLE IF NOT EXISTS qjourney_event (
 seq bigserial PRIMARY KEY, journey_id text NOT NULL, kind text NOT NULL, stage integer NOT NULL,
 payload jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE OR REPLACE FUNCTION qjourney_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'QJOURNEY_IMMUTABLE'; END $$;
DROP TRIGGER IF EXISTS qjourney_event_immutable ON qjourney_event;
CREATE TRIGGER qjourney_event_immutable BEFORE UPDATE OR DELETE ON qjourney_event FOR EACH ROW EXECUTE FUNCTION qjourney_immutable();`;

export class PostgresJournal implements JourneyJournal {
  constructor(private readonly db: { query(sql: string, params?: unknown[]): Promise<Array<Record<string, unknown>>> }, private readonly journeyId: string) {}
  async append(event: JournalEvent) {
    await this.db.query("INSERT INTO qjourney_event(journey_id,kind,stage,payload) VALUES($1,$2,$3,$4::jsonb)", [this.journeyId, event.kind, event.stage, JSON.stringify(event)]);
  }
  async read() {
    const rows = await this.db.query("SELECT payload FROM qjourney_event WHERE journey_id=$1 ORDER BY seq", [this.journeyId]);
    return rows.map(r => r.payload as JournalEvent);
  }
}
