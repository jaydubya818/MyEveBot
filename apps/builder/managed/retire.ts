import { randomUUID } from "node:crypto";
import { getProject, listStores, type StorageStore } from "@/lib/vercel-api";
import { managedDb } from "./db";
import { transitionEnvironment } from "./environments";
import { managedProjectName } from "./state";

interface RetirementRow {
  id: string;
  state: string;
  project_name: string;
  project_id: string | null;
  database_store_id: string | null;
  blob_store_id: string | null;
  last_export_verified_at: Date | null;
  database_deleted_at: Date | null;
  project_deleted_at: Date | null;
}

export function assertRetirementScope(input: {
  id: string;
  row: RetirementRow;
  confirmProjectName: string;
  confirmDatabaseStoreId: string;
  exportSha256: string;
  recordedSha256: string | null;
  now?: Date;
}): void {
  const { row } = input;
  if (row.id !== input.id || row.project_name !== managedProjectName(input.id) ||
      !row.project_id || !row.database_store_id || row.blob_store_id ||
      !["paused", "retiring"].includes(row.state) ||
      input.confirmProjectName !== row.project_name ||
      input.confirmDatabaseStoreId !== row.database_store_id ||
      !/^[a-f0-9]{64}$/.test(input.exportSha256) ||
      input.exportSha256 !== input.recordedSha256) {
    throw new Error("Managed retirement identity or export confirmation does not match");
  }
  const age = (input.now ?? new Date()).getTime() - (row.last_export_verified_at?.getTime() ?? 0);
  if (age < 0 || age > 24 * 60 * 60 * 1000) throw new Error("Owner export must be verified within 24 hours");
}

export function assertOwnedNeonStore(store: StorageStore, projectName: string, projectId: string): void {
  if (store.kind !== "integration" || store.ownership !== "owned" ||
      !/neon/i.test(store.productName ?? "") ||
      !store.name.startsWith(projectName.slice(0, 16)) ||
      store.connections.some((connection) => connection.projectId !== projectId) ||
      store.connections.length > 1) {
    throw new Error("Dedicated Neon ownership and project connection could not be verified");
  }
}

async function deleteVercelResource(path: string, token: string, teamId: string | null): Promise<void> {
  const url = new URL(`https://api.vercel.com${path}`);
  if (teamId) url.searchParams.set("teamId", teamId);
  const response = await fetch(url, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`Vercel retirement step returned ${response.status}`);
}

async function recordStep(id: string, column: "database_deleted_at" | "project_deleted_at", kind: string): Promise<void> {
  await managedDb().query(
    `UPDATE managed_eve_environments SET ${column}=coalesce(${column},now()),updated_at=now() WHERE id=$1 AND state='retiring'`,
    [id],
  );
  await managedDb().query(
    "INSERT INTO managed_eve_events (id,environment_id,kind) VALUES ($1,$2,$3)",
    [`evt_${randomUUID().replaceAll("-", "").slice(0, 24)}`, id, kind],
  );
}

export async function retireManagedEve(input: {
  id: string;
  confirmProjectName: string;
  confirmDatabaseStoreId: string;
  exportSha256: string;
}): Promise<{ id: string; state: "retired" }> {
  if (process.env.MANAGED_EVE_RETIREMENT_ENABLED !== "true") throw new Error("Managed retirement is not enabled");
  const token = process.env.MANAGED_EVE_VERCEL_TOKEN;
  if (!token) throw new Error("Operator deployment access is unavailable");
  const result = await managedDb().query<RetirementRow & { export_sha256: string | null }>(
    `SELECT e.id,e.state,e.project_name,e.project_id,e.database_store_id,e.blob_store_id,
            e.last_export_verified_at,e.database_deleted_at,e.project_deleted_at,
            (SELECT detail->>'sha256' FROM managed_eve_events
             WHERE environment_id=e.id AND kind='owner_export_verified'
             ORDER BY created_at DESC LIMIT 1) AS export_sha256
     FROM managed_eve_environments e WHERE e.id=$1`,
    [input.id],
  );
  const row = result.rows[0];
  if (!row) throw new Error("Unknown managed Eve");
  assertRetirementScope({ ...input, row, recordedSha256: row.export_sha256 });
  const teamId = process.env.MANAGED_EVE_VERCEL_TEAM_ID || null;
  const project = await getProject(token, teamId, row.project_name);
  if (project && (project.id !== row.project_id || project.paused !== true || project.hasGitRepository)) {
    throw new Error("The exact managed project is not paused and verified");
  }
  if (row.state === "paused" && !project) throw new Error("Project disappeared before retirement began");
  const stores = await listStores(token, teamId);
  const store = stores.find((item) => item.id === row.database_store_id);
  if (store) assertOwnedNeonStore(store, row.project_name, row.project_id!);
  if (row.state === "paused" && !store) throw new Error("Dedicated Neon resource disappeared before retirement began");
  if (row.state === "paused" && store?.connections.length !== 1) {
    throw new Error("Dedicated Neon resource must be connected only to this project");
  }
  if (row.state === "paused") {
    await transitionEnvironment({ id: row.id, from: "paused", to: "retiring", kind: "retirement_started" });
  }

  // The paused project cannot write while its dedicated database is removed.
  // Each step is verified and persisted so a partial failure can be resumed.
  if (store) {
    if (store.connections.length === 1) {
      await deleteVercelResource(
        `/v1/storage/stores/${encodeURIComponent(store.id)}/connections/${encodeURIComponent(store.connections[0].id)}`,
        token, teamId,
      );
    }
    const disconnected = (await listStores(token, teamId)).find((item) => item.id === store.id);
    if (!disconnected || disconnected.connections.length !== 0) {
      throw new Error("Neon project connection removal could not be verified");
    }
    await deleteVercelResource(`/v1/storage/stores/integration/${encodeURIComponent(store.id)}`, token, teamId);
  }
  if ((await listStores(token, teamId)).some((item) => item.id === row.database_store_id)) {
    throw new Error("Neon resource deletion could not be verified");
  }
  if (!row.database_deleted_at) await recordStep(row.id, "database_deleted_at", "database_deletion_verified");

  if (project) await deleteVercelResource(`/v9/projects/${encodeURIComponent(project.id)}`, token, teamId);
  if (await getProject(token, teamId, row.project_name)) throw new Error("Project deletion could not be verified");
  if (!row.project_deleted_at) await recordStep(row.id, "project_deleted_at", "project_deletion_verified");
  await transitionEnvironment({ id: row.id, from: "retiring", to: "retired", kind: "retirement_complete" });
  await managedDb().query("UPDATE managed_eve_environments SET retired_at=now(),updated_at=now() WHERE id=$1 AND state='retired'", [row.id]);
  return { id: row.id, state: "retired" };
}
