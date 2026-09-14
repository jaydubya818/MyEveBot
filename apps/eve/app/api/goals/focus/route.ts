import { apiError, requireDatabase } from "@/lib/api-errors";
import { capabilityMap } from "@/lib/capabilities";
import { getFocus } from "@/lib/goals";
import { requireWebAuth, webPrincipal } from "@/lib/web-auth";

export async function GET(request: Request): Promise<Response> {
  const denied = requireWebAuth(request) ?? requireDatabase(request);
  if (denied) return denied;
  if (capabilityMap().goals.state === "excluded") {
    return apiError(request, 404, "goals_not_included", "Goals are not included in this deployment.");
  }
  const rawLimit = Number(new URL(request.url).searchParams.get("limit") ?? "20");
  const limit = Number.isFinite(rawLimit) ? rawLimit : 20;
  try {
    return Response.json(
      { focus: await getFocus(webPrincipal(request)!.id, limit) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Goal focus failed", error);
    return apiError(request, 503, "goal_focus_unavailable", "Focus is temporarily unavailable.");
  }
}
