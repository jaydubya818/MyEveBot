import type { DeliveryObservation } from "./delivery.ts";

/** MyApps rollback decision for an observed delivery. Pure: it names the exact restore target; MyApps performs it. */
export type InstallationIdentity = { environment: "myeve-qdev-20261029"; installationId: string };
export type RollbackPlan =
  | { kind: "RESTORE_REVISION"; installation: InstallationIdentity; revisionId: string; revisionSha256: string; restorePointId: string }
  | { kind: "REMOVE_INSTALLATION"; installation: InstallationIdentity; absenceAuthenticationSha256: string; restorePointId: string };
export class RollbackRefused extends Error { constructor(readonly code: string) { super(code); } }

export function planRollback(observation: DeliveryObservation, installation: InstallationIdentity): RollbackPlan {
  if (!installation?.installationId || installation.environment !== observation.environment) throw new RollbackRefused("QDEV_ROLLBACK_INSTALLATION_IDENTITY");
  if (!observation.rollbackRestorePointId) throw new RollbackRefused("QDEV_ROLLBACK_NO_RESTORE_POINT");
  const p = observation.priorRevision;
  return p.kind === "REVISION"
    ? { kind: "RESTORE_REVISION", installation, revisionId: p.id, revisionSha256: p.sha256, restorePointId: observation.rollbackRestorePointId }
    : { kind: "REMOVE_INSTALLATION", installation, absenceAuthenticationSha256: p.authenticationSha256, restorePointId: observation.rollbackRestorePointId };
}
