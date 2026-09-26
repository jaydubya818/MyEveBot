import { createHash } from "node:crypto";
import { managedDb } from "@/managed/db";
import { refreshManagedDeployment, type DeploymentRow } from "@/managed/refresh-deployment";

export async function POST(request: Request): Promise<Response> {
  const body = await request.json().catch(() => null) as { token?: unknown } | null;
  if (!body || typeof body.token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(body.token)) {
    return Response.json({ error: "Invalid invitation" }, { status: 400 });
  }
  try {
    const tokenHash = createHash("sha256").update(body.token).digest("hex");
    const result = await managedDb().query<DeploymentRow>(
      `SELECT e.id,e.state,e.project_id,e.project_name,e.deployment_id,e.public_url,e.monthly_model_budget_usd
       FROM managed_beta_invites i JOIN managed_eve_environments e ON e.invite_id=i.id
       WHERE i.token_hash=$1 AND i.revoked_at IS NULL AND i.expires_at > now()`,
      [tokenHash],
    );
    const row = result.rows[0];
    if (!row) return Response.json({ error: "Invitation has no active setup" }, { status: 404 });
    const status = await refreshManagedDeployment(row);
    return Response.json(status, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Setup status is temporarily unavailable" }, {
      status: 503, headers: { "Cache-Control": "no-store" },
    });
  }
}
