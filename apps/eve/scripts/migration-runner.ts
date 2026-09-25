import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { splitSqlStatements } from "./migration-sql.ts";
import deployedLineage from "./deployed-lineage-396631a.json" with { type: "json" };

export const RECONCILIATION = "0033_final_lineage_bridge.sql";
export const HISTORICAL_RECONCILIATION = "0031_deployed_lineage_reconciliation.sql";
export const HISTORICAL_CHECKSUM = "f34d07ff5e8be75a8518a06eb98b08bd294abde3bdbb2b0dfab7086209be8f6f";
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
export interface BridgeRecord {
  source_ledger: LedgerRow[];
  canonical_manifest: Record<string,string>;
  satisfied_migrations: Record<string,string>;
}
export interface ReconciliationRecord {
  id?: string;
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

function same(a: Record<string,string>, b: Record<string,string>) {
  return Object.keys(a).length === Object.keys(b).length && Object.entries(a).every(([k,v]) => b[k] === v);
}
const ledgerMap = (rows: LedgerRow[]) => Object.fromEntries(rows.map(r => [r.name,r.checksum]));
function exactSnapshot(rows: LedgerRow[], expected: Record<string,string>) {
  return rows.length === Object.keys(expected).length && same(ledgerMap(rows),expected);
}

/** Only exact canonical prefixes or the complete pinned alternate lineage. */
export function planMigrations(migrations: Migration[], ledger: LedgerRow[], record?: ReconciliationRecord, bridge?: BridgeRecord) {
  const expected = new Map(migrations.map(m => [m.name,m.checksum]));
  const known = deployedLineage as Record<string,string>;
  if (new Set(ledger.map(r => r.name)).size !== ledger.length) throw new Error("Duplicate migration ledger entry.");
  const historical = ledger.some(r => r.name === HISTORICAL_RECONCILIATION);
  const feature = ledger.some(r => r.name !== HISTORICAL_RECONCILIATION && expected.get(r.name) !== r.checksum);
  if (feature && (!expected.has(RECONCILIATION) || Object.entries(known).some(([name,checksum]) =>
    !ledger.some(r => r.name === name && r.checksum === checksum)))) throw new Error("Unknown or partial deployed migration lineage.");
  if (feature && ledger.some(r => r.name === SATISFIED_MIGRATION)) throw new Error("Feature lineage cannot claim canonical 0030 was applied.");
  for (const row of ledger) {
    const checksum = row.name === HISTORICAL_RECONCILIATION ? HISTORICAL_CHECKSUM : feature && known[row.name] ? known[row.name] : expected.get(row.name);
    if (!checksum || row.checksum !== checksum) throw new Error(`Unknown checksum or migration: ${row.name}`);
  }
  const applied = new Set(ledger.map(r => r.name));
  const bridged = applied.has(RECONCILIATION);
  if ((historical || bridged) !== Boolean(record) || bridged !== Boolean(bridge)) throw new Error("Partial reconciliation marker/ledger state.");
  const origin = feature ? FEATURE_LINEAGE : "canonical";
  const satisfied: Record<string,string> = feature ? { [SATISFIED_MIGRATION]: expected.get(SATISFIED_MIGRATION)! } : {};
  const canonicalPrefix = Object.fromEntries(migrations.filter(m => m.name < RECONCILIATION).map(m => [m.name,m.checksum]));
  const sourcePrefix = feature ? { ...canonicalPrefix, ...known } : canonicalPrefix;
  if (feature) delete sourcePrefix[SATISFIED_MIGRATION];
  if (record) {
    const oldPrefix = feature ? known : Object.fromEntries(migrations.filter(m => m.name < HISTORICAL_RECONCILIATION && !m.name.startsWith("0031")).map(m => [m.name,m.checksum]));
    if (historical && Object.entries(oldPrefix).some(([name,checksum]) => !ledger.some(r => r.name === name && r.checksum === checksum)))
      throw new Error("Partial historical reconciliation lineage.");
    const prefix = historical ? oldPrefix : sourcePrefix;
    if (record.id !== (historical ? "0031" : "0033") || record.origin !== origin || !exactSnapshot(record.source_ledger,prefix) || !same(record.satisfied_migrations,satisfied))
      throw new Error("Invalid reconciliation evidence.");
  }
  const bridgeSatisfied = historical ? satisfied : { ...satisfied, [HISTORICAL_RECONCILIATION]: HISTORICAL_CHECKSUM };
  const manifest = Object.fromEntries(migrations.filter(m => m.name <= RECONCILIATION).map(m => [m.name,m.checksum]));
  if (bridge) {
    const prefix = historical ? { ...sourcePrefix, [HISTORICAL_RECONCILIATION]: HISTORICAL_CHECKSUM } : sourcePrefix;
    if (!exactSnapshot(bridge.source_ledger,prefix) || !same(bridge.canonical_manifest,manifest) || !same(bridge.satisfied_migrations,bridgeSatisfied))
      throw new Error("Invalid bridge evidence.");
  }
  // Ignore only the explicitly validated alternate 0031 when checking the
  // canonical prefix. It may precede newly introduced Lazy Computer migrations.
  let gap = false;
  for (const migration of migrations) {
    if (feature && migration.name === SATISFIED_MIGRATION) continue;
    if (!applied.has(migration.name)) gap = true;
    else if (gap) throw new Error("Noncontiguous migration ledger.");
  }
  return { origin, historical, satisfied, bridgeSatisfied, manifest,
    pending: migrations.filter(m => !applied.has(m.name) && !(feature && m.name === SATISFIED_MIGRATION)) };
}

// Executed inside the same locked transaction as the forward bridge, before skipping any DDL.
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
  const records = marker?.present ? await database.query("SELECT id,origin,source_ledger,satisfied_migrations FROM sofie_migration_reconciliations") : [];
  const [bridgeTable] = await database.query("SELECT to_regclass('sofie_migration_bridge_receipts') AS present");
  const bridges = bridgeTable?.present ? await database.query("SELECT id,source_ledger,canonical_manifest,satisfied_migrations FROM sofie_migration_bridge_receipts") : [];
  if (records.length > 1 || bridges.length > 1 || (bridgeTable?.present && bridges[0]?.id !== '0033')) throw new Error("Partial or ambiguous bridge evidence.");
  const plan = planMigrations(migrations, ledger, records[0] as unknown as ReconciliationRecord | undefined, bridges[0] as unknown as BridgeRecord | undefined);
  const historicalSource = await readFile(new URL(`./historical-migrations/${HISTORICAL_RECONCILIATION}`,import.meta.url),"utf8");
  if (createHash("sha256").update(historicalSource).digest("hex") !== HISTORICAL_CHECKSUM) throw new Error("Historical reconciliation source changed.");
  const historicalStatements = splitSqlStatements(historicalSource);
  // Existing databases must reject ambiguous ownership before any new migration.
  // The same check runs again under the bridge transaction's table locks.
  if (ledger.length && !records.length && plan.pending.some(m => m.name === RECONCILIATION)) {
    const [files] = await database.query("SELECT to_regclass('chat_files') AS present");
    if (files?.present) await database.query(historicalStatements.find(sql => sql.includes('DO $ownership$'))!);
  }
  // Validate feature equivalence before any new migration can mutate its schema.
  if (plan.origin === FEATURE_LINEAGE) await database.query(VERIFY_ACTION_BINDING);
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
    if (migration.name === RECONCILIATION && !plan.historical) {
      statements.push(...historicalStatements.map(sql => ({ sql })));
    }
    statements.push(...migration.statements.map(sql => ({ sql })));
    if (migration.name === RECONCILIATION && !plan.historical) statements.push({
      sql: `INSERT INTO sofie_migration_reconciliations(id,origin,source_ledger,satisfied_migrations)
        SELECT '0033',$1,jsonb_agg(jsonb_build_object('name',name,'checksum',checksum,'applied_at',applied_at) ORDER BY name),$2::jsonb
        FROM sofie_schema_migrations`,
      params: [plan.origin, JSON.stringify(plan.satisfied)],
    });
    if (migration.name === RECONCILIATION) statements.push({
      sql: `INSERT INTO sofie_migration_bridge_receipts(id,source_ledger,canonical_manifest,satisfied_migrations)
        SELECT '0033',jsonb_agg(jsonb_build_object('name',name,'checksum',checksum,'applied_at',applied_at) ORDER BY name),$1::jsonb,$2::jsonb FROM sofie_schema_migrations`,
      params: [JSON.stringify(plan.manifest),JSON.stringify(plan.bridgeSatisfied)],
    });
    statements.push({ sql: "INSERT INTO sofie_schema_migrations(name,checksum) VALUES($1,$2)", params: [migration.name, migration.checksum] });
    await database.transaction(statements);
    ledger.push({ name: migration.name, checksum: migration.checksum });
    log(`Applied ${migration.name}`);
  }
  return plan;
}
