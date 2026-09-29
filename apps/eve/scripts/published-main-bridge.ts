import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import manifest from "./published-main-lineage.json" with { type: "json" };
import type { Migration, LedgerRow, MigrationDatabase } from "./migration-runner.ts";

export const PUBLISHED_MAIN_BRIDGE = "0068_published_main_lineage_bridge.sql";
const legacy = manifest.legacy as Record<string, string>;
const targets = manifest.satisfied as Record<string, string>;
const aliases: Record<string, string> = {
  "0039_app_settings.sql": "0040_app_settings.sql",
  "0040_relay_message_delegations.sql": "0062_relay_message_delegations.sql",
};
interface Receipt { id: string; origin: string; source_ledger: LedgerRow[]; satisfied_migrations: Record<string, string> }
const same = (a: Record<string,string>, b: Record<string,string>) =>
  Object.keys(a).length === Object.keys(b).length && Object.entries(a).every(([key,value]) => b[key] === value);
const timestamp = (value: unknown) => new Date(value as string).getTime();

// Compare complete relevant table definitions under table locks. A familiar name
// alone is not evidence that the original DDL is semantically satisfied.
function verifySchema(withDelegations: boolean) {
  return `DO $published_main$
  DECLARE pair record; actual_shape jsonb; expected_shape jsonb; relation regclass;
  BEGIN
    LOCK TABLE app_settings IN SHARE ROW EXCLUSIVE MODE;
    CREATE TEMP TABLE consolidation_expected_settings (
      name text PRIMARY KEY, value text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
    ) ON COMMIT DROP;
    ${withDelegations ? `LOCK TABLE myeve_relay_message_delegations IN SHARE ROW EXCLUSIVE MODE;
    CREATE TEMP TABLE consolidation_expected_delegations (
      owner_id text NOT NULL REFERENCES myeve_relay_connections(owner_id) ON DELETE CASCADE,
      agent_id text NOT NULL, grantee_owner_id text NOT NULL, grantee_agent_id text NOT NULL,
      relay_delegation_id text NOT NULL, credential_encrypted text NOT NULL,
      expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (owner_id, agent_id, grantee_owner_id, grantee_agent_id)
    ) ON COMMIT DROP;` : ""}
    FOR pair IN SELECT * FROM (VALUES
      ('app_settings'::regclass, 'pg_temp.consolidation_expected_settings'::regclass)
      ${withDelegations ? ", ('myeve_relay_message_delegations'::regclass, 'pg_temp.consolidation_expected_delegations'::regclass)" : ""}
    ) AS pairs(actual, expected) LOOP
      actual_shape := NULL; expected_shape := NULL;
      FOREACH relation IN ARRAY ARRAY[pair.actual, pair.expected] LOOP
        SELECT jsonb_build_object(
          'columns', (SELECT jsonb_agg(jsonb_build_array(a.attname, format_type(a.atttypid,a.atttypmod), a.attnotnull, pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum)
            FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
            WHERE a.attrelid=relation AND a.attnum>0 AND NOT a.attisdropped),
          'constraints', (SELECT jsonb_agg(jsonb_build_array(contype,pg_get_constraintdef(oid),convalidated,condeferrable,condeferred) ORDER BY contype,pg_get_constraintdef(oid)) FROM pg_constraint WHERE conrelid=relation),
          'security', (SELECT jsonb_build_array(relkind,relrowsecurity,relforcerowsecurity) FROM pg_class WHERE oid=relation)
        ) INTO expected_shape;
        IF actual_shape IS NULL THEN actual_shape := expected_shape; END IF;
      END LOOP;
      IF actual_shape IS DISTINCT FROM expected_shape THEN RAISE EXCEPTION 'Published main schema drift: %', pair.actual; END IF;
    END LOOP;
  END $published_main$`;
}

/** Recognize only the published 0039[/0040] lineage, preserving its immutable
 * ledger and the pre-existing 0033 bridge. The receipt records equivalence;
 * it never claims that the differently named canonical DDL was executed. */
export async function preparePublishedMainBridge(
  database: MigrationDatabase, migrations: Migration[], ledger: LedgerRow[],
  validatePrefix: (source: LedgerRow[]) => void,
): Promise<{ ledger: LedgerRow[]; satisfied: Record<string,string> }> {
  const [table] = await database.query("SELECT to_regclass('sofie_published_main_bridge') AS present");
  const receipts = table?.present ? await database.query("SELECT id,origin,source_ledger,satisfied_migrations FROM sofie_published_main_bridge") as unknown as Receipt[] : [];
  if (receipts.length > 1) throw new Error("Ambiguous published main bridge evidence.");
  const originalRows = ledger.filter(row => Object.hasOwn(legacy,row.name));
  if (!originalRows.length) {
    if (receipts.length) throw new Error("Published main bridge without its source lineage.");
    return { ledger, satisfied: {} };
  }
  const migration = migrations.find(row => row.name === PUBLISHED_MAIN_BRIDGE);
  if (!migration) throw new Error("Published main upgrade requires migration 0068.");
  const expected = new Map(migrations.map(row => [row.name,row.checksum]));
  if (!originalRows.some(row => row.name === "0039_app_settings.sql")) throw new Error("Partial published main lineage.");
  for (const row of originalRows) if (row.checksum !== legacy[row.name]) throw new Error("Unknown published main migration checksum.");
  const satisfied = Object.fromEntries(originalRows.map(row => [aliases[row.name],targets[aliases[row.name]]]));
  for (const [name,checksum] of Object.entries(satisfied)) if (expected.get(name) !== checksum) throw new Error("Published main equivalence target changed.");
  for (const [name,checksum] of Object.entries(legacy)) {
    const bytes = await readFile(new URL(`./historical-migrations/${name}`,import.meta.url));
    if (createHash("sha256").update(bytes).digest("hex") !== checksum) throw new Error("Published main historical migration bytes changed.");
  }
  const schemaCheck = verifySchema(originalRows.some(row => row.name === "0040_relay_message_delegations.sql"));
  let receipt = receipts[0];
  if (!receipt) {
    if (table?.present || ledger.some(row => row.name >= "0039" && !Object.hasOwn(legacy,row.name))) throw new Error("Unrecorded mixed published main migration lineage.");
    validatePrefix(ledger.filter(row => !Object.hasOwn(legacy,row.name)));
    await database.transaction([
      {sql:"SET LOCAL lock_timeout='5s'"}, {sql:"SET LOCAL statement_timeout='30s'"},
      {sql:"LOCK TABLE sofie_schema_migrations IN EXCLUSIVE MODE"},
      {sql:"SELECT 1 / ((SELECT coalesce(jsonb_object_agg(name,checksum),'{}'::jsonb) FROM sofie_schema_migrations) = $1::jsonb)::int AS ledger_unchanged",params:[JSON.stringify(Object.fromEntries(ledger.map(row=>[row.name,row.checksum])))]},
      {sql:schemaCheck}, ...migration.statements.map(sql=>({sql})),
      {sql:"INSERT INTO sofie_published_main_bridge(id,origin,source_ledger,satisfied_migrations) SELECT '0068',$1,jsonb_agg(jsonb_build_object('name',name,'checksum',checksum,'applied_at',applied_at) ORDER BY name),$2::jsonb FROM sofie_schema_migrations",params:[manifest.origin,JSON.stringify(satisfied)]},
      {sql:"INSERT INTO sofie_schema_migrations(name,checksum) VALUES($1,$2)",params:[migration.name,migration.checksum]},
    ]);
    ledger = await database.query("SELECT name,checksum,applied_at FROM sofie_schema_migrations ORDER BY name") as unknown as LedgerRow[];
    [receipt] = await database.query("SELECT id,origin,source_ledger,satisfied_migrations FROM sofie_published_main_bridge") as unknown as Receipt[];
  }
  if (receipt.id !== "0068" || receipt.origin !== manifest.origin || !Array.isArray(receipt.source_ledger) || !same(receipt.satisfied_migrations,satisfied)) throw new Error("Invalid published main bridge receipt.");
  const source = receipt.source_ledger;
  if (new Set(source.map(row=>row.name)).size !== source.length || source.some(row=>row.name >= "0039" && !Object.hasOwn(legacy,row.name))) throw new Error("Invalid published main source snapshot.");
  validatePrefix(source.filter(row=>!Object.hasOwn(legacy,row.name)));
  if (!same(Object.fromEntries(source.filter(row=>Object.hasOwn(legacy,row.name)).map(row=>[row.name,row.checksum])),Object.fromEntries(originalRows.map(row=>[row.name,row.checksum])))) throw new Error("Published main source aliases changed.");
  for (const row of source) {
    const current=ledger.find(value=>value.name===row.name);
    if (!current || current.checksum!==row.checksum || !Number.isFinite(timestamp(row.applied_at)) || timestamp(current.applied_at)!==timestamp(row.applied_at)) throw new Error("Published main original ledger was modified.");
  }
  if (ledger.find(row=>row.name===migration.name)?.checksum!==migration.checksum) throw new Error("Published main bridge ledger mismatch.");
  if (ledger.some(row=>Object.hasOwn(satisfied,row.name))) throw new Error("Semantically satisfied migration cannot claim historical execution.");
  // Read-only schema comparison in its own transaction also protects reruns.
  await database.transaction([{sql:"SET LOCAL lock_timeout='5s'"},{sql:schemaCheck}]);
  return {ledger:ledger.filter(row=>!Object.hasOwn(legacy,row.name) && row.name!==migration.name),satisfied:{...satisfied,[migration.name]:migration.checksum}};
}
