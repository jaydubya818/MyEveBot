import { randomUUID } from "node:crypto";
import { adminDenied, isManagedAdmin } from "@/managed/admin-auth";
import { managedDb } from "@/managed/db";
import { managedProjectName } from "@/managed/state";
import { getProject, listProjectModelBudgets } from "@/lib/vercel-api";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  if (!isManagedAdmin(request)) return adminDenied();
  const { id } = await context.params;
  let projectName: string;
  try { projectName = managedProjectName(id); }
  catch { return Response.json({ error: "Unknown managed Eve" }, { status: 404 }); }
  const result = await managedDb().query<{
    project_id: string | null; project_name: string; public_url: string | null;
    state: string; monthly_model_budget_usd: string;
  }>(
    "SELECT project_id,project_name,public_url,state,monthly_model_budget_usd FROM managed_eve_environments WHERE id=$1",
    [id],
  ).catch(() => null);
  const row = result?.rows[0];
  if (!row || row.project_name !== projectName || !row.project_id) {
    return Response.json({ error: "Managed project identity could not be verified" }, { status: 409 });
  }
  if (row.state !== "ready") return Response.json({ error: "Eve is not in the ready state" }, { status: 409 });
  const token = process.env.MANAGED_EVE_VERCEL_TOKEN;
  if (!token) return Response.json({ error: "Operator deployment access is unavailable" }, { status: 503 });
  try {
    const teamId = process.env.MANAGED_EVE_VERCEL_TEAM_ID || null;
    const project = await getProject(token, teamId, projectName);
    if (!project || project.id !== row.project_id || project.name !== projectName) {
      throw new Error("Project identity changed");
    }
    const url = new URL(row.public_url ?? "");
    if (url.protocol !== "https:" || !/^[a-z0-9-]+\.vercel\.app$/.test(url.hostname) || url.pathname !== "/") {
      throw new Error("Managed Eve URL is not an approved Vercel host");
    }
    const budget = (await listProjectModelBudgets(token, teamId)).find((item) => item.projectId === row.project_id);
    const budgetVerified = Boolean(budget?.active && budget.refreshPeriod === "monthly" &&
      budget.limitAmount === Number(row.monthly_model_budget_usd));
    const health = await fetch(new URL("/eve/v1/health", url), {
      redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(15_000),
    }).catch(() => null);
    const healthy = health?.ok === true && budgetVerified;
    const status = healthy ? "healthy" : !budgetVerified ? "budget_mismatch" : "unhealthy";
    await managedDb().query(
      "UPDATE managed_eve_environments SET last_health_at=now(),last_health_status=$1,updated_at=now() WHERE id=$2 AND state='ready'",
      [status, id],
    );
    await managedDb().query(
      "INSERT INTO managed_eve_events (id,environment_id,kind,detail) VALUES ($1,$2,'health_checked',$3)",
      [`evt_${randomUUID().replaceAll("-", "").slice(0, 24)}`, id, JSON.stringify({ status, budgetVerified, httpStatus: health?.status ?? null })],
    );
    return Response.json({ id, status, budget: budget ?? null, checkedAt: new Date().toISOString() }, {
      status: healthy ? 200 : 503, headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json({ error: "Health could not be verified; inspect project, budget, and Eve endpoint" }, {
      status: 503, headers: { "Cache-Control": "no-store" },
    });
  }
}
