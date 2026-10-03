import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { managedDb } from "@/managed/db";
import { checkManagedHealth } from "@/managed/health";
import { refreshManagedDeployment, type DeploymentRow } from "@/managed/refresh-deployment";

export const maxDuration = 120;

function authorized(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  const provided = request.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!expected || expected.length < 32 || !provided || provided.length > 256) return false;
  return timingSafeEqual(createHash("sha256").update(expected).digest(), createHash("sha256").update(provided).digest());
}

export async function GET(request: Request): Promise<Response> {
  if (!authorized(request)) return Response.json({ error: "Monitor authorization required" }, { status: 401 });
  if (process.env.MANAGED_EVE_PROVISIONING_ENABLED !== "true") {
    return Response.json({ state: "disabled", checked: 0 }, { headers: { "Cache-Control": "no-store" } });
  }
  const client = await managedDb().connect().catch(() => null);
  if (!client) return Response.json({ error: "Control database unavailable" }, { status: 503 });
  let locked = false;
  try {
    const lock = await client.query<{ acquired: boolean }>("SELECT pg_try_advisory_lock(670102) AS acquired");
    locked = lock.rows[0]?.acquired === true;
    if (!locked) return Response.json({ state: "already_running", checked: 0 });
    const rows = await client.query<DeploymentRow>(
      `SELECT id,state,project_id,project_name,deployment_id,public_url,monthly_model_budget_usd
       FROM managed_eve_environments WHERE state IN ('ready','deploying','verifying')
       ORDER BY updated_at ASC LIMIT 100`,
    );
    const outcomes: Array<{ id: string; status: string }> = [];
    for (const row of rows.rows) {
      try {
        const status = row.state === "ready"
          ? (await checkManagedHealth(row.id)).status
          : (await refreshManagedDeployment(row)).state;
        outcomes.push({ id: row.id, status });
      } catch {
        await client.query(
          "UPDATE managed_eve_environments SET last_health_at=now(),last_health_status='monitor_error',updated_at=now() WHERE id=$1",
          [row.id],
        );
        await client.query(
          "INSERT INTO managed_eve_events (id,environment_id,kind,detail) VALUES ($1,$2,'monitor_error','{}'::jsonb)",
          [`evt_${randomUUID().replaceAll("-", "").slice(0, 24)}`, row.id],
        );
        outcomes.push({ id: row.id, status: "monitor_error" });
      }
    }
    const alerts = outcomes.filter((item) => !["healthy", "ready", "deploying", "verifying"].includes(item.status));
    return Response.json({ state: alerts.length ? "attention" : "healthy", checked: outcomes.length, alerts }, {
      status: alerts.length ? 503 : 200, headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json({ error: "Managed monitor could not complete" }, { status: 503 });
  } finally {
    if (locked) await client.query("SELECT pg_advisory_unlock(670102)").catch(() => undefined);
    client.release();
  }
}
