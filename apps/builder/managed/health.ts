import { randomUUID } from "node:crypto";
import { getProject, listProjectModelBudgets, type ProjectModelBudget } from "@/lib/vercel-api";
import { managedDb } from "./db";
import { managedProjectName } from "./state";

export interface ManagedHealthResult {
  id: string;
  status: "healthy" | "budget_mismatch" | "endpoint_unhealthy" | "unverifiable" | "project_mismatch";
  checkedAt: string;
  budget: ProjectModelBudget | null;
}

export function managedHealthUrl(value: string | null): URL {
  const url = new URL(value ?? "");
  if (url.protocol !== "https:" || !/^[a-z0-9-]+\.vercel\.app$/.test(url.hostname) ||
      url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Managed Eve URL is not an approved Vercel host");
  }
  return new URL("/eve/v1/health", url);
}

export async function checkManagedHealth(id: string): Promise<ManagedHealthResult> {
  const expectedName = managedProjectName(id);
  const result = await managedDb().query<{
    project_id: string | null; project_name: string; public_url: string | null;
    state: string; monthly_model_budget_usd: string;
  }>(
    "SELECT project_id,project_name,public_url,state,monthly_model_budget_usd FROM managed_eve_environments WHERE id=$1",
    [id],
  );
  const row = result.rows[0];
  if (!row || row.state !== "ready" || !row.project_id || row.project_name !== expectedName) {
    throw new Error("Managed Eve is not ready with a verified project identity");
  }
  const token = process.env.MANAGED_EVE_VERCEL_TOKEN;
  if (!token) throw new Error("Operator deployment access is unavailable");
  const teamId = process.env.MANAGED_EVE_VERCEL_TEAM_ID || null;
  let status: ManagedHealthResult["status"] = "unverifiable";
  let budget: ProjectModelBudget | null = null;
  let httpStatus: number | null = null;
  try {
    const project = await getProject(token, teamId, expectedName);
    if (!project || project.id !== row.project_id || project.name !== expectedName) {
      status = "project_mismatch";
    } else {
      const budgets = await listProjectModelBudgets(token, teamId);
      budget = budgets.find((item) => item.projectId === row.project_id) ?? null;
      if (!budget?.active || budget.refreshPeriod !== "monthly" ||
          budget.limitAmount !== Number(row.monthly_model_budget_usd)) {
        status = "budget_mismatch";
      } else {
        const response = await fetch(managedHealthUrl(row.public_url), {
          redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(15_000),
        });
        httpStatus = response.status;
        status = response.ok ? "healthy" : "endpoint_unhealthy";
      }
    }
  } catch {
    status = "unverifiable";
  }
  await managedDb().query(
    "UPDATE managed_eve_environments SET last_health_at=now(),last_health_status=$1,updated_at=now() WHERE id=$2 AND state='ready'",
    [status, id],
  );
  if (status !== "healthy") {
    await managedDb().query(
      "INSERT INTO managed_eve_events (id,environment_id,kind,detail) VALUES ($1,$2,'health_alert',$3)",
      [`evt_${randomUUID().replaceAll("-", "").slice(0, 24)}`, id, JSON.stringify({ status, httpStatus })],
    );
  }
  return { id, status, checkedAt: new Date().toISOString(), budget };
}
