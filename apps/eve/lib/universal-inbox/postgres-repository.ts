/** Unmounted activation candidate. Requires the unnumbered schema and a restricted runtime pool. */
import type { AttentionItem, Evidence, InboxQuery, OwnerResponse } from "./contracts.ts";
import type { AttentionRepository, AttentionTransaction } from "./repository.ts";
import { queryPlan } from "./query.ts";
export interface InboxSqlConnection {
  query(text: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  release(): void;
}
export interface InboxSqlPool { connect(): Promise<InboxSqlConnection> }
const data = <T>(row: Record<string, unknown> | undefined): T | null => row ? row.data as T : null;
const placeholders = (sql: string) => { let n = 0; return sql.replaceAll("?", () => `$${++n}`); };
export class PostgresAttentionRepository implements AttentionRepository {
  constructor(private pool: InboxSqlPool) {}
  private async scoped<T>(ownerId: string, run: (connection: InboxSqlConnection) => Promise<T>) {
    const c = await this.pool.connect();
    try {
      await c.query("BEGIN");
      await c.query("SELECT set_config('myeve.inbox_owner',$1,true)", [ownerId]);
      const result = await run(c); await c.query("COMMIT"); return result;
    } catch (error) { await c.query("ROLLBACK"); throw error; }
    finally { c.release(); }
  }
  async transaction<T>(run: (tx: AttentionTransaction) => Promise<T>): Promise<T> {
    const c = await this.pool.connect(); let owner: string | null = null;
    const bind = async (ownerId: string) => {
      if (owner && owner !== ownerId) throw new Error("CROSS_OWNER_TRANSACTION");
      if (!owner) {
        owner = ownerId;
        await c.query("SELECT set_config('myeve.inbox_owner',$1,true)", [ownerId]);
        // Coarse per-owner lock is deliberate for initial correctness, including absent-row upserts.
        await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,719))", [ownerId]);
      }
    };
    const get = async <V>(table: string, ownerId: string, id: string) => {
      await bind(ownerId); return data<V>((await c.query(`SELECT data FROM ${table} WHERE owner_id=$1 AND id=$2`, [ownerId, id])).rows[0]);
    };
    try {
      await c.query("BEGIN");
      const result = await run({
        getItem: (ownerId, id) => get<AttentionItem>("inbox_attention_items", ownerId, id),
        saveItem: async item => { await bind(item.ownerId); await c.query(`INSERT INTO inbox_attention_items(owner_id,id,data) VALUES($1,$2,$3::jsonb)
          ON CONFLICT(owner_id,id) DO UPDATE SET data=EXCLUDED.data`, [item.ownerId, item.id, JSON.stringify(item)]); },
        getEvidence: (ownerId, id) => get<Evidence>("inbox_attention_evidence", ownerId, id),
        saveEvidence: async evidence => { await bind(evidence.ownerId); await c.query(`INSERT INTO inbox_attention_evidence(owner_id,id,item_id,data) VALUES($1,$2,$3,$4::jsonb)
          ON CONFLICT(owner_id,id) DO UPDATE SET data=EXCLUDED.data`, [evidence.ownerId, evidence.id, evidence.itemId, JSON.stringify(evidence)]); },
        getResponse: (ownerId, id) => get<OwnerResponse>("inbox_attention_responses", ownerId, id),
        saveResponse: async response => { await bind(response.ownerId); await c.query(`INSERT INTO inbox_attention_responses(owner_id,id,item_id,data) VALUES($1,$2,$3,$4::jsonb)
          ON CONFLICT(owner_id,id) DO UPDATE SET data=EXCLUDED.data`, [response.ownerId, response.id, response.itemId, JSON.stringify(response)]); },
      });
      await c.query("COMMIT"); return result;
    } catch (error) { await c.query("ROLLBACK"); throw error; }
    finally { c.release(); }
  }
  get(ownerId: string, id: string) {
    return this.scoped(ownerId, async c => data<AttentionItem>((await c.query("SELECT data FROM inbox_attention_items WHERE owner_id=$1 AND id=$2", [ownerId, id])).rows[0]));
  }
  list(ownerId: string, raw: InboxQuery, now: string) {
    const plan = queryPlan(ownerId, raw, now, "postgres");
    return this.scoped(ownerId, async c => {
      const rows = (await c.query(placeholders(`SELECT data FROM inbox_attention_items WHERE ${plan.where} ORDER BY score DESC,deadline,id LIMIT ?`), plan.params)).rows;
      const items = rows.slice(0, plan.query.limit).map(row => data<AttentionItem>(row)!); const last = items.at(-1);
      return { items, nextCursor: rows.length > plan.query.limit && last ? Buffer.from(JSON.stringify([last.priorityScore, last.priority.deadlineAt ?? "9999", last.id, plan.binding])).toString("base64url") : null };
    });
  }
  evidence(ownerId: string, itemId: string, afterId = "") {
    return this.scoped(ownerId, async c => (await c.query("SELECT data FROM inbox_attention_evidence WHERE owner_id=$1 AND item_id=$2 AND id>$3 ORDER BY id LIMIT 100", [ownerId, itemId, afterId])).rows.map(row => data<Evidence>(row)!));
  }
  pending(ownerId: string, limit: number) {
    return this.scoped(ownerId, async c => (await c.query("SELECT data FROM inbox_attention_responses WHERE owner_id=$1 AND status='PENDING' ORDER BY id LIMIT $2", [ownerId, Math.min(100, Math.max(1, limit))])).rows.map(row => data<OwnerResponse>(row)!));
  }
  metrics(ownerId: string) {
    return this.scoped(ownerId, async c => {
      const necessary = (await c.query("SELECT count(*) AS n FROM inbox_attention_responses WHERE owner_id=$1", [ownerId])).rows[0]!;
      const avoidable = (await c.query("SELECT count(DISTINCT (item_id,data#>>'{event,action,id}')) AS n FROM inbox_attention_evidence WHERE owner_id=$1 AND data#>>'{event,action,involvement}'='AVOIDABLE_COORDINATION'", [ownerId])).rows[0]!;
      return { necessaryInterventions: Number(necessary.n), avoidableCoordinationRequests: Number(avoidable.n) };
    });
  }
}
