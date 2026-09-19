import { apiError, requireDatabase } from "@/lib/api-errors";
import { getComputerLiveView } from "@/lib/computer-sessions";
import { LiveSessionLostError } from "@/lib/live-session-provider";
import { computerApiFailure } from "@/lib/computer-api-errors";
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
    if (/not found/i.test(message)) return computerApiFailure(request, error, { context: "Live Computer session not found", status: 404, code: "computer_session_not_found", message: "Computer session not found." });
    if (/binding/i.test(message)) return computerApiFailure(request, error, { context: "Live Computer binding mismatch", status: 409, code: "live_view_binding_mismatch", message: "The Live Computer binding is no longer current." });
    if (error instanceof LiveSessionLostError) return computerApiFailure(request, error, { context: "Live Computer provider session lost", status: 410, code: "provider_session_lost", message: "The provider session is no longer available." });
    if (/not supported/i.test(message)) return computerApiFailure(request, error, { context: "Live Computer view unsupported", status: 422, code: "live_view_unsupported", message: "Live view is not supported for this Computer session." });
    return computerApiFailure(request, error, { context: "Live Computer view failed", code: "live_view_unavailable", message: "Live view is temporarily unavailable." });
  }
}
