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

test("database migration completion attributes files to the deployment owner", async () => {
  const runner = await readFile(
    new URL("../scripts/migrate-database.ts", import.meta.url),
    "utf8",
  );

  assert.match(runner, /deploymentOwnerId\(\)/);
  assert.match(runner, /UPDATE chat_files SET owner_id = \$1 WHERE owner_id IS NULL OR owner_id = 'web:owner'/);
  assert.match(runner, /ALTER TABLE chat_files ALTER COLUMN owner_id SET NOT NULL/);
});
