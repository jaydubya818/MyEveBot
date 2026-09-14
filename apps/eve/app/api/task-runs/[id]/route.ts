import { apiError, requireDatabase } from "@/lib/api-errors";
import { getTaskRun, taskRootSession, transitionTask } from "@/lib/task-runs";
import { requireWebAuth, webPrincipal } from "@/lib/web-auth";

type RouteContext = { params: Promise<{ id: string }> };

function guard(request: Request): Response | null {
  return requireWebAuth(request) ?? requireDatabase(request);
}

export async function GET(request: Request, ctx: RouteContext): Promise<Response> {
  const denied = guard(request);
  if (denied) return denied;
  const owner = webPrincipal(request)!;
  const { id } = await ctx.params;
  try {
    const task = await getTaskRun(owner.id, id);
    if (task === null) return apiError(request, 404, "task_not_found", "Task not found.");
    return Response.json({ task }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Task read failed", error);
    return apiError(request, 503, "task_unavailable", "Task activity is temporarily unavailable.");
  }
}

export async function PATCH(request: Request, ctx: RouteContext): Promise<Response> {
  const denied = guard(request);
  if (denied) return denied;
  const owner = webPrincipal(request)!;
  const { id } = await ctx.params;
  const body = (await request.json().catch(() => null)) as { action?: unknown } | null;
  if (body?.action !== "cancel" && body?.action !== "retry") {
    return apiError(request, 400, "invalid_action", "Use cancel or retry.");
  }

  try {
    if (body.action === "cancel") {
      const sessionId = await taskRootSession(owner.id, id);
      if (sessionId === null) return apiError(request, 404, "task_not_found", "Task not found.");
      const cancelResponse = await fetch(
        `${new URL(request.url).origin}/eve/v1/session/${encodeURIComponent(sessionId)}/cancel`,
        {
          method: "POST",
          headers: request.headers.get("cookie")
            ? { Cookie: request.headers.get("cookie")! }
            : undefined,
          cache: "no-store",
        },
      );
      if (!cancelResponse.ok && cancelResponse.status !== 409) {
        throw new Error(`Eve cancellation returned ${cancelResponse.status}`);
      }
      const task = await transitionTask(owner.id, id, "cancelled", "owner", "Stopped by owner");
      return Response.json({ task });
    }

    const task = await transitionTask(owner.id, id, "queued", "owner", "Retry requested by owner");
    return Response.json({ task });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Task update failed.";
    if (/not found/i.test(message)) return apiError(request, 404, "task_not_found", "Task not found.");
    if (/cannot transition/i.test(message)) {
      return apiError(request, 409, "invalid_transition", message);
    }
    console.error("Task update failed", error);
    return apiError(request, 503, "task_update_failed", "The task could not be updated safely.");
  }
}
