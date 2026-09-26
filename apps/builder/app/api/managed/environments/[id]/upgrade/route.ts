import { POST as updateBuilderProject } from "@/app/api/update/route";
import { adminDenied, isManagedAdmin } from "@/managed/admin-auth";
import { managedDb } from "@/managed/db";
import { markProvisionFailure, recordUpgradeDeployment, transitionEnvironment } from "@/managed/environments";
import { managedProjectName } from "@/managed/state";
import { getProject } from "@/lib/vercel-api";

export const maxDuration = 120;

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  if (!isManagedAdmin(request)) return adminDenied();
  const { id } = await context.params;
  let projectName: string;
  try { projectName = managedProjectName(id); }
  catch { return Response.json({ error: "Unknown managed Eve" }, { status: 404 }); }
  const result = await managedDb().query<{ project_id: string | null; project_name: string; state: string }>(
    "SELECT project_id,project_name,state FROM managed_eve_environments WHERE id=$1", [id],
  ).catch(() => null);
  const row = result?.rows[0];
  if (!row || row.project_name !== projectName || !row.project_id || row.state !== "ready") {
    return Response.json({ error: "Managed Eve must be ready with a verified project ID" }, { status: 409 });
  }
  const token = process.env.MANAGED_EVE_VERCEL_TOKEN;
  if (!token) return Response.json({ error: "Operator deployment access is unavailable" }, { status: 503 });
  const teamId = process.env.MANAGED_EVE_VERCEL_TEAM_ID || null;
  try {
    const project = await getProject(token, teamId, projectName);
    if (!project || project.id !== row.project_id || project.hasGitRepository) {
      return Response.json({ error: "Managed project identity could not be verified" }, { status: 409 });
    }
    await transitionEnvironment({ id, from: "ready", to: "upgrading", kind: "upgrade_requested" });
    const response = await updateBuilderProject(new Request(new URL("/api/update", request.url), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token, teamId, action: "update", projectName, expectedProjectId: row.project_id,
        managedMode: true,
      }),
    }));
    const outcome = await response.json() as {
      deploymentId?: unknown; toRelease?: unknown; error?: unknown;
    };
    if (!response.ok || typeof outcome.deploymentId !== "string" ||
        typeof outcome.toRelease !== "number") {
      await markProvisionFailure(id, "upgrade", typeof outcome.error === "string" ? outcome.error : "Builder update did not return a deployment");
      return Response.json({ error: "Upgrade stopped; inspect the existing Eve and operator record" }, { status: 503 });
    }
    await recordUpgradeDeployment({
      id, projectId: row.project_id, deploymentId: outcome.deploymentId,
      templateRelease: outcome.toRelease,
    });
    return Response.json({ id, state: "deploying", deploymentId: outcome.deploymentId }, {
      status: 202, headers: { "Cache-Control": "no-store" },
    });
  } catch {
    await markProvisionFailure(id, "upgrade", "Upgrade state is uncertain; inspect the Vercel deployment before retrying").catch(() => undefined);
    return Response.json({ error: "Upgrade state is uncertain; inspect Vercel before retrying" }, {
      status: 503, headers: { "Cache-Control": "no-store" },
    });
  }
}
