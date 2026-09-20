import { requireWebAuth, webPrincipal } from "@/lib/web-auth";
import { requireDatabase, apiError } from "@/lib/api-errors";
import { runRoutineNow } from "@/lib/routine-run-now";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = requireWebAuth(request) ?? requireDatabase(request);
  if (denied) return denied;
  const { id } = await params,
    body = await request.json().catch(() => null);
  if (!Number.isSafeInteger(body?.version) || body.version < 1)
    return apiError(
      request,
      400,
      "invalid_version",
      "Refresh this Routine before running it.",
    );
  try {
    const result = await runRoutineNow(
      webPrincipal(request)!.id,
      id,
      body.version,
    );
    return Response.json(result, {
      status: result.status,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return apiError(
      request,
      503,
      "routine_unavailable",
      "Readiness could not be checked. Execution was not started.",
    );
  }
}
