import { QDEV_BASELINE } from "../external-alpha/qualification-accounting.ts";

/**
 * MyEve-side check of a Relay developer-tool grant for the isolated journey.
 * The real grant is created by the GitHub/Relay administrator and enforced by
 * Relay; this function is the contract our callers present BEFORE a Relay call
 * and the denial matrix the real enrollment must satisfy. Tokens never appear
 * here: a grant names a connection, never a credential.
 */
export type RelayDeveloperGrant = {
  connectionId: string; repository: string; baseCommit: string; outputBranch: string;
  permissions: { metadata: "read"; contents: "read" | "write"; actions: "read"; deployments: "read" };
  repositoryAdmin: false; workflowEdit: false; productionDeployment: false;
};
export type RelayAction =
  | { kind: "read_metadata" | "read_contents" | "read_actions" | "read_deployments"; repository: string; ref?: string }
  | { kind: "write_contents"; repository: string; branch: string; baseCommit: string; force?: boolean; path: string }
  | { kind: "write_deployment" | "edit_workflow" | "administer_repository"; repository: string };

export class RelayDenied extends Error {
  constructor(readonly code: string) { super(code); }
}

export function assertRelayGrant(grant: RelayDeveloperGrant) {
  if (grant.repository !== QDEV_BASELINE.repository || grant.outputBranch !== QDEV_BASELINE.outputBranch
    || grant.baseCommit !== QDEV_BASELINE.inputCommit) throw new RelayDenied("QDEV_RELAY_GRANT_SCOPE");
  if (grant.repositoryAdmin !== false || grant.workflowEdit !== false || grant.productionDeployment !== false
    || grant.permissions.deployments !== "read" || grant.permissions.actions !== "read" || grant.permissions.metadata !== "read")
    throw new RelayDenied("QDEV_RELAY_GRANT_TOO_BROAD");
  if (/token|secret|password|bearer/i.test(JSON.stringify(grant))) throw new RelayDenied("QDEV_RELAY_GRANT_CREDENTIAL");
}

export function authorizeRelayAction(grant: RelayDeveloperGrant, action: RelayAction): true {
  assertRelayGrant(grant);
  if (action.repository !== grant.repository) throw new RelayDenied("QDEV_RELAY_FOREIGN_REPOSITORY");
  switch (action.kind) {
    case "read_metadata": case "read_contents": case "read_actions": case "read_deployments": return true;
    case "write_contents": {
      if (grant.permissions.contents !== "write") throw new RelayDenied("QDEV_RELAY_WRITE_NOT_GRANTED");
      // Output only on the approved branch, never rewriting history, never main, never workflows.
      if (action.branch !== grant.outputBranch || action.branch === "main") throw new RelayDenied("QDEV_RELAY_BRANCH_DENIED");
      if (action.force) throw new RelayDenied("QDEV_RELAY_FORCE_DENIED");
      if (/^\.github\/(workflows|actions)\//.test(action.path.replace(/^\/+/, "")) || /(^|\/)\.\.(\/|$)/.test(action.path))
        throw new RelayDenied("QDEV_RELAY_PATH_DENIED");
      return true;
    }
    default: throw new RelayDenied("QDEV_RELAY_ACTION_DENIED");
  }
}
