import { createHash } from "node:crypto";
import { getDeploymentStatus } from "@/lib/vercel-api";
import { managedDb } from "@/managed/db";
import { markProvisionFailure, transitionEnvironment } from "@/managed/environments";

interface StatusRow {
  id: string;
  state: string;
  deployment_id: string | null;
  public_url: string | null;
  last_error_summary: string | null;
}

export async function POST(request: Request): Promise<Response> {
  const body = await request.json().catch(() => null) as { token?: unknown } | null;
  if (!body || typeof body.token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(body.token)) {
    return Response.json({ error: "Invalid invitation" }, { status: 400 });
  }
  try {
    const tokenHash = createHash("sha256").update(body.token).digest("hex");
    const result = await managedDb().query<StatusRow>(
      `SELECT e.id,e.state,e.deployment_id,e.public_url,e.last_error_summary
       FROM managed_beta_invites i JOIN managed_eve_environments e ON e.invite_id=i.id
       WHERE i.token_hash=$1 AND i.revoked_at IS NULL AND i.expires_at > now()`,
      [tokenHash],
    );
    const row = result.rows[0];
    if (!row) return Response.json({ error: "Invitation has no active setup" }, { status: 404 });
    if ((row.state === "deploying" || row.state === "verifying") && row.deployment_id) {
      const vercelToken = process.env.MANAGED_EVE_VERCEL_TOKEN;
      if (!vercelToken) throw new Error("Operator deployment access is unavailable");
      const teamId = process.env.MANAGED_EVE_VERCEL_TEAM_ID || null;
      const deployment = await getDeploymentStatus(vercelToken, teamId, row.deployment_id);
      if (deployment.readyState === "ERROR" || deployment.readyState === "CANCELED") {
        await markProvisionFailure(row.id, "build", deployment.errorLog ?? deployment.readyState);
        return Response.json({ state: "failed", error: "Eve build failed; the operator has the build details" }, { headers: { "Cache-Control": "no-store" } });
      }
      if (deployment.readyState === "READY" && deployment.aliases.length > 0) {
        if (row.state === "deploying") {
          await transitionEnvironment({ id: row.id, from: "deploying", to: "verifying", kind: "deployment_ready" });
        }
        const alias = deployment.aliases
          .filter((candidate) => /^[a-z0-9.-]+\.vercel\.app$/.test(candidate))
          .sort((a, b) => a.length - b.length)[0];
        if (!alias) return Response.json({ state: "verifying" }, { headers: { "Cache-Control": "no-store" } });
        const health = await fetch(`https://${alias}/eve/v1/health`, {
          redirect: "manual",
          signal: AbortSignal.timeout(15_000),
        }).catch(() => null);
        if (health?.ok) {
          const url = `https://${alias}`;
          await managedDb().query(
            "UPDATE managed_eve_environments SET public_url=$1,last_health_at=now(),last_health_status='healthy',updated_at=now() WHERE id=$2 AND state='verifying'",
            [url, row.id],
          );
          await transitionEnvironment({ id: row.id, from: "verifying", to: "ready", kind: "health_verified" });
          return Response.json({ state: "ready", url, exportPath: `${url}/manage` }, { headers: { "Cache-Control": "no-store" } });
        }
        await managedDb().query(
          "UPDATE managed_eve_environments SET last_health_at=now(),last_health_status='retrying',updated_at=now() WHERE id=$1 AND state='verifying'",
          [row.id],
        );
        return Response.json({ state: "verifying" }, { headers: { "Cache-Control": "no-store" } });
      }
    }
    return Response.json({
      state: row.state,
      url: row.state === "ready" ? row.public_url : null,
      error: row.state === "failed" ? "Setup stopped; ask the operator to inspect this environment" : null,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Setup status is temporarily unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
