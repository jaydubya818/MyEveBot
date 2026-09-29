/** Local qualification storage ONLY. Never import into production routes or schedulers. */
import { DatabaseSync } from "node:sqlite";
import { queryPlan } from "./query.ts";
import type { AttentionItem, Evidence, InboxQuery, OwnerResponse } from "./contracts.ts";
import type { AttentionRepository, AttentionTransaction } from "./repository.ts";

const decode = <T>(row: Record<string, unknown> | undefined): T | null => row ? JSON.parse(String(row.data)) as T : null;

export class FixtureAttentionRepository implements AttentionRepository {
  private database: DatabaseSync;
  private tail: Promise<unknown> = Promise.resolve();
  constructor(path = ":memory:") {
    this.database = new DatabaseSync(path, { timeout: 5000 });
    this.database.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS fixture_attention_items (
        owner_id TEXT NOT NULL, id TEXT NOT NULL, status TEXT NOT NULL, kind TEXT NOT NULL,
        needs_action INTEGER NOT NULL, expires_at TEXT, score INTEGER NOT NULL, deadline TEXT NOT NULL, data TEXT NOT NULL,
        PRIMARY KEY(owner_id,id));
      CREATE INDEX IF NOT EXISTS fixture_inbox_page ON fixture_attention_items(owner_id,score DESC,deadline,id);
      CREATE INDEX IF NOT EXISTS fixture_needs_you ON fixture_attention_items(owner_id,needs_action,score DESC,deadline,id);
      CREATE INDEX IF NOT EXISTS fixture_work_thread ON fixture_attention_items(owner_id,json_extract(data,'$.workId'),score DESC,deadline,id);
      CREATE INDEX IF NOT EXISTS fixture_correlation_thread ON fixture_attention_items(owner_id,json_extract(data,'$.correlationId'),score DESC,deadline,id);
      CREATE INDEX IF NOT EXISTS fixture_resolution_window ON fixture_attention_items(owner_id,json_extract(data,'$.resolvedAt'));
      CREATE INDEX IF NOT EXISTS fixture_reply_window ON fixture_attention_items(owner_id,json_extract(data,'$.lastExternalReplyAt'));
      CREATE TABLE IF NOT EXISTS fixture_attention_evidence (
        owner_id TEXT NOT NULL, id TEXT NOT NULL, item_id TEXT NOT NULL, data TEXT NOT NULL,
        PRIMARY KEY(owner_id,id), FOREIGN KEY(owner_id,item_id) REFERENCES fixture_attention_items(owner_id,id));
      CREATE INDEX IF NOT EXISTS fixture_evidence_page ON fixture_attention_evidence(owner_id,item_id,id);
      CREATE TABLE IF NOT EXISTS fixture_attention_responses (
        owner_id TEXT NOT NULL, id TEXT NOT NULL, item_id TEXT NOT NULL, status TEXT NOT NULL, data TEXT NOT NULL,
        PRIMARY KEY(owner_id,id), UNIQUE(owner_id,item_id), FOREIGN KEY(owner_id,item_id) REFERENCES fixture_attention_items(owner_id,id));
      CREATE INDEX IF NOT EXISTS fixture_response_queue ON fixture_attention_responses(owner_id,status,id);`);
  }
  close() { this.database.close(); }
  // Serialize reads too: no caller may see another caller's uncommitted writes on this connection.
  private serial<T>(run: () => Promise<T>): Promise<T> {
    const result = this.tail.then(run);
    this.tail = result.catch(() => undefined);
    return result;
  }
  private readItem(ownerId: string, id: string) {
    return decode<AttentionItem>(this.database.prepare("SELECT data FROM fixture_attention_items WHERE owner_id=? AND id=?").get(ownerId, id));
  }
  async transaction<T>(run: (tx: AttentionTransaction) => Promise<T>): Promise<T> {
    return this.serial(async () => {
      this.database.exec("BEGIN IMMEDIATE");
      try {
        const result = await run({
          getItem: async (ownerId, id) => this.readItem(ownerId, id),
          saveItem: async item => {
            this.database.prepare(`INSERT INTO fixture_attention_items VALUES (?,?,?,?,?,?,?,?,?)
              ON CONFLICT(owner_id,id) DO UPDATE SET status=excluded.status,kind=excluded.kind,needs_action=excluded.needs_action,
              expires_at=excluded.expires_at,score=excluded.score,deadline=excluded.deadline,data=excluded.data`).run(
              item.ownerId, item.id, item.status, item.kind,
              Number(item.status === "NEEDS_ACTION" && item.action?.involvement === "NECESSARY_JUDGMENT" && item.action.reason !== "internal_coordination"),
              item.action?.expiresAt ?? null, item.priorityScore, item.priority.deadlineAt ?? "9999", JSON.stringify(item));
          },
          getEvidence: async (ownerId, id) => decode<Evidence>(this.database.prepare("SELECT data FROM fixture_attention_evidence WHERE owner_id=? AND id=?").get(ownerId, id)),
          saveEvidence: async evidence => {
            this.database.prepare(`INSERT INTO fixture_attention_evidence VALUES (?,?,?,?) ON CONFLICT(owner_id,id) DO UPDATE SET data=excluded.data`).run(evidence.ownerId, evidence.id, evidence.itemId, JSON.stringify(evidence));
          },
          getResponse: async (ownerId, id) => decode<OwnerResponse>(this.database.prepare("SELECT data FROM fixture_attention_responses WHERE owner_id=? AND id=?").get(ownerId, id)),
          saveResponse: async response => {
            this.database.prepare(`INSERT INTO fixture_attention_responses VALUES (?,?,?,?,?) ON CONFLICT(owner_id,id) DO UPDATE SET status=excluded.status,data=excluded.data`).run(response.ownerId, response.id, response.itemId, response.status, JSON.stringify(response));
          },
        });
        this.database.exec("COMMIT");
        return result;
      } catch (error) { this.database.exec("ROLLBACK"); throw error; }
    });
  }
  get(ownerId: string, id: string) { return this.serial(async () => this.readItem(ownerId, id)); }
  list(ownerId: string, raw: InboxQuery, now: string) {
    const plan = queryPlan(ownerId, raw, now, "sqlite");
    return this.serial(async () => {
      const rows = this.database.prepare(`SELECT data FROM fixture_attention_items WHERE ${plan.where} ORDER BY score DESC,deadline,id LIMIT ?`).all(...plan.params);
      const items = rows.slice(0, plan.query.limit).map(row => decode<AttentionItem>(row)!);
      const last = items.at(-1);
      return { items, nextCursor: rows.length > plan.query.limit && last ? Buffer.from(JSON.stringify([last.priorityScore, last.priority.deadlineAt ?? "9999", last.id, plan.binding])).toString("base64url") : null };
    });
  }
  evidence(ownerId: string, itemId: string, afterId = "") {
    return this.serial(async () => this.database.prepare("SELECT data FROM fixture_attention_evidence WHERE owner_id=? AND item_id=? AND id>? ORDER BY id LIMIT 100").all(ownerId, itemId, afterId).map(row => decode<Evidence>(row)!));
  }
  pending(ownerId: string, limit: number) {
    return this.serial(async () => this.database.prepare("SELECT data FROM fixture_attention_responses WHERE owner_id=? AND status='PENDING' ORDER BY id LIMIT ?").all(ownerId, Math.max(1, Math.min(100, limit))).map(row => decode<OwnerResponse>(row)!));
  }
  metrics(ownerId: string) {
    return this.serial(async () => {
      const necessary = this.database.prepare("SELECT count(*) AS n FROM fixture_attention_responses WHERE owner_id=?").get(ownerId)!;
      const avoidable = this.database.prepare(`SELECT count(DISTINCT item_id || ':' || json_extract(data,'$.event.action.id')) AS n FROM fixture_attention_evidence
        WHERE owner_id=? AND json_extract(data,'$.event.action.involvement')='AVOIDABLE_COORDINATION'`).get(ownerId)!;
      return { necessaryInterventions: Number(necessary.n), avoidableCoordinationRequests: Number(avoidable.n) };
    });
  }
}
