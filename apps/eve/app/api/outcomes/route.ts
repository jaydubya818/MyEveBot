import { apiError, requireDatabase } from "@/lib/api-errors";
import {
  EVIDENCE_TYPES,
  OUTCOME_STATUSES,
  OWNER_FEEDBACK_VALUES,
  type EvidenceType,
  type OutcomeStatus,
  type OwnerFeedback,
} from "@/lib/outcome-types";
import { createOutcome, listOutcomes } from "@/lib/outcomes";
import { requireWebAuth, webPrincipal } from "@/lib/web-auth";

function guard(request: Request) {
  return requireWebAuth(request) ?? requireDatabase(request);
}

function isOneOf<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === "string" && values.includes(value as T);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function optionalNullableString(value: unknown): string | null | undefined {
  return value === null || typeof value === "string" ? value : undefined;
}

export async function GET(request: Request): Promise<Response> {
  const denied = guard(request);
  if (denied) return denied;
  try {
    const limit = Number(new URL(request.url).searchParams.get("limit") ?? "100");
    return Response.json(
      { outcomes: await listOutcomes(webPrincipal(request)!.id, limit) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Outcome list failed", error);
    return apiError(request, 503, "outcomes_unavailable", "Outcomes are temporarily unavailable.");
  }
}

export async function POST(request: Request): Promise<Response> {
  const denied = guard(request);
  if (denied) return denied;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || !isOneOf(body.status, OUTCOME_STATUSES) || typeof body.summary !== "string") {
    return apiError(request, 400, "invalid_outcome", "A valid outcome status and summary are required.");
  }
  if (body.ownerFeedback !== undefined && !isOneOf(body.ownerFeedback, OWNER_FEEDBACK_VALUES)) {
    return apiError(request, 400, "invalid_owner_feedback", "Unknown owner feedback value.");
  }
  const evidence = Array.isArray(body.evidence)
    ? body.evidence.filter((value): value is { type: EvidenceType; id: string } => {
        if (!value || typeof value !== "object") return false;
        const item = value as Record<string, unknown>;
        return isOneOf(item.type, EVIDENCE_TYPES) && typeof item.id === "string";
      }).slice(0, 50)
    : [];
  try {
    const outcome = await createOutcome({
      ownerId: webPrincipal(request)!.id,
      goalId: optionalNullableString(body.goalId),
      goalTaskId: optionalNullableString(body.goalTaskId),
      runId: optionalNullableString(body.runId),
      status: body.status as OutcomeStatus,
      ownerFeedback: body.ownerFeedback as OwnerFeedback | undefined,
      summary: body.summary,
      rationale: Array.isArray(body.rationale) ? body.rationale.filter((item): item is string => typeof item === "string") : [],
      evidence,
      occurredAt: optionalString(body.occurredAt),
      idempotencyKey: optionalString(body.idempotencyKey),
      source: "web",
    });
    return Response.json({ outcome }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The outcome request failed.";
    return apiError(request, message.includes("not found") ? 404 : 400, "invalid_outcome", message);
  }
}
