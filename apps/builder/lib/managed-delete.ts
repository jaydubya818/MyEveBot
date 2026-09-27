import type { ManagedEnvironment } from "./managed-environment";

export interface DeletionPermit {
  environmentId: string;
  email: string;
  projectId: string;
  databaseStoreId: string;
  blobStoreId: string | null;
  archiveSha256: string;
  approvedAt: string;
  ownerArchiveDelivered: true;
  confirmation: string;
}

/** Pure gate: no provider call may happen until the exact owner/archive/resources match. */
export function assertDeletionAuthorization(input: {
  permit: DeletionPermit;
  permitSha256: string;
  archiveSha256: string;
  ownerEmail: string;
  projectName: string;
  environment: ManagedEnvironment;
  now?: Date;
}): void {
  const { permit, environment } = input;
  const now = (input.now ?? new Date()).getTime();
  const approvedAt = Date.parse(permit.approvedAt);
  if (!Number.isFinite(approvedAt) || approvedAt > now + 300_000 ||
      permit.email !== input.ownerEmail.toLowerCase() ||
      permit.confirmation !== `DELETE ${permit.environmentId}` ||
      permit.ownerArchiveDelivered !== true ||
      !/^[a-f0-9]{64}$/.test(permit.archiveSha256) ||
      input.archiveSha256 !== permit.archiveSha256) {
    throw new Error("Exact, recent owner deletion authorization and delivered verified archive are required.");
  }
  if (environment.id !== permit.environmentId || environment.email !== permit.email ||
      environment.projectName !== input.projectName ||
      environment.projectId !== permit.projectId ||
      environment.databaseStoreId !== permit.databaseStoreId ||
      environment.blobStoreId !== permit.blobStoreId || !environment.origin ||
      !["healthy", "active", "paused", "deleting"].includes(environment.state) ||
      environment.lastExportSha256 !== permit.archiveSha256 || !environment.lastExportAt ||
      environment.lastExportSource !== "control-plane" ||
      (environment.state === "deleting"
        ? environment.deletionAuthorizationSha256 !== input.permitSha256
        : now - approvedAt > 7 * 86_400_000 ||
          now - Date.parse(environment.lastExportAt) > 86_400_000)) {
    throw new Error("Deletion requires exact managed resource IDs and an owner archive verified within 24 hours.");
  }
}
