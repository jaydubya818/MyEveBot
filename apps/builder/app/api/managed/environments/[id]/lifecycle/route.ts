import { adminDenied, isManagedAdmin } from "@/managed/admin-auth";
import { managedDb } from "@/managed/db";
import { transitionEnvironment } from "@/managed/environments";
import { managedProjectName } from "@/managed/state";
import { pauseProject, unpauseProject } from "@/lib/vercel-api";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  if (!isManagedAdmin(request)) return adminDenied();
  const { id } = await context.params;
  const body = await request.json().catch(() => null) as { action?: unknown } | null;
  if (body?.action !== "pause" && body?.action !== "resume") {
    return Response.json({ error: "Choose pause or resume" }, { status: 400 });
  }
  let expectedProjectName: string;
  try { expectedProjectName = managedProjectName(id); }
  catch { return Response.json({ error: "Unknown managed Eve" }, { status: 404 }); }
  const result = await managedDb().query<{ project_id: string | null; project_name: string; state: string }>(
    "SELECT project_id,project_name,state FROM managed_eve_environments WHERE id=$1",
    [id],
  ).catch(() => null);
  const row = result?.rows[0];
  if (!row || !row.project_id || row.project_name !== expectedProjectName) {
    return Response.json({ error: "Managed project identity could not be verified" }, { status: 409 });
  }
  const from = body.action === "pause" ? "ready" : "paused";
  const to = body.action === "pause" ? "paused" : "ready";
  if (row.state !== from) return Response.json({ error: `Eve must be ${from} before this action` }, { status: 409 });
  const token = process.env.MANAGED_EVE_VERCEL_TOKEN;
  if (!token) return Response.json({ error: "Operator deployment access is unavailable" }, { status: 503 });
  try {
    const teamId = process.env.MANAGED_EVE_VERCEL_TEAM_ID || null;
    if (body.action === "pause") await pauseProject(token, teamId, row.project_id);
    else await unpauseProject(token, teamId, row.project_id);
    await transitionEnvironment({ id, from, to, kind: body.action === "pause" ? "project_paused" : "project_resumed" });
    return Response.json({ id, state: to }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Project state could not be confirmed; inspect Vercel before retrying" }, { status: 503 });
  }
}
