import { apiError, requireDatabase } from "@/lib/api-errors";
import { REVIEW_KINDS, type ReviewKind } from "@/lib/review-types";
import { generateProgressReview } from "@/lib/reviews";
import { requireWebAuth, webPrincipal } from "@/lib/web-auth";

function kindFrom(value: unknown): ReviewKind | null {
  return typeof value === "string" && REVIEW_KINDS.includes(value as ReviewKind)
    ? value as ReviewKind
    : null;
}

function guard(request: Request) {
  return requireWebAuth(request) ?? requireDatabase(request);
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
  const kind = kindFrom(body?.kind ?? "daily");
  if (kind === null) return apiError(request, 400, "invalid_review_kind", "Review kind must be daily or weekly.");
  try {
    return Response.json({ review: await generateProgressReview(webPrincipal(request)!.id, kind, { checkpoint: true }) });
  } catch (error) {
    console.error("Review generation failed", error);
    return apiError(request, 503, "review_unavailable", "The progress review is temporarily unavailable.");
  }
}
