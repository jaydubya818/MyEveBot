import { adminDenied, isManagedAdmin } from "@/managed/admin-auth";
import { managedDb } from "@/managed/db";
import { listProjectModelBudgets } from "@/lib/vercel-api";

export async function GET(request: Request): Promise<Response> {
  if (!isManagedAdmin(request)) return adminDenied();
  try {
    const result = await managedDb().query(
      `SELECT id,email,owner_name,agent_name,project_name,project_id,database_store_id,blob_store_id,
              deployment_id,public_url,template_release,state,monthly_model_budget_usd,
              last_health_at,last_health_status,last_error_stage,last_error_summary,last_export_verified_at,
              created_at,updated_at,retired_at
       FROM managed_eve_environments ORDER BY created_at DESC LIMIT 100`,
    );
    const vercelToken = process.env.MANAGED_EVE_VERCEL_TOKEN;
    let budgets = null;
    if (vercelToken) {
      budgets = await listProjectModelBudgets(vercelToken, process.env.MANAGED_EVE_VERCEL_TEAM_ID || null).catch(() => null);
    }
    const byProject = new Map((budgets ?? []).map((budget) => [budget.projectId, budget]));
    return Response.json({
      environments: result.rows.map((row: { project_id: string | null }) => ({
        ...row,
        modelBudget: row.project_id ? byProject.get(row.project_id) ?? null : null,
        modelBudgetStatus: !row.project_id ? "not_provisioned" : budgets === null ? "unavailable" : byProject.has(row.project_id) ? "available" : "missing",
      })),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Managed Eve control database is unavailable" }, {
      status: 503, headers: { "Cache-Control": "no-store" },
    });
  }
}
