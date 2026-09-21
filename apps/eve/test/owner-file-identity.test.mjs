import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("owner file migration leaves legacy ownership for runtime attribution", async () => {
  const migration = await readFile(
    new URL("../migrations/0017_owner_file_inventory.sql", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(migration, /owner_id text[^\n]*DEFAULT 'web:owner'/);
  assert.match(migration, /ALTER COLUMN owner_id DROP DEFAULT/);
  assert.match(migration, /SET owner_id = NULL WHERE owner_id = 'web:owner'/);
});

test("file attribution requires durable thread evidence, never the deploying owner", async () => {
  const migration = await readFile(new URL("../scripts/historical-migrations/0031_deployed_lineage_reconciliation.sql", import.meta.url), "utf8");
  const runner = await readFile(new URL("../scripts/migrate-database.ts", import.meta.url), "utf8");
  assert.doesNotMatch(runner, /deploymentOwnerId|UPDATE chat_files/);
  assert.match(migration, /Ambiguous file ownership/);
  assert.match(migration, /web_chat_threads t ON t.id=f.thread_id/);
  assert.match(migration, /sofie_file_owner_reconciliations/);
});
