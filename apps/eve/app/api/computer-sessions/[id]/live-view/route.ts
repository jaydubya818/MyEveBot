import { apiError, requireDatabase } from "@/lib/api-errors";
import { getComputerLiveView } from "@/lib/computer-sessions";
import { LiveSessionLostError } from "@/lib/live-session-provider";
import { requireWebAuth, webPrincipal } from "@/lib/web-auth";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, ctx: RouteContext): Promise<Response> {
  const denied = requireWebAuth(request) ?? requireDatabase(request);
  if (denied) return denied;
  const url = new URL(request.url);
  const runId = url.searchParams.get("runId");
  const browserSessionId = url.searchParams.get("browserSessionId");
  if (!runId || !browserSessionId) return apiError(request, 400, "live_view_binding_required", "Run and Browser session bindings are required.");
  const { id } = await ctx.params;
  try {
    const frame = await getComputerLiveView({ ownerId: webPrincipal(request)!.id, id, runId, browserSessionId });
    return new Response(Buffer.from(frame.bytes), {
      headers: {
        "Cache-Control": "no-store, private",
        "Content-Type": frame.contentType,
        "X-Live-Observed-At": frame.observedAt,
        "X-Live-Current-Url": encodeURIComponent(frame.currentUrl ?? ""),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Live view is unavailable.";
    if (/not found/i.test(message)) return apiError(request, 404, "computer_session_not_found", message);
    if (/binding/i.test(message)) return apiError(request, 409, "live_view_binding_mismatch", message);
    if (error instanceof LiveSessionLostError) return apiError(request, 410, "provider_session_lost", message);
    if (/not supported/i.test(message)) return apiError(request, 422, "live_view_unsupported", message);
    return apiError(request, 503, "live_view_unavailable", "Live view is temporarily unavailable.");
  }
}
