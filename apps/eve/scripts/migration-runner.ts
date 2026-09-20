import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { splitSqlStatements } from "./migration-sql.ts";
import deployedLineage from "./deployed-lineage-396631a.json" with { type: "json" };

export const RECONCILIATION = "0031_deployed_lineage_reconciliation.sql";
export const SATISFIED_MIGRATION = "0030_action_binding_reconciliation.sql";
export const FEATURE_LINEAGE = "396631afa4739e5ca8ac0c5c81781f82f3160403";
type Row = Record<string, unknown>;
export interface Statement { sql: string; params?: unknown[] }
export interface MigrationDatabase {
  query(sql: string, params?: unknown[]): Promise<Row[]>;
  transaction(statements: Statement[]): Promise<unknown>;
}
export interface Migration { name: string; checksum: string; statements: string[] }
export interface LedgerRow { name: string; checksum: string; applied_at?: unknown }
export interface ReconciliationRecord {
  origin: string;
  source_ledger: LedgerRow[];
  satisfied_migrations: Record<string, string>;
}

export async function loadMigrations(directory = new URL("../migrations/", import.meta.url)): Promise<Migration[]> {
  const names = (await readdir(directory)).filter(n => n.endsWith(".sql")).sort();
  if (!names.length) throw new Error("No database migrations were found.");
  const versions = new Set<string>();
  return Promise.all(names.map(async name => {
    if (!/^\d{4}_[a-z0-9_]+\.sql$/.test(name) || versions.has(name.slice(0, 4)))
      throw new Error(`Invalid or duplicate migration: ${name}`);
    versions.add(name.slice(0, 4));
    const source = await readFile(new URL(name, directory), "utf8");
    const statements = splitSqlStatements(source);
    if (!statements.length) throw new Error(`Empty migration: ${name}`);
    return { name, checksum: createHash("sha256").update(source).digest("hex"), statements };
  }));
}

/** No per-file blanket aliases: only the complete, exact deployed 0001–0029 lineage. */
export function planMigrations(migrations: Migration[], ledger: LedgerRow[], record?: ReconciliationRecord) {
  const expected = new Map(migrations.map(m => [m.name, m.checksum]));
  if (new Set(ledger.map(r => r.name)).size !== ledger.length) throw new Error("Duplicate migration ledger entry.");
  const feature = ledger.some(r => expected.get(r.name) !== r.checksum);
  const known = deployedLineage as Record<string, string>;
  if (feature) {
    if (!expected.has(RECONCILIATION) || Object.entries(known).some(([name, checksum]) =>
      !ledger.some(r => r.name === name && r.checksum === checksum)))
      throw new Error("Unknown or partial deployed migration lineage.");
    if (ledger.some(r => r.name === SATISFIED_MIGRATION))
      throw new Error("Feature lineage cannot claim canonical 0030 was applied.");
  }
  for (const row of ledger) {
    if (!expected.has(row.name) || row.checksum !== (feature && known[row.name] ? known[row.name] : expected.get(row.name)))
      throw new Error(`Unknown checksum or migration: ${row.name}`);
  }
  const applied = new Set(ledger.map(r => r.name));
  const reconciled = applied.has(RECONCILIATION);
  if (reconciled !== Boolean(record)) throw new Error("Partial reconciliation marker/ledger state.");
  if (record) {
    const origin = feature ? FEATURE_LINEAGE : "canonical";
    const snapshot = Object.fromEntries(record.source_ledger.map(r => [r.name, r.checksum]));
    const prefix = feature ? known : Object.fromEntries(migrations.filter(m => m.name < RECONCILIATION).map(m => [m.name, m.checksum]));
    const satisfied: Record<string, string> = feature ? { [SATISFIED_MIGRATION]: expected.get(SATISFIED_MIGRATION)! } : {};
    const same = (a: Record<string, string>, b: Record<string, string>) =>
      Object.keys(a).length === Object.keys(b).length && Object.entries(a).every(([k, v]) => b[k] === v);
    if (record.origin !== origin || record.source_ledger.length !== Object.keys(prefix).length ||
      !same(snapshot, prefix) || !same(record.satisfied_migrations, satisfied))
      throw new Error("Invalid reconciliation evidence.");
  }
  // A ledger is a prefix, except for the explicitly attested feature-lineage 0030.
  let gap = false;
  for (const migration of migrations) {
    if (feature && migration.name === SATISFIED_MIGRATION) continue;
    if (!applied.has(migration.name)) gap = true;
    else if (gap) throw new Error("Noncontiguous migration ledger.");
  }
  return {
    origin: feature ? FEATURE_LINEAGE : "canonical",
    pending: migrations.filter(m => !applied.has(m.name) && !(feature && m.name === SATISFIED_MIGRATION)),
    satisfied: feature ? { [SATISFIED_MIGRATION]: expected.get(SATISFIED_MIGRATION)! } : {},
  };
}

// Executed inside the same locked transaction as 0031, before skipping any DDL.
// Name/existence alone is insufficient: verify type, default, keys, uniqueness,
// validity, predicate, and that this is the index on the intended relation.
export const VERIFY_ACTION_BINDING = `DO $verify$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_attribute a JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
    WHERE a.attrelid='action_requests'::regclass AND a.attname='approval_generation'
      AND a.atttypid='integer'::regtype AND a.attnotnull AND NOT a.attisdropped
      AND a.attidentity='' AND a.attgenerated='' AND pg_get_expr(d.adbin,d.adrelid)='0') THEN
    RAISE EXCEPTION 'approval_generation is not canonical';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_index i JOIN pg_class idx ON idx.oid=i.indexrelid JOIN pg_am am ON am.oid=idx.relam
    WHERE i.indrelid='action_requests'::regclass AND idx.relnamespace=(SELECT relnamespace FROM pg_class WHERE oid='action_requests'::regclass)
      AND idx.relname='action_requests_live_binding' AND i.indisunique AND i.indisvalid AND i.indisready
      AND i.indnkeyatts=3 AND i.indnatts=3 AND i.indexprs IS NULL AND NOT i.indnullsnotdistinct AND am.amname='btree'
      AND pg_get_indexdef(i.indexrelid,1,true)='owner_id' AND pg_get_indexdef(i.indexrelid,2,true)='run_id'
      AND pg_get_indexdef(i.indexrelid,3,true)='parameter_hash'
      AND pg_get_expr(i.indpred,i.indrelid) = '(status = ANY (ARRAY[''planned''::text, ''awaiting_approval''::text, ''authorized''::text, ''executing''::text, ''verifying''::text, ''result_unknown''::text, ''recovering''::text, ''needs_you''::text, ''retryable''::text]))') THEN
    RAISE EXCEPTION 'action_requests_live_binding is not canonical';
  END IF;
  IF EXISTS(SELECT 1 FROM action_requests WHERE approval_generation<0) THEN
    RAISE EXCEPTION 'Invalid approval generation';
  END IF;
END $verify$`;

export async function runMigrations(database: MigrationDatabase, migrations: Migration[], log = console.log) {
  const [table] = await database.query("SELECT to_regclass('sofie_schema_migrations') AS present");
  const ledger = table?.present ? await database.query("SELECT name,checksum,applied_at FROM sofie_schema_migrations ORDER BY name") as unknown as LedgerRow[] : [];
  const [marker] = await database.query("SELECT to_regclass('sofie_migration_reconciliations') AS present");
  const records = marker?.present ? await database.query("SELECT origin,source_ledger,satisfied_migrations FROM sofie_migration_reconciliations WHERE id='0031'") : [];
  const plan = planMigrations(migrations, ledger, records[0] as unknown as ReconciliationRecord | undefined);
  if (marker?.present && !records.length) throw new Error("Partial reconciliation table without evidence.");
  if (records.length) {
    await database.query(VERIFY_ACTION_BINDING);
    const [ownership] = await database.query(`SELECT NOT a.attnotnull AND d.adbin IS NULL AS canonical
      FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
      WHERE a.attrelid='chat_files'::regclass AND a.attname='owner_id' AND NOT a.attisdropped`);
    if (ownership?.canonical !== true) throw new Error("Reconciled file ownership schema has drifted.");
  }
  if (!table?.present) await database.query(`CREATE TABLE sofie_schema_migrations (
    name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`);
  for (const migration of plan.pending) {
    const statements: Statement[] = [
      { sql: "SET LOCAL lock_timeout='5s'" }, { sql: "SET LOCAL statement_timeout='30s'" },
      { sql: "LOCK TABLE sofie_schema_migrations IN EXCLUSIVE MODE" },
      // Compare again under the lock. Concurrent runners must restart discovery.
      { sql: "SELECT 1 / ((SELECT coalesce(jsonb_object_agg(name,checksum),'{}'::jsonb) FROM sofie_schema_migrations) = $1::jsonb)::int AS ledger_unchanged",
        params: [JSON.stringify(Object.fromEntries(ledger.map(r => [r.name, r.checksum])))] },
    ];
    if (migration.name === RECONCILIATION) statements.push(
      { sql: "LOCK TABLE action_requests IN SHARE ROW EXCLUSIVE MODE" },
      { sql: VERIFY_ACTION_BINDING },
    );
    statements.push(...migration.statements.map(sql => ({ sql })));
    if (migration.name === RECONCILIATION) statements.push({
      sql: `INSERT INTO sofie_migration_reconciliations(id,origin,source_ledger,satisfied_migrations)
        SELECT '0031',$1,jsonb_agg(jsonb_build_object('name',name,'checksum',checksum,'applied_at',applied_at) ORDER BY name),$2::jsonb
        FROM sofie_schema_migrations`,
      params: [plan.origin, JSON.stringify(plan.satisfied)],
    });
    statements.push({ sql: "INSERT INTO sofie_schema_migrations(name,checksum) VALUES($1,$2)", params: [migration.name, migration.checksum] });
    await database.transaction(statements);
    ledger.push({ name: migration.name, checksum: migration.checksum });
    log(`Applied ${migration.name}`);
  }
  return plan;
}
