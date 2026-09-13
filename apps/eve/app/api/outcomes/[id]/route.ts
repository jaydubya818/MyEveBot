import { apiError, requireDatabase } from "@/lib/api-errors";
import { capabilityMap } from "@/lib/capabilities";
import { OWNER_FEEDBACK_VALUES, type OwnerFeedback } from "@/lib/outcome-types";
import { updateOutcomeFeedback } from "@/lib/outcomes";
import { requireWebAuth, webPrincipal } from "@/lib/web-auth";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const denied = requireWebAuth(request) ?? requireDatabase(request);
  if (denied) return denied;
  if (capabilityMap().goals.state === "excluded") {
    return apiError(request, 404, "goals_not_included", "Goals are not included in this deployment.");
  }
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.ownerFeedback !== "string" || !OWNER_FEEDBACK_VALUES.includes(body.ownerFeedback as OwnerFeedback)) {
    return apiError(request, 400, "invalid_owner_feedback", "Unknown owner feedback value.");
  }
  try {
    const { id } = await context.params;
    return Response.json({
      outcome: await updateOutcomeFeedback(webPrincipal(request)!.id, id, body.ownerFeedback as OwnerFeedback),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The outcome request failed.";
    return apiError(request, message.includes("not found") ? 404 : 400, "invalid_outcome", message);
  }
}
