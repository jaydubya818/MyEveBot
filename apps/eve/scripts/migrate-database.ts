import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "@neondatabase/serverless";

import { CURRENT_DATABASE_MIGRATION } from "../lib/database-schema.ts";

const MIGRATION_NAME = /^\d{4}_[a-z0-9_]+\.sql$/;
const STATEMENT_BREAKPOINT = /^\s*-- statement-breakpoint\s*$/m;
const migrationsDirectory = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");

interface Migration {
  checksum: string;
  name: string;
  statements: string[];
}

async function loadMigrations(): Promise<Migration[]> {
  const names = (await readdir(migrationsDirectory))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  if (names.length === 0) throw new Error("No database migrations were found.");

  const versions = new Set<string>();
  return Promise.all(
    names.map(async (name) => {
      if (!MIGRATION_NAME.test(name)) {
        throw new Error(`Invalid migration name '${name}'. Use 0001_descriptive_name.sql.`);
      }
      const version = name.slice(0, 4);
      if (versions.has(version)) throw new Error(`Duplicate migration version '${version}'.`);
      versions.add(version);

      const source = await readFile(join(migrationsDirectory, name), "utf8");
      const statements = source
        .split(STATEMENT_BREAKPOINT)
        .map((statement) => statement.trim())
        .filter(Boolean);
      if (statements.length === 0) throw new Error(`Migration '${name}' has no SQL statements.`);
      return {
        checksum: createHash("sha256").update(source).digest("hex"),
        name,
        statements,
      };
    }),
  );
}

async function main(): Promise<void> {
  const migrations = await loadMigrations();
  if (migrations.at(-1)?.name !== CURRENT_DATABASE_MIGRATION) {
    throw new Error(
      `CURRENT_DATABASE_MIGRATION must match the newest migration (${migrations.at(-1)?.name}).`,
    );
  }
  if (process.argv.includes("--check")) {
    console.log(`Validated ${migrations.length} ordered database migration(s).`);
    return;
  }

  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("DATABASE_URL is required to apply database migrations.");
  // Neon HTTP prepares each query and rejects multi-command migration chunks.
  // A session uses PostgreSQL's simple-query path without rewriting SQL/checksums.
  const client = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 10000 });
  try {
    await client.connect();
    await client.query(`
      CREATE TABLE IF NOT EXISTS sofie_schema_migrations (
        name text PRIMARY KEY,
        checksum text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    const { rows: applied } = await client.query("SELECT name, checksum FROM sofie_schema_migrations");
    const appliedByName = new Map(
      applied.map((row) => [String(row.name), String(row.checksum)]),
    );

    for (const migration of migrations) {
      const previousChecksum = appliedByName.get(migration.name);
      if (previousChecksum !== undefined) {
        if (previousChecksum !== migration.checksum) {
          throw new Error(`Applied migration '${migration.name}' was modified. Add a new migration instead.`);
        }
        console.log(`Already applied ${migration.name}`);
        continue;
      }
      await client.query("BEGIN");
      try {
        for (const statement of migration.statements) await client.query(statement);
        await client.query(
          "INSERT INTO sofie_schema_migrations (name, checksum) VALUES ($1, $2)",
          [migration.name, migration.checksum],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
      console.log(`Applied ${migration.name}`);
    }
  } finally {
    await client.end();
  }
}

await main();
