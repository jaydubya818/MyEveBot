import { createHash } from "node:crypto";
import type { DeliveryObservation } from "./delivery.ts";

/** MyApps rollback decision for an observed delivery. Pure: it names the exact restore target; MyApps performs it. */
/** `environment` is the journey profile's release environment (the frozen qualification one, or a parameterized private-beta one). */
export type InstallationIdentity = { environment: string; installationId: string };
export type RollbackPlan =
  | { kind: "RESTORE_REVISION"; installation: InstallationIdentity; revisionId: string; revisionSha256: string; restorePointId: string }
  | { kind: "REMOVE_INSTALLATION"; installation: InstallationIdentity; absenceAuthenticationSha256: string; restorePointId: string };
export class RollbackRefused extends Error { constructor(readonly code: string) { super(code); } }

export function planRollback(observation: Pick<DeliveryObservation, "environment" | "priorRevision" | "rollbackRestorePointId">, installation: InstallationIdentity): RollbackPlan {
  if (!installation?.installationId || installation.environment !== observation.environment) throw new RollbackRefused("QDEV_ROLLBACK_INSTALLATION_IDENTITY");
  if (!observation.rollbackRestorePointId) throw new RollbackRefused("QDEV_ROLLBACK_NO_RESTORE_POINT");
  const p = observation.priorRevision;
  return p.kind === "REVISION"
    ? { kind: "RESTORE_REVISION", installation, revisionId: p.id, revisionSha256: p.sha256, restorePointId: observation.rollbackRestorePointId }
    : { kind: "REMOVE_INSTALLATION", installation, absenceAuthenticationSha256: p.authenticationSha256, restorePointId: observation.rollbackRestorePointId };
}

/**
 * Authenticated absence of a first installation, bound to the app, owner, project AND installation identity (environment + installationId), so an
 * absence captured under one installation can never authorize removal under another. The only formula; the reader and the release controller share it.
 */
export const absenceAuthenticationSha256 = (scope: { appId: string; ownerId: string; projectSha256: string; installation: InstallationIdentity }): string =>
  createHash("sha256").update(JSON.stringify({ kind: "ABSENT", appId: scope.appId, ownerId: scope.ownerId, projectSha256: scope.projectSha256,
    environment: scope.installation.environment, installationId: scope.installation.installationId })).digest("hex");
