import { duplicateAgent, transitionAgent } from "@/lib/agents";
import { requestOwnerId } from "@/lib/agent-api";
import { apiError, requireDatabase } from "@/lib/api-errors";
import { requireWebAuth } from "@/lib/web-auth";

type Context = { params: Promise<{ id: string; action: string }> };

export async function POST(request: Request, context: Context): Promise<Response> {
  const denied = requireWebAuth(request) ?? requireDatabase(request); if (denied) return denied;
  const { id, action } = await context.params;
  const ownerId = requestOwnerId(request);
  const actor = { type: "owner" as const, id: ownerId };
  try {
    if (action === "pause") return Response.json({ agent: await transitionAgent(ownerId, id, "paused", actor) });
    if (action === "resume") return Response.json({ agent: await transitionAgent(ownerId, id, "active", actor) });
    if (action === "archive") return Response.json({ agent: await transitionAgent(ownerId, id, "archived", actor) });
    if (action === "disable") return Response.json({ agent: await transitionAgent(ownerId, id, "disabled", actor) });
    if (action === "duplicate") {
      const body = await request.json().catch(() => null) as { name?: unknown } | null;
      return Response.json({ agent: await duplicateAgent(ownerId, id, typeof body?.name === "string" ? body.name : undefined, actor) }, { status: 201 });
    }
    return apiError(request, 404, "unknown_agent_action", "Unknown Agent action.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Agent action failed.";
    return apiError(request, message === "Agent not found." ? 404 : 400, "agent_action_failed", message);
  }
}
