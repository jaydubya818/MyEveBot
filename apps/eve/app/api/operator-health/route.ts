import { apiError, requireDatabase } from "@/lib/api-errors";
import { getOperatorHealth } from "@/lib/operator-health";
import { requireWebAuth, webPrincipal } from "@/lib/web-auth";

export async function GET(request: Request): Promise<Response> {
  const denied = requireWebAuth(request) ?? requireDatabase(request);
  if (denied) return denied;
  try {
    const owner = webPrincipal(request)!;
    return Response.json(await getOperatorHealth(owner.id), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Operator health check failed", error);
    return apiError(request, 503, "operator_health_unavailable", "Operational health is temporarily unavailable.");
  }
}
