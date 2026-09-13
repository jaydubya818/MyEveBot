import { apiError, requireDatabase } from "@/lib/api-errors";
import { listTaskRuns } from "@/lib/task-runs";
import { requireWebAuth, webPrincipal } from "@/lib/web-auth";

export async function GET(request: Request): Promise<Response> {
  const denied = requireWebAuth(request) ?? requireDatabase(request);
  if (denied) return denied;
  const owner = webPrincipal(request)!;
  const threadId = new URL(request.url).searchParams.get("threadId") ?? undefined;
  try {
    const tasks = await listTaskRuns(owner.id, threadId);
    return Response.json(
      { tasks },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Task list failed", error);
    return apiError(request, 503, "tasks_unavailable", "Task activity is temporarily unavailable.");
  }
}
