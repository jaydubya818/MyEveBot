import { reconcileStaleComputerSessions } from "@/lib/computer-sessions";

export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return Response.json({ error: "cron_not_configured" }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const cleanup = await reconcileStaleComputerSessions();
  if (cleanup.failedProvisioning > 0 || cleanup.failedRunning > 0) {
    console.error("[operator-alert] stale Computer sessions required forced cleanup", cleanup);
  }
  return Response.json({ ok: true, cleanup, checkedAt: new Date().toISOString() });
}
