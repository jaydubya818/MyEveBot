import { adminDenied, isManagedAdmin } from "@/managed/admin-auth";
import { managedDb } from "@/managed/db";
import { refreshManagedDeployment, type DeploymentRow } from "@/managed/refresh-deployment";
import { managedProjectName } from "@/managed/state";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  if (!isManagedAdmin(request)) return adminDenied();
  const { id } = await context.params;
  let projectName: string;
  try { projectName = managedProjectName(id); }
  catch { return Response.json({ error: "Unknown managed Eve" }, { status: 404 }); }
  try {
    const result = await managedDb().query<DeploymentRow>(
      "SELECT id,state,project_id,project_name,deployment_id,public_url,monthly_model_budget_usd FROM managed_eve_environments WHERE id=$1", [id],
    );
    const row = result.rows[0];
    if (!row || row.project_name !== projectName) {
      return Response.json({ error: "Managed Eve identity could not be verified" }, { status: 409 });
    }
    const status = await refreshManagedDeployment(row);
    return Response.json(status, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Deployment state could not be verified; inspect Vercel" }, {
      status: 503, headers: { "Cache-Control": "no-store" },
    });
  }
}
