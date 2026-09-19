import { apiError, requireDatabase } from "@/lib/api-errors";
import { computerApiFailure } from "@/lib/computer-api-errors";
import { createComputerSession, listComputerSessions } from "@/lib/computer-sessions";
import { requireWebAuth, webPrincipal } from "@/lib/web-auth";

function guard(request: Request): Response | null { return requireWebAuth(request) ?? requireDatabase(request); }

export async function GET(request: Request): Promise<Response> {
  const denied = guard(request); if (denied) return denied;
  const owner = webPrincipal(request)!;
  try {
    return Response.json({ sessions: await listComputerSessions(owner.id) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return computerApiFailure(request, error, { context: "Computer session list failed", code: "computer_sessions_unavailable", message: "Computer sessions are temporarily unavailable." });
  }
}

export async function POST(request: Request): Promise<Response> {
  const denied = guard(request); if (denied) return denied;
  const owner = webPrincipal(request)!;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.agentId !== "string" || typeof body.runtimeSessionId !== "string") {
    return apiError(request, 400, "invalid_computer_session", "agentId and runtimeSessionId are required.");
  }
  try {
    const session = await createComputerSession({
      ownerId: owner.id,
      agentId: body.agentId,
      runtimeSessionId: body.runtimeSessionId,
      goalId: typeof body.goalId === "string" ? body.goalId : undefined,
      taskId: typeof body.taskId === "string" ? body.taskId : undefined,
      runId: typeof body.runId === "string" ? body.runId : undefined,
      allowedDomains: Array.isArray(body.allowedDomains) ? body.allowedDomains.filter((value): value is string => typeof value === "string") : undefined,
    });
    return Response.json({ session }, { status: session.status === "provisioning" ? 202 : 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Computer session could not be created.";
    const status = /not found/i.test(message) ? 404 : /another Agent|not allowed|cannot create/i.test(message) ? 403 : 400;
    return computerApiFailure(request, error, {
      context: "Computer session creation failed",
      status,
      code: status === 404 ? "computer_session_dependency_not_found" : status === 403 ? "computer_session_forbidden" : "computer_session_create_failed",
      message: status === 404 ? "A required Computer session dependency was not found." : status === 403 ? "This Computer session is not allowed." : "The Computer session could not be created.",
    });
  }
}
