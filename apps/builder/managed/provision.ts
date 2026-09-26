import { assembleDeployment, templateInfo } from "@/lib/assemble";
import { type AgentConfig, validateConfig } from "@/lib/config";
import { generateInstructions } from "@/lib/instructions";
import { resolveBetaRelayTrust } from "@/lib/relay-trust";
import {
  assertRequiredProjectEnvKeys,
  createDeployment,
  createProject,
  listProjectEnvKeys,
  setProjectModelBudget,
  upsertEnv,
} from "@/lib/vercel-api";
import { buildEnv, connectStorage } from "@/lib/deploy-service";
import { managedDb } from "./db";
import { recordProvisionedDeployment } from "./environments";

const MANAGED_FEATURES: AgentConfig["features"] = ["knowledge", "goals", "proactive"];

export function managedConfig(input: {
  ownerName: string;
  agentName: string;
  ownerTimezone: string;
  accessPassword: string;
  projectName: string;
  relayFingerprint: string;
}): AgentConfig {
  const config: AgentConfig = {
    agentName: input.agentName,
    projectName: input.projectName,
    ownerName: input.ownerName,
    ownerTimezone: input.ownerTimezone,
    accessPassword: input.accessPassword,
    model: "anthropic/claude-sonnet-5",
    features: MANAGED_FEATURES,
    instructions: generateInstructions({
      agentName: input.agentName,
      ownerName: input.ownerName,
      personality: "",
      features: MANAGED_FEATURES,
      telegramEnabled: false,
    }),
    telegram: null,
    schedules: [],
    postgres: { mode: "create" },
    blob: { mode: "create" },
    keys: {},
    relay: { fingerprint: input.relayFingerprint },
  };
  const problem = validateConfig(config);
  if (problem) throw new Error(problem);
  return config;
}

export async function provisionManagedEve(input: {
  environmentId: string;
  projectName: string;
  ownerName: string;
  agentName: string;
  ownerTimezone: string;
  accessPassword: string;
  monthlyModelBudgetUsd: number;
  builderOrigin: string;
}): Promise<{ projectId: string; deploymentId: string; readyState: string }> {
  if (process.env.MANAGED_EVE_PROVISIONING_ENABLED !== "true") {
    throw new Error("Managed Eve provisioning is not enabled");
  }
  const token = process.env.MANAGED_EVE_VERCEL_TOKEN;
  const fingerprint = process.env.MANAGED_EVE_RELAY_FINGERPRINT;
  if (!token || !fingerprint) throw new Error("Managed Eve operator credentials or Relay key pin are unavailable");
  const teamId = process.env.MANAGED_EVE_VERCEL_TEAM_ID || null;
  const config = managedConfig({
    ownerName: input.ownerName,
    agentName: input.agentName,
    ownerTimezone: input.ownerTimezone,
    accessPassword: input.accessPassword,
    projectName: input.projectName,
    relayFingerprint: fingerprint,
  });
  // Confirm the operator-reviewed key before mutating Vercel resources.
  const relay = await resolveBetaRelayTrust(fingerprint);
  const info = await templateInfo();
  const project = await createProject(token, teamId, config.projectName);
  if (project.existed) throw new Error("Managed Eve project name is already in use; operator recovery required");
  await managedDb().query(
    "UPDATE managed_eve_environments SET project_id=$1,updated_at=now() WHERE id=$2 AND state='provisioning'",
    [project.id, input.environmentId],
  );
  // The model budget is an admission gate. Never deploy an uncapped managed
  // project, even if storage or application setup would otherwise succeed.
  await setProjectModelBudget(token, teamId, project.id, input.monthlyModelBudgetUsd);
  const stores = await connectStorage(token, teamId, project.id, project.name, config);
  await managedDb().query(
    "UPDATE managed_eve_environments SET database_store_id=$1,blob_store_id=$2,updated_at=now() WHERE id=$3 AND state='provisioning'",
    [stores.databaseStoreId, stores.blobStoreId, input.environmentId],
  );
  const env = buildEnv(config, {
    templateVersion: info.version,
    templateRelease: info.release,
    builderUrl: input.builderOrigin,
  }, relay);
  env.push(
    { key: "MYEVE_MANAGED_ENVIRONMENT_ID", value: input.environmentId },
    { key: "MYEVE_MANAGED_MONTHLY_MODEL_BUDGET_USD", value: input.monthlyModelBudgetUsd.toFixed(2) },
  );
  await upsertEnv(token, teamId, project.id, env);
  assertRequiredProjectEnvKeys(
    await listProjectEnvKeys(token, teamId, project.id, "env"),
    env.map((entry) => entry.key),
  );
  const deployment = await createDeployment(token, teamId, project.name, await assembleDeployment({ ...config, managed: true }));
  await recordProvisionedDeployment({
    id: input.environmentId,
    projectId: project.id,
    deploymentId: deployment.id,
    templateRelease: info.release,
  });
  return { projectId: project.id, deploymentId: deployment.id, readyState: deployment.readyState };
}
