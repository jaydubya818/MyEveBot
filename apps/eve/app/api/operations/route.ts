import { apiError, requireDatabase } from "@/lib/api-errors";
import { getOperationsReport } from "@/lib/operations";
import { requireWebAuth, webPrincipal } from "@/lib/web-auth";

export async function GET(request: Request): Promise<Response> {
  const denied = requireWebAuth(request) ?? requireDatabase(request);
  if (denied) return denied;
  try {
    return Response.json(await getOperationsReport(webPrincipal(request)!.id), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    console.error("Operations report failed", error);
    return apiError(request, 503, "operations_unavailable", "Operations health is temporarily unavailable.");
  }
}
