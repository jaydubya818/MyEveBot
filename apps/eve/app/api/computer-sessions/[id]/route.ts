import { apiError, requireDatabase } from "@/lib/api-errors";
import { getComputerSession, heartbeatComputerControl, pauseComputerSession, resumeComputerSession, returnComputerControl, stopComputerSession, takeOverComputerSession } from "@/lib/computer-sessions";
import { ControlConflictError } from "@/lib/computer-control";
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
  const body = (await request.json().catch(() => null)) as { action?: unknown; expectedVersion?:unknown } | null;
  if (!body || !["stop","pause","resume","takeOver","returnControl","heartbeat"].includes(String(body.action))) {
    return apiError(request, 400, "invalid_action", "Use takeOver, pause, returnControl, resume, heartbeat, or stop.");
  }
  if (["takeOver","returnControl","heartbeat"].includes(String(body.action)) && (!Number.isInteger(body.expectedVersion)||Number(body.expectedVersion)<1)) {
    return apiError(request,400,"control_version_required","A valid expected control version is required.");
  }
  const { id } = await ctx.params;
  try {
    const ownerId = webPrincipal(request)!.id;
    if(body.action==="heartbeat")return Response.json({control:await heartbeatComputerControl({ownerId,id,version:Number(body.expectedVersion),requestedBy:ownerId})});
    const session = body.action === "stop"
      ? await stopComputerSession(ownerId, id)
      : body.action === "pause"
        ? await pauseComputerSession(ownerId, id)
        : body.action === "resume"
          ? await resumeComputerSession(ownerId, id)
          : body.action === "takeOver"
            ? await takeOverComputerSession({ownerId,id,expectedVersion:Number(body.expectedVersion),requestedBy:ownerId})
            : await returnComputerControl({ownerId,id,expectedVersion:Number(body.expectedVersion),requestedBy:ownerId});
    return Response.json({ session });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Computer session could not be updated.";
    if (/not found/i.test(message)) return apiError(request, 404, "computer_session_not_found", message);
    if (error instanceof ControlConflictError || /cannot transition|control.*changed|lease expired|still provisioning/i.test(message)) return apiError(request, 409, "control_conflict", message);
    if (/not supported/i.test(message)) return apiError(request, 422, "takeover_unsupported", message);
    return apiError(request, 503, "computer_session_update_failed", "Computer session could not be updated safely.");
  }
}
