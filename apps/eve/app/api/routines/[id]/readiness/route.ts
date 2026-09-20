import { RoutineAdmission } from "@/lib/routine-admission";
import { requireWebAuth, webPrincipal } from "@/lib/web-auth";
import { requireDatabase, apiError } from "@/lib/api-errors";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = requireWebAuth(request) ?? requireDatabase(request);
  if (denied) return denied;
  try {
    const { id } = await params;
    const readiness = await new RoutineAdmission().inspect(
      webPrincipal(request)!.id,
      id,
    );
    return readiness
      ? Response.json(
          { readiness },
          { headers: { "Cache-Control": "no-store" } },
        )
      : apiError(request, 404, "routine_missing", "Routine not found.");
  } catch {
    return apiError(
      request,
      503,
      "readiness_unavailable",
      "Readiness could not be checked.",
    );
  }
}
