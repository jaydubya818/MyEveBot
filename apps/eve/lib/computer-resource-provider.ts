import { Sandbox, Snapshot } from "@vercel/sandbox";
import { consumeComputerLifecycleAuthority, type ComputerLifecycleProvider } from "./action-gateway.ts";
import { computerResourceEnvironment, resourceTags, type ComputerResource } from "./computer-resource-store.ts";
import { computerProviderCredentials } from "./computer-template-vercel.ts";

export function providerMissing(error: unknown): boolean {
  return !!error && typeof error === "object" && (error as { response?: {status?: number} }).response?.status === 404;
}
export function assertOwnedComputer(sandbox: Sandbox, row: ComputerResource) {
  if (row.environment !== computerResourceEnvironment() || sandbox.name !== row.resource_name ||
    Object.entries(resourceTags(row)).some(([key,value]) => sandbox.tags?.[key] !== value)) throw new Error("Computer provider ownership mismatch.");
}
export async function findOwnedComputer(row: ComputerResource, signal = AbortSignal.timeout(5_000)) {
  if (row.environment !== computerResourceEnvironment()) throw new Error("Computer environment mismatch.");
  try {
    const sandbox = await Sandbox.get({ ...computerProviderCredentials(), name: row.resource_name, resume: false, signal });
    assertOwnedComputer(sandbox, row); return sandbox;
  } catch (error) { if (providerMissing(error)) return null; throw error; }
}
export function computerProviderSession(sandbox: Sandbox) {
  try { return sandbox.currentSession(); } catch { return null; }
}
export const computerResourceProvider: ComputerLifecycleProvider = {
  async execute(operation, row, authority, store) {
    await consumeComputerLifecycleAuthority(authority, operation, row);
    const signal = AbortSignal.timeout(8_000);
    let sandbox = await findOwnedComputer(row, signal);
    if (operation === "stop") {
      const before = sandbox ? computerProviderSession(sandbox) : null;
      if (sandbox && before && !["stopped","failed","aborted"].includes(before.status)) await sandbox.stop({ signal });
      sandbox = await findOwnedComputer(row, signal);
      if (sandbox?.currentSnapshotId && sandbox.currentSnapshotId !== row.source_snapshot_id) {
        const snapshot = await Snapshot.get({ ...computerProviderCredentials(), snapshotId: sandbox.currentSnapshotId, signal });
        // Never inherit cleanup authority for the shared preparation snapshot.
        const sessionId=before?.sessionId ?? row.provider_session_id;
        if (sessionId && snapshot.sourceSessionId !== sessionId) throw new Error("Computer snapshot ownership mismatch.");
        await store.recordSnapshot(row, snapshot.snapshotId);
      }
      const after=sandbox ? computerProviderSession(sandbox) : null;
      return !after || ["stopped","failed","aborted"].includes(after.status);
    }
    if (operation === "delete") {
      // Every effect rechecks the durable claim; all snapshot IDs were provider-observed under exact ownership.
      if (sandbox) {
        if (!await store.validClaim(row)) throw new Error("Computer cleanup fenced.");
        await sandbox.delete({ deleteOrphanSnapshots: true, signal });
      }
      for (const id of row.owned_snapshot_ids) {
        if (id === row.source_snapshot_id || !await store.validClaim(row)) throw new Error("Computer snapshot cleanup fenced.");
        try {
          const snapshot = await Snapshot.get({ ...computerProviderCredentials(), snapshotId: id, signal });
          if (snapshot.status !== "deleted") await snapshot.delete({ signal });
        } catch (error) { if (!providerMissing(error)) throw error; }
      }
      return true;
    }
    if (sandbox) return false;
    for (const snapshotId of row.owned_snapshot_ids) {
      try { if ((await Snapshot.get({ ...computerProviderCredentials(), snapshotId, signal })).status !== "deleted") return false; }
      catch (error) { if (!providerMissing(error)) throw error; }
    }
    return true;
  },
};
