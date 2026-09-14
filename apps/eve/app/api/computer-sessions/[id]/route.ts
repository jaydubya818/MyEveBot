import { apiError, requireDatabase } from "@/lib/api-errors";
import { getComputerSession, stopComputerSession } from "@/lib/computer-sessions";
import { requireWebAuth, webPrincipal } from "@/lib/web-auth";

type RouteContext = { params: Promise<{ id: string }> };
function guard(request: Request): Response | null { return requireWebAuth(request) ?? requireDatabase(request); }

export async function GET(request: Request, ctx: RouteContext): Promise<Response> {
  const denied = guard(request); if (denied) return denied;
  const { id } = await ctx.params;
  try {
    const session = await getComputerSession(webPrincipal(request)!.id, id);
    if (!session) return apiError(request, 404, "computer_session_not_found", "Computer session not found.");
    return Response.json({ session }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Computer session read failed", error);
    return apiError(request, 503, "computer_session_unavailable", "Computer session is temporarily unavailable.");
  }
}

export async function PATCH(request: Request, ctx: RouteContext): Promise<Response> {
  const denied = guard(request); if (denied) return denied;
  const body = (await request.json().catch(() => null)) as { action?: unknown } | null;
  if (body?.action !== "stop") return apiError(request, 400, "invalid_action", "Use stop.");
  const { id } = await ctx.params;
  try {
    return Response.json({ session: await stopComputerSession(webPrincipal(request)!.id, id) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Computer session could not be stopped.";
    if (/not found/i.test(message)) return apiError(request, 404, "computer_session_not_found", message);
    if (/cannot transition/i.test(message)) return apiError(request, 409, "invalid_transition", message);
    return apiError(request, 503, "computer_session_stop_failed", "Computer session could not be stopped safely.");
  }
}
