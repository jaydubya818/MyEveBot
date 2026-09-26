import { randomUUID } from "node:crypto";
import { inTransaction, managedDb } from "./db";
import { canTransition, type ManagedEveState } from "./state";

export async function transitionEnvironment(input: {
  id: string;
  from: ManagedEveState;
  to: ManagedEveState;
  kind: string;
  detail?: Record<string, string | number | boolean | null>;
}): Promise<void> {
  if (!canTransition(input.from, input.to)) throw new Error(`Invalid managed Eve transition: ${input.from} → ${input.to}`);
  await inTransaction(async (client) => {
    const updated = await client.query(
      "UPDATE managed_eve_environments SET state=$1,updated_at=now() WHERE id=$2 AND state=$3",
      [input.to, input.id, input.from],
    );
    if (updated.rowCount !== 1) throw new Error("Managed Eve state changed; refresh before retrying");
    await client.query(
      "INSERT INTO managed_eve_events (id,environment_id,kind,detail) VALUES ($1,$2,$3,$4)",
      [`evt_${randomUUID().replaceAll("-", "").slice(0, 24)}`, input.id, input.kind, JSON.stringify(input.detail ?? {})],
    );
  });
}

export async function recordProvisionedDeployment(input: {
  id: string;
  projectId: string;
  deploymentId: string;
  templateRelease: number;
}): Promise<void> {
  const result = await managedDb().query(
    "UPDATE managed_eve_environments SET project_id=$1,deployment_id=$2,template_release=$3,state='deploying',updated_at=now() WHERE id=$4 AND state='provisioning'",
    [input.projectId, input.deploymentId, input.templateRelease, input.id],
  );
  if (result.rowCount !== 1) throw new Error("Managed Eve deployment state changed");
}

export async function markProvisionFailure(id: string, stage: string, summary: string): Promise<void> {
  await managedDb().query(
    "UPDATE managed_eve_environments SET state='failed',last_error_stage=$1,last_error_summary=$2,updated_at=now() WHERE id=$3 AND state IN ('provisioning','deploying','verifying')",
    [stage.slice(0, 80), summary.slice(0, 500), id],
  );
}
