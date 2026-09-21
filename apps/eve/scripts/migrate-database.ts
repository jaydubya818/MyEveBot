import { neon } from "@neondatabase/serverless";
import { CURRENT_DATABASE_MIGRATION } from "../lib/database-schema.ts";
import { loadMigrations, runMigrations } from "./migration-runner.ts";

const migrations = await loadMigrations();
if (migrations.at(-1)?.name !== CURRENT_DATABASE_MIGRATION)
  throw new Error(`CURRENT_DATABASE_MIGRATION must match the newest migration (${migrations.at(-1)?.name}).`);
if (process.argv.includes("--check")) {
  console.log(`Validated ${migrations.length} ordered database migration(s).`);
} else {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL is required to apply database migrations.");
  const sql = neon(url);
  await runMigrations({
    query: (statement, params) => sql.query(statement, params),
    transaction: statements => sql.transaction(tx => statements.map(s => tx.query(s.sql, s.params))),
  }, migrations);
}
