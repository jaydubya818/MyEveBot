import assert from "node:assert/strict";
import { it } from "node:test";
import { assertOwnedNeonStore, assertRetirementScope } from "./retire";
import { managedProjectName } from "./state";

const id = `env_${"a".repeat(24)}`;
const projectName = managedProjectName(id);
const projectId = "prj_disposable_test";
const storeId = "store_disposable_test";
const sha256 = "b".repeat(64);
const now = new Date("2026-09-26T18:00:00Z");
const row = {
  id, state: "paused", project_name: projectName, project_id: projectId,
  database_store_id: storeId, blob_store_id: null,
  last_export_verified_at: new Date("2026-09-26T17:00:00Z"),
  database_deleted_at: null, project_deleted_at: null,
};

it("requires the exact paused Eve, database, and recent checked owner export", () => {
  const input = { id, row, confirmProjectName: projectName, confirmDatabaseStoreId: storeId,
    exportSha256: sha256, recordedSha256: sha256, now };
  assert.doesNotThrow(() => assertRetirementScope(input));
  assert.throws(() => assertRetirementScope({ ...input, confirmProjectName: "another-project" }));
  assert.throws(() => assertRetirementScope({ ...input, exportSha256: "c".repeat(64) }));
  assert.throws(() => assertRetirementScope({ ...input, row: { ...row, state: "ready" } }));
  assert.throws(() => assertRetirementScope({ ...input, row: { ...row, blob_store_id: "unexported-blob" } }));
  assert.throws(() => assertRetirementScope({ ...input, now: new Date("2026-09-28T18:00:00Z") }));
});

it("refuses shared or externally owned Neon resources", () => {
  const store = {
    id: storeId, name: `${projectName.slice(0, 16)}-db-123456789abc`,
    kind: "integration" as const, productName: "Neon Postgres", ownership: "owned" as const,
    connections: [{ id: "conn_disposable", projectId }],
  };
  assert.doesNotThrow(() => assertOwnedNeonStore(store, projectName, projectId));
  assert.throws(() => assertOwnedNeonStore({ ...store, ownership: "linked" }, projectName, projectId));
  assert.throws(() => assertOwnedNeonStore({ ...store, connections: [
    ...store.connections, { id: "other-connection", projectId: "prj_other" },
  ] }, projectName, projectId));
  assert.throws(() => assertOwnedNeonStore({ ...store, name: "someone-elses-database" }, projectName, projectId));
});
