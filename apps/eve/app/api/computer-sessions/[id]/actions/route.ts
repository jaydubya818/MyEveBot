import { apiError, requireDatabase } from "@/lib/api-errors";
import { listComputerActions } from "@/lib/computer-sessions";
import { requireWebAuth, webPrincipal } from "@/lib/web-auth";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, ctx: RouteContext): Promise<Response> {
  const denied = requireWebAuth(request) ?? requireDatabase(request); if (denied) return denied;
  const { id } = await ctx.params;
  try {
    return Response.json({ actions: await listComputerActions(webPrincipal(request)!.id, id) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Computer actions are unavailable.";
    if (/not found/i.test(message)) return apiError(request, 404, "computer_session_not_found", message);
    return apiError(request, 503, "computer_actions_unavailable", "Computer actions are temporarily unavailable.");
  }
}
