import { apiError, requireDatabase } from "@/lib/api-errors";
import { getControlCenter } from "@/lib/control-center";
import { CONTROL_VIEWS, type ControlView } from "@/lib/control-center-types";
import { requireWebAuth, webPrincipal } from "@/lib/web-auth";

export async function GET(request: Request): Promise<Response> {
  const denied = requireWebAuth(request) ?? requireDatabase(request);
  if (denied) return denied;
  const params = new URL(request.url).searchParams;
  const requestedView = params.get("view");
  if (requestedView !== null && !CONTROL_VIEWS.includes(requestedView as ControlView)) {
    return apiError(request, 400, "invalid_control_view", "Unknown Control Center view.");
  }
  const from = params.get("from");
  if (from !== null && Number.isNaN(Date.parse(from))) {
    return apiError(request, 400, "invalid_control_date", "The from filter must be a valid date.");
  }
  try {
    const summary = await getControlCenter({
      ownerId: webPrincipal(request)!.id,
      view: (requestedView ?? "all") as ControlView,
      query: params.get("q") ?? undefined,
      agentId: params.get("agent") ?? undefined,
      roleId: params.get("role") ?? undefined,
      goalId: params.get("goal") ?? undefined,
      capabilityId: params.get("capability") ?? undefined,
      provider: params.get("provider") ?? undefined,
      from: from ?? undefined,
    });
    return Response.json(summary, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Control Center read failed", error);
    return apiError(request, 503, "control_center_unavailable", "Control Center is temporarily unavailable.");
  }
}
