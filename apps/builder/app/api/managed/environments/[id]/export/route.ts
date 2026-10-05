import { randomUUID } from "node:crypto";
import { adminDenied, isManagedAdmin } from "@/managed/admin-auth";
import { inTransaction } from "@/managed/db";
import { managedProjectName } from "@/managed/state";

// The operator records a hash only after opening and checking the owner's
// downloaded archive. The archive itself stays with the owner.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  if (!isManagedAdmin(request)) return adminDenied();
  const { id } = await context.params;
  let expectedName: string;
  try { expectedName = managedProjectName(id); }
  catch { return Response.json({ error: "Unknown managed Eve" }, { status: 404 }); }
  const body = await request.json().catch(() => null) as {
    sha256?: unknown; bytes?: unknown; archiveName?: unknown; ownerConfirmed?: unknown;
  } | null;
  if (!body || typeof body.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(body.sha256) ||
      typeof body.bytes !== "number" || !Number.isSafeInteger(body.bytes) || body.bytes < 1 ||
      typeof body.archiveName !== "string" || body.archiveName.length < 1 || body.archiveName.length > 150 ||
      body.ownerConfirmed !== true) {
    return Response.json({ error: "Record a checked archive name, SHA-256, byte count, and owner confirmation" }, { status: 400 });
  }
  try {
    const verified = await inTransaction(async (client) => {
      const row = await client.query<{ project_name: string; state: string }>(
        "SELECT project_name,state FROM managed_eve_environments WHERE id=$1 FOR UPDATE", [id],
      );
      if (row.rows[0]?.project_name !== expectedName || !["ready", "paused"].includes(row.rows[0]?.state ?? "")) {
        return false;
      }
      await client.query(
        "UPDATE managed_eve_environments SET last_export_verified_at=now(),updated_at=now() WHERE id=$1", [id],
      );
      await client.query(
        "INSERT INTO managed_eve_events (id,environment_id,kind,detail) VALUES ($1,$2,'owner_export_verified',$3)",
        [`evt_${randomUUID().replaceAll("-", "").slice(0, 24)}`, id, JSON.stringify({ sha256: body.sha256, bytes: body.bytes, archiveName: body.archiveName, ownerConfirmed: true })],
      );
      return true;
    });
    if (!verified) return Response.json({ error: "Managed Eve identity or state could not be verified" }, { status: 409 });
    return Response.json({ id, exportVerified: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Export verification could not be recorded" }, { status: 503 });
  }
}
