import { createAgent, listAgents } from "@/lib/agents";
import { parseAgentWriteInput, requestOwnerId } from "@/lib/agent-api";
import { apiError, requireDatabase } from "@/lib/api-errors";
import { requireWebAuth } from "@/lib/web-auth";

function guard(request: Request): Response | null { return requireWebAuth(request) ?? requireDatabase(request); }

export async function GET(request: Request): Promise<Response> {
  const denied = guard(request); if (denied) return denied;
  try {
    const includeArchived = new URL(request.url).searchParams.get("includeArchived") === "true";
    return Response.json({ agents: await listAgents(requestOwnerId(request), includeArchived) });
  } catch (error) {
    console.error("Agent list failed", error);
    return apiError(request, 503, "agents_unavailable", "Agents are temporarily unavailable.");
  }
}

export async function POST(request: Request): Promise<Response> {
  const denied = guard(request); if (denied) return denied;
  const input = parseAgentWriteInput(await request.json().catch(() => null));
  if (!input) return apiError(request, 400, "invalid_agent", "Name, role, and instructions are required.");
  try {
    const ownerId = requestOwnerId(request);
    const agent = await createAgent(ownerId, input, { type: "owner", id: ownerId });
    return Response.json({ agent }, { status: 201 });
  } catch (error) {
    return apiError(request, 400, "agent_create_failed", error instanceof Error ? error.message : "Agent could not be created.");
  }
}
