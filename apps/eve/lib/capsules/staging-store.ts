import { db } from "@/agent/lib/receipts-db";
import { CapsuleError } from "./schema";
import type { PreparedImport, StagedRecord } from "./import";

type Query = (sql: string, params: unknown[]) => Promise<Record<string, unknown>[]>;
const query: Query = (sql, params) => db().query(sql, params) as Promise<Record<string, unknown>[]>;
type Statement = { sql: string; params: unknown[] };
type Transaction = (statements: Statement[]) => Promise<Record<string, unknown>[][]>;
const transact: Transaction = statements => db().transaction(tx => statements.map(s => tx.query(s.sql, s.params)), { isolationLevel: "ReadCommitted" }) as Promise<Record<string, unknown>[][]>;
const NAMESPACE = "memory-capsule-staging-v1";

/** Existing owner operation storage, inert review material only. No Memory writes. */
export class CapsuleStagingStore {
  constructor(private ownerId: string, private run: Query = query, private transaction: Transaction = transact) {}
  async list() {
    const rows = await this.run(`SELECT id,record_count,metadata,created_at FROM owner_data_operations WHERE owner_id=$1 AND operation_type='restore_planned' AND metadata->>'namespace'=$2 AND created_at>now()-interval '30 days' ORDER BY created_at,id LIMIT 100`, [this.ownerId, NAMESPACE]);
    return rows.map(row => ({ id: String(row.id), count: Number(row.record_count), createdAt: String(row.created_at), records: (row.metadata as { records: StagedRecord[] }).records }));
  }
  async commit(batch: PreparedImport) {
    // Separate statements at READ COMMITTED acquire a fresh snapshot after the
    // owner lock. A lock inside a single INSERT CTE would leave a stale quota snapshot.
    const results = await this.transaction([
      { sql: "SELECT pg_advisory_xact_lock(hashtextextended($1,0))", params: [this.ownerId] },
      { sql: `DELETE FROM owner_data_operations WHERE owner_id=$1 AND operation_type='restore_planned' AND metadata->>'namespace'=$2 AND created_at<=now()-interval '30 days'`, params: [this.ownerId, NAMESPACE] },
      { sql: `INSERT INTO owner_data_operations (id,owner_id,operation_type,status,archive_version,record_count,checksum,metadata,completed_at)
        SELECT $3,$1,'restore_planned','completed',1,$4,$5,$6::jsonb,now()
        WHERE (SELECT count(*) FROM owner_data_operations WHERE owner_id=$1 AND metadata->>'namespace'=$2)<100
        ON CONFLICT (id) DO NOTHING RETURNING id`,
        params: [this.ownerId, NAMESPACE, batch.id, batch.records.length, batch.capsuleDigest, JSON.stringify({ namespace: NAMESPACE, records: batch.records, decisions: batch.decisions, activation: "none" })] },
      { sql: "SELECT id,record_count FROM owner_data_operations WHERE owner_id=$1 AND id=$2 AND metadata->>'namespace'=$3", params: [this.ownerId, batch.id, NAMESPACE] },
    ]);
    const rows = results[3];
    if (!rows.length) throw new CapsuleError("staging_full", "Staging is full or a concurrent review completed. Refresh the review list; remove unused reviews if needed.");
    return { id: String(rows[0].id), count: Number(rows[0].record_count), result: "staged" as const, duplicate: results[2].length === 0 };
  }
  async remove(id: string) {
    const rows = await this.run(`DELETE FROM owner_data_operations WHERE owner_id=$1 AND id=$2 AND operation_type='restore_planned' AND metadata->>'namespace'=$3 RETURNING id`, [this.ownerId, id, NAMESPACE]);
    return rows.length > 0;
  }
}
