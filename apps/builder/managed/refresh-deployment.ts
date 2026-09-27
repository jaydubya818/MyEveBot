import { getDeploymentStatus, getProject, latestProductionDeploymentId, listProjectModelBudgets } from "@/lib/vercel-api";
import { managedDb } from "./db";
import { markProvisionFailure, transitionEnvironment } from "./environments";
import { managedProjectName, requireManagedTeamId } from "./state";

export interface DeploymentRow {
  id: string;
  state: string;
  project_id: string | null;
  project_name: string;
  deployment_id: string | null;
  public_url: string | null;
  monthly_model_budget_usd: string;
  last_error_stage?: string | null;
}

export async function refreshManagedDeployment(row: DeploymentRow): Promise<{
  state: string; url?: string; exportPath?: string; error?: string;
}> {
  const recoveringUpgrade = row.state === "failed" && row.last_error_stage === "upgrade";
  if ((row.state !== "deploying" && row.state !== "verifying" && !recoveringUpgrade) || !row.deployment_id) {
    return { state: row.state, ...(row.state === "ready" && row.public_url ? { url: row.public_url, exportPath: `${row.public_url}/manage` } : {}) };
  }
  const token = process.env.MANAGED_EVE_VERCEL_TOKEN;
  if (!token || !row.project_id || row.project_name !== managedProjectName(row.id)) {
    throw new Error("Managed project identity could not be verified");
  }
  const teamId = requireManagedTeamId();
  const project = await getProject(token, teamId, row.project_name);
  if (!project || project.id !== row.project_id) throw new Error("Managed project identity changed");
  const budget = (await listProjectModelBudgets(token, teamId)).find((item) => item.projectId === row.project_id);
  if (!budget?.active || budget.refreshPeriod !== "monthly" || budget.limitAmount !== Number(row.monthly_model_budget_usd)) {
    throw new Error("Managed project model budget is missing or changed");
  }
  const deployment = await getDeploymentStatus(token, teamId, row.deployment_id);
  if (recoveringUpgrade) {
    // A failed upload may leave the previous release live. Recover only that
    // exact release; another deployment or changed alias requires inspection.
    if (project.paused || deployment.readyState !== "READY" ||
        await latestProductionDeploymentId(token, teamId, row.project_id) !== row.deployment_id) {
      return { state: "failed", error: "Upgrade recovery needs operator inspection" };
    }
    const expectedAlias = row.public_url ? new URL(row.public_url).hostname : null;
    if (!expectedAlias || !deployment.aliases.includes(expectedAlias)) {
      return { state: "failed", error: "Upgrade recovery needs operator inspection" };
    }
    const health = await fetch(`${row.public_url}/eve/v1/health`, {
      redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(15_000),
    }).catch(() => null);
    if (!health?.ok) return { state: "failed", error: "Previous Eve deployment is not healthy" };
    await transitionEnvironment({ id: row.id, from: "failed", to: "ready", kind: "previous_deployment_reverified" });
    await managedDb().query(
      "UPDATE managed_eve_environments SET last_error_stage=NULL,last_error_summary=NULL,last_health_at=now(),last_health_status='healthy',updated_at=now() WHERE id=$1 AND state='ready'",
      [row.id],
    );
    return { state: "ready", url: row.public_url!, exportPath: `${row.public_url}/manage` };
  }
  if (deployment.readyState === "ERROR" || deployment.readyState === "CANCELED") {
    await markProvisionFailure(row.id, "build", deployment.errorLog ?? deployment.readyState);
    return { state: "failed", error: "Eve build failed; the operator has the build details" };
  }
  if (deployment.readyState !== "READY") return { state: row.state };
  if (row.state === "deploying") {
    await transitionEnvironment({ id: row.id, from: "deploying", to: "verifying", kind: "deployment_ready" });
  }
  const alias = deployment.aliases
    .filter((candidate) => /^[a-z0-9.-]+\.vercel\.app$/.test(candidate))
    .sort((a, b) => a.length - b.length)[0];
  if (!alias) return { state: "verifying" };
  const health = await fetch(`https://${alias}/eve/v1/health`, {
    redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(15_000),
  }).catch(() => null);
  if (health?.ok) {
    const url = `https://${alias}`;
    await managedDb().query(
      "UPDATE managed_eve_environments SET public_url=$1,last_health_at=now(),last_health_status='healthy',updated_at=now() WHERE id=$2 AND state='verifying'",
      [url, row.id],
    );
    await transitionEnvironment({ id: row.id, from: "verifying", to: "ready", kind: "health_verified" });
    return { state: "ready", url, exportPath: `${url}/manage` };
  }
  await managedDb().query(
    "UPDATE managed_eve_environments SET last_health_at=now(),last_health_status='retrying',updated_at=now() WHERE id=$1 AND state='verifying'",
    [row.id],
  );
  return { state: "verifying" };
}
