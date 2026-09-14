import { getAgent, updateAgent } from "@/lib/agents";
import { parseAgentWriteInput, requestOwnerId } from "@/lib/agent-api";
import { apiError, requireDatabase } from "@/lib/api-errors";
import { requireWebAuth } from "@/lib/web-auth";

type Context = { params: Promise<{ id: string }> };
function guard(request: Request): Response | null { return requireWebAuth(request) ?? requireDatabase(request); }

export async function GET(request: Request, context: Context): Promise<Response> {
  const denied = guard(request); if (denied) return denied;
  const { id } = await context.params;
  try {
    const agent = await getAgent(requestOwnerId(request), id);
    return agent ? Response.json({ agent }) : apiError(request, 404, "agent_not_found", "Agent not found.");
  } catch (error) {
    console.error("Agent read failed", error);
    return apiError(request, 503, "agent_unavailable", "Agent is temporarily unavailable.");
  }
}

export async function PATCH(request: Request, context: Context): Promise<Response> {
  const denied = guard(request); if (denied) return denied;
  const input = parseAgentWriteInput(await request.json().catch(() => null));
  if (!input) return apiError(request, 400, "invalid_agent", "Name, role, and instructions are required.");
  const { id } = await context.params;
  try {
    const ownerId = requestOwnerId(request);
    return Response.json({ agent: await updateAgent(ownerId, id, input, { type: "owner", id: ownerId }) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Agent could not be updated.";
    return apiError(request, message === "Agent not found." ? 404 : 400, "agent_update_failed", message);
  }
}
