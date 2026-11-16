import { readFile } from "node:fs/promises";
import pg from "pg";
import { CapabilityAdmissionError, assertQualifiedCapabilityRuntimeRole } from "@myeve/capability-enforcement";
import { CURRENT_DATABASE_MIGRATION } from "../../lib/database-schema.ts";

const [urlFile] = process.argv.slice(2);
if (!urlFile) {
  console.error("Usage: node --import tsx scripts/private-beta/check-hosted-app-database.ts <app-runtime-url-file>");
  process.exit(2);
}

async function check() {
  const connectionString = (await readFile(urlFile, "utf8")).trim();
  const client = new pg.Client({ connectionString, connectionTimeoutMillis: 5000, statement_timeout: 5000 });
  try {
    await client.connect();
    await client.query("BEGIN READ ONLY");
    const { rows: [schema] } = await client.query(
      "SELECT EXISTS (SELECT 1 FROM public.sofie_schema_migrations WHERE name=$1) AS ready",
      [CURRENT_DATABASE_MIGRATION],
    );
    console.log(`Hosted app schema ${schema?.ready ? "PASS" : "BLOCKED"} (${CURRENT_DATABASE_MIGRATION})`);
    if (!schema?.ready) return 1;
    await assertQualifiedCapabilityRuntimeRole(client);
    console.log("Hosted app runtime role PASS");
    return 0;
  } finally {
    await client.end();
  }
}

try {
  process.exitCode = await check();
} catch (error) {
  const state = error instanceof CapabilityAdmissionError ? error.reason : "DATABASE_CHECK_UNAVAILABLE";
  console.error(`Hosted app runtime BLOCKED (${state})`);
  process.exitCode = 1;
}
