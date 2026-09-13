import { apiError, requireDatabase } from "@/lib/api-errors";
import { capabilityMap } from "@/lib/capabilities";
import { REVIEW_KINDS, type ReviewKind } from "@/lib/review-types";
import { generateProgressReview } from "@/lib/reviews";
import { requireWebAuth, webPrincipal } from "@/lib/web-auth";

function kindFrom(value: unknown): ReviewKind | null {
  return typeof value === "string" && REVIEW_KINDS.includes(value as ReviewKind)
    ? value as ReviewKind
    : null;
}

function guard(request: Request) {
  const denied = requireWebAuth(request) ?? requireDatabase(request);
  if (denied) return denied;
  if (capabilityMap().goals.state === "excluded") {
    return apiError(request, 404, "goals_not_included", "Goals are not included in this deployment.");
  }
  return null;
}

export async function GET(request: Request): Promise<Response> {
  const denied = guard(request);
  if (denied) return denied;
  const kind = kindFrom(new URL(request.url).searchParams.get("kind") ?? "daily");
  if (kind === null) return apiError(request, 400, "invalid_review_kind", "Review kind must be daily or weekly.");
  try {
    return Response.json(
      { review: await generateProgressReview(webPrincipal(request)!.id, kind) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Review preview failed", error);
    return apiError(request, 503, "review_unavailable", "The progress review is temporarily unavailable.");
  }
}

export async function POST(request: Request): Promise<Response> {
  const denied = guard(request);
  if (denied) return denied;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (body === null) return apiError(request, 400, "invalid_review_request", "Choose a daily or weekly review.");
  const kind = kindFrom(body.kind);
  if (kind === null) return apiError(request, 400, "invalid_review_kind", "Review kind must be daily or weekly.");
  try {
    return Response.json({ review: await generateProgressReview(webPrincipal(request)!.id, kind, { checkpoint: true }) });
  } catch (error) {
    console.error("Review generation failed", error);
    return apiError(request, 503, "review_unavailable", "The progress review is temporarily unavailable.");
  }
}
