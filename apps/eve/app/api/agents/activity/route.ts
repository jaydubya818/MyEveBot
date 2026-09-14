import { listAgentActivity } from "@/lib/agents";
import { requestOwnerId } from "@/lib/agent-api";
import { apiError, requireDatabase } from "@/lib/api-errors";
import { requireWebAuth } from "@/lib/web-auth";

export async function GET(request: Request): Promise<Response> {
  const denied = requireWebAuth(request) ?? requireDatabase(request); if (denied) return denied;
  try { return Response.json({ activity: await listAgentActivity(requestOwnerId(request)) }); }
  catch (error) { console.error("Agent activity failed", error); return apiError(request, 503, "agent_activity_unavailable", "Agent activity is temporarily unavailable."); }
}
