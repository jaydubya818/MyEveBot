import { adminDenied, isManagedAdmin } from "@/managed/admin-auth";
import { managedDb } from "@/managed/db";
import { recoverFailedEmptyProject } from "@/managed/retire";
import { managedProjectName } from "@/managed/state";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  if (!isManagedAdmin(request)) return adminDenied();
  const { id } = await context.params;
  try { managedProjectName(id); }
  catch { return Response.json({ error: "Unknown managed Eve" }, { status: 404 }); }
  const body = await request.json().catch(() => null) as {
    confirmProjectName?: unknown;
    confirmEmptyProjectDeletion?: unknown;
  } | null;
  if (!body || body.confirmEmptyProjectDeletion !== true || typeof body.confirmProjectName !== "string") {
    return Response.json({ error: "Confirm the exact failed project and empty-project deletion" }, { status: 400 });
  }
  const client = await managedDb().connect().catch(() => null);
  if (!client) return Response.json({ error: "Control database unavailable" }, { status: 503 });
  let locked = false;
  try {
    const lock = await client.query<{ acquired: boolean }>(
      "SELECT pg_try_advisory_lock(670104, hashtext($1)) AS acquired", [id],
    );
    locked = lock.rows[0]?.acquired === true;
    if (!locked) return Response.json({ error: "Recovery is already running for this Eve" }, { status: 409 });
    const outcome = await recoverFailedEmptyProject({ id, confirmProjectName: body.confirmProjectName });
    return Response.json(outcome, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Recovery could not be verified" },
      { status: 409, headers: { "Cache-Control": "no-store" } });
  } finally {
    if (locked) await client.query("SELECT pg_advisory_unlock(670104, hashtext($1))", [id]).catch(() => undefined);
    client.release();
  }
}
