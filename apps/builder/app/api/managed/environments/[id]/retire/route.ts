import { adminDenied, isManagedAdmin } from "@/managed/admin-auth";
import { managedDb } from "@/managed/db";
import { managedProjectName } from "@/managed/state";
import { retireManagedEve } from "@/managed/retire";

export const maxDuration = 120;

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  if (!isManagedAdmin(request)) return adminDenied();
  const { id } = await context.params;
  try { managedProjectName(id); }
  catch { return Response.json({ error: "Unknown managed Eve" }, { status: 404 }); }
  const body = await request.json().catch(() => null) as {
    confirmProjectName?: unknown;
    confirmDatabaseStoreId?: unknown;
    exportSha256?: unknown;
    confirmPermanentDeletion?: unknown;
  } | null;
  if (!body || body.confirmPermanentDeletion !== true ||
      typeof body.confirmProjectName !== "string" ||
      typeof body.confirmDatabaseStoreId !== "string" ||
      typeof body.exportSha256 !== "string") {
    return Response.json({ error: "Confirm the exact project, database, checked export, and permanent deletion" }, { status: 400 });
  }
  const client = await managedDb().connect().catch(() => null);
  if (!client) return Response.json({ error: "Control database unavailable" }, { status: 503 });
  let locked = false;
  try {
    const lock = await client.query<{ acquired: boolean }>(
      "SELECT pg_try_advisory_lock(670103, hashtext($1)) AS acquired", [id],
    );
    locked = lock.rows[0]?.acquired === true;
    if (!locked) return Response.json({ error: "Retirement is already running for this Eve" }, { status: 409 });
    const outcome = await retireManagedEve({
      id, confirmProjectName: body.confirmProjectName,
      confirmDatabaseStoreId: body.confirmDatabaseStoreId,
      exportSha256: body.exportSha256,
    });
    return Response.json(outcome, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Retirement could not be verified";
    return Response.json({ error: message }, { status: 409, headers: { "Cache-Control": "no-store" } });
  } finally {
    if (locked) await client.query("SELECT pg_advisory_unlock(670103, hashtext($1))", [id]).catch(() => undefined);
    client.release();
  }
}
