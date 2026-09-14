import { apiError, requireDatabase } from "@/lib/api-errors";
import { getComputerSession, pauseComputerSession, resumeComputerSession, stopComputerSession } from "@/lib/computer-sessions";
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
  if (body?.action !== "stop" && body?.action !== "pause" && body?.action !== "resume") {
    return apiError(request, 400, "invalid_action", "Use pause, resume, or stop.");
  }
  const { id } = await ctx.params;
  try {
    const ownerId = webPrincipal(request)!.id;
    const session = body.action === "stop"
      ? await stopComputerSession(ownerId, id)
      : body.action === "pause"
        ? await pauseComputerSession(ownerId, id)
        : await resumeComputerSession(ownerId, id);
    return Response.json({ session });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Computer session could not be updated.";
    if (/not found/i.test(message)) return apiError(request, 404, "computer_session_not_found", message);
    if (/cannot transition/i.test(message)) return apiError(request, 409, "invalid_transition", message);
    return apiError(request, 503, "computer_session_update_failed", "Computer session could not be updated safely.");
  }
}
