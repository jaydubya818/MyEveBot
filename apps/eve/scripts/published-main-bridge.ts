import pinned from "./published-main-d64f2f9.json" with { type: "json" };
import type {
  LedgerRow,
  Migration,
  MigrationDatabase,
  Statement,
} from "./migration-runner.ts";

export const PUBLISHED_MAIN_BRIDGE = "0068_published_main_lineage_bridge.sql";
const aliases = ["0039_app_settings.sql", "0040_relay_message_delegations.sql"];
const equivalences = {
  "0040_app_settings.sql": "0039_app_settings.sql",
  "0062_relay_message_delegations.sql": "0040_relay_message_delegations.sql",
};
type Receipt = {
  source_commit: string;
  source_ledger: LedgerRow[];
  canonical_manifest: Record<string, string>;
  satisfied_migrations: Record<string, { source: string; checksum: string }>;
};
const stable = (value: unknown): string =>
  JSON.stringify(value, (_key, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v).sort(([a], [b]) => a.localeCompare(b)),
        )
      : v,
  );
const schemaQuery =
  "SELECT jsonb_agg(jsonb_build_object(\n 'table',c.relname,'kind',c.relkind,'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity,\n 'columns',(SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'notNull',a.attnotnull,'identity',a.attidentity,'generated',a.attgenerated,'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),\n 'constraints',(SELECT jsonb_agg(jsonb_build_object('name',x.conname,'definition',pg_get_constraintdef(x.oid),'validated',x.convalidated) ORDER BY x.conname) FROM pg_constraint x WHERE x.conrelid=c.oid),\n 'indexes',(SELECT jsonb_agg(jsonb_build_object('definition',pg_get_indexdef(i.indexrelid),'valid',i.indisvalid,'ready',i.indisready) ORDER BY pg_get_indexdef(i.indexrelid)) FROM pg_index i WHERE i.indrelid=c.oid),\n 'triggers',(SELECT count(*) FROM pg_trigger t WHERE t.tgrelid=c.oid AND NOT t.tgisinternal)\n) ORDER BY c.relname) AS value FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('app_settings','myeve_relay_message_delegations')";
export const PUBLISHED_MAIN_SCHEMA = schemaQuery;

/** Recognize the complete pinned published ledger, never a mixed or partial fork. */
export async function publishedMainState(
  database: MigrationDatabase,
  migrations: Migration[],
  ledger: LedgerRow[],
) {
  const [table] = await database.query(
    "SELECT to_regclass('sofie_published_main_bridge') AS present",
  );
  const rows = table?.present
    ? await database.query(
        "SELECT source_commit,source_ledger,canonical_manifest,satisfied_migrations FROM sofie_published_main_bridge",
      )
    : [];
  if (rows.length > 1) throw Error("Ambiguous published-main bridge evidence");
  if (!ledger.some((row) => aliases.includes(row.name))) {
    if (rows.length)
      throw Error("Published-main bridge evidence without its source ledger");
    if (
      table?.present &&
      !ledger.some((row) => row.name === PUBLISHED_MAIN_BRIDGE)
    )
      throw Error("Partial published-main bridge table without ledger entry");
    return null;
  }
  const receipt = rows[0] as unknown as Receipt | undefined;
  const source = ledger.filter((row) => row.name in pinned.migrations);
  if (
    source.length !== Object.keys(pinned.migrations).length ||
    source.some(
      (row) =>
        pinned.migrations[row.name as keyof typeof pinned.migrations] !==
        row.checksum,
    )
  )
    throw Error("Unknown or partial published-main migration lineage");
  const canonical = Object.fromEntries(
    migrations
      .filter((m) => m.name <= PUBLISHED_MAIN_BRIDGE)
      .map((m) => [m.name, m.checksum]),
  );
  if (!canonical[PUBLISHED_MAIN_BRIDGE])
    throw Error("Published-main forward bridge is required");
  for (const [name, checksum] of Object.entries(pinned.migrations)) {
    if (!aliases.includes(name) && canonical[name] !== checksum)
      throw Error("Published-main shared prefix changed");
  }
  for (const [name, checksum] of Object.entries(pinned.equivalents))
    if (canonical[name] !== checksum)
      throw Error("Published-main equivalent migration changed");
  const satisfied = Object.fromEntries(
    Object.entries(equivalences).map(([name, original]) => [
      name,
      { source: original, checksum: canonical[name] },
    ]),
  );
  // The settings migration differs only by its comment; the full live schema is checked below.
  if (
    canonical["0062_relay_message_delegations.sql"] !==
    pinned.migrations["0040_relay_message_delegations.sql"]
  )
    throw Error("Published Relay equivalence changed");
  const normalized = ledger.filter((row) => !aliases.includes(row.name));
  if (receipt) {
    if (
      receipt.source_commit !== pinned.source ||
      stable(receipt.source_ledger) !== stable(source) ||
      stable(receipt.canonical_manifest) !== stable(canonical) ||
      stable(receipt.satisfied_migrations) !== stable(satisfied) ||
      !ledger.some((row) => row.name === PUBLISHED_MAIN_BRIDGE)
    )
      throw Error("Invalid published-main bridge evidence");
    for (const [name, value] of Object.entries(satisfied)) {
      if (normalized.some((row) => row.name === name))
        throw Error("Satisfied migration cannot be claimed as executed");
      normalized.push({ name, checksum: value.checksum });
    }
  } else if (ledger.length !== source.length || table?.present)
    throw Error("Partial published-main bridge state");
  const [schema] = await database.query(schemaQuery);
  if (stable(schema?.value) !== stable(pinned.schema))
    throw Error("Published-main schema equivalence failed");
  return { receipt, source, canonical, satisfied, normalized };
}

/** Commit the whole fork-to-canonical transition atomically, retaining original ledger rows. */
export async function bridgePublishedMain(
  database: MigrationDatabase,
  pending: Migration[],
  ledger: LedgerRow[],
  state: NonNullable<Awaited<ReturnType<typeof publishedMainState>>>,
) {
  const statements: Statement[] = [
    { sql: "SET LOCAL lock_timeout='5s'" },
    { sql: "SET LOCAL statement_timeout='30s'" },
    { sql: "SELECT pg_advisory_xact_lock(730031)" },
    {
      sql: "LOCK TABLE sofie_schema_migrations, app_settings, myeve_relay_message_delegations IN SHARE ROW EXCLUSIVE MODE",
    },
    {
      sql: "SELECT 1 / ((SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY name),'[]'::jsonb) FROM (SELECT name, checksum, to_char(applied_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS applied_at FROM sofie_schema_migrations) m) = $1::jsonb)::int",
      params: [JSON.stringify(ledger)],
    },
    {
      sql: `SELECT 1 / ((${schemaQuery}) = $1::jsonb)::int`,
      params: [JSON.stringify(pinned.schema)],
    },
  ];
  for (const migration of pending) {
    if (migration.name in state.satisfied) continue;
    statements.push(...migration.statements.map((sql) => ({ sql })));
    statements.push({
      sql: "INSERT INTO sofie_schema_migrations(name,checksum) VALUES($1,$2)",
      params: [migration.name, migration.checksum],
    });
  }
  statements.push({
    sql: "INSERT INTO sofie_published_main_bridge(id,source_commit,source_ledger,canonical_manifest,satisfied_migrations) VALUES('0068',$1,$2::jsonb,$3::jsonb,$4::jsonb)",
    params: [
      pinned.source,
      JSON.stringify(state.source),
      JSON.stringify(state.canonical),
      JSON.stringify(state.satisfied),
    ],
  });
  await database.transaction(statements);
}
