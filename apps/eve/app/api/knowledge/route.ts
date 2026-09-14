import { apiError, requireDatabase } from "@/lib/api-errors";
import { capabilityMap } from "@/lib/capabilities";
import { createKnowledge, listKnowledge } from "@/lib/knowledge";
import { KNOWLEDGE_KINDS, type KnowledgeKind } from "@/lib/knowledge-types";
import { requireWebAuth, webPrincipal } from "@/lib/web-auth";

function guard(request: Request): Response | null {
  const denied = requireWebAuth(request) ?? requireDatabase(request);
  if (denied) return denied;
  return capabilityMap().knowledge.state === "excluded"
    ? apiError(request, 404, "knowledge_not_included", "Knowledge is not included in this deployment.")
    : null;
}

function optionalString(value: unknown): string | null | undefined { return value === null || typeof value === "string" ? value : undefined; }
function optionalNumber(value: unknown): number | undefined { return typeof value === "number" ? value : undefined; }
function handled(request: Request, error: unknown): Response {
  const message = error instanceof Error ? error.message : "The knowledge request failed.";
  return apiError(request, message.toLowerCase().includes("not found") ? 404 : 400, "invalid_knowledge", message);
}

export async function GET(request: Request): Promise<Response> {
  const denied = guard(request); if (denied) return denied;
  const url = new URL(request.url);
  const kind = url.searchParams.get("type");
  if (kind !== null && !KNOWLEDGE_KINDS.includes(kind as KnowledgeKind)) return apiError(request, 400, "invalid_knowledge_type", "Unknown knowledge type.");
  try {
    const records = await listKnowledge(webPrincipal(request)!.id, {
      kind: kind as KnowledgeKind | undefined, status: url.searchParams.get("status") ?? undefined,
      goalId: url.searchParams.get("goal") ?? undefined, query: url.searchParams.get("q") ?? undefined,
      minConfidence: url.searchParams.has("confidence") ? Number(url.searchParams.get("confidence")) : undefined,
      from: url.searchParams.get("from") ?? undefined, to: url.searchParams.get("to") ?? undefined,
      limit: Number(url.searchParams.get("limit") ?? "100"),
    });
    return Response.json({ records }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return handled(request, error); }
}

export async function POST(request: Request): Promise<Response> {
  const denied = guard(request); if (denied) return denied;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body.kind !== "string" || !KNOWLEDGE_KINDS.includes(body.kind as KnowledgeKind) || typeof body.statement !== "string") return apiError(request, 400, "invalid_knowledge", "A valid knowledge type and statement are required.");
  try {
    const record = await createKnowledge({
      ownerId: webPrincipal(request)!.id, kind: body.kind as KnowledgeKind, statement: body.statement,
      confidence: optionalNumber(body.confidence), status: typeof body.status === "string" ? body.status : undefined,
      title: optionalString(body.title), occurrenceCount: optionalNumber(body.occurrenceCount),
      firstSeenAt: optionalString(body.firstSeenAt), lastConfirmedAt: optionalString(body.lastConfirmedAt),
      firstObservedAt: optionalString(body.firstObservedAt), lastObservedAt: optionalString(body.lastObservedAt),
      testDescription: optionalString(body.testDescription), decisionTrigger: optionalString(body.decisionTrigger),
      rationale: optionalString(body.rationale), alternatives: Array.isArray(body.alternatives) ? body.alternatives.filter((item): item is string => typeof item === "string") : undefined,
      decidedAt: optionalString(body.decidedAt), reopenCondition: optionalString(body.reopenCondition),
      subject: optionalString(body.subject), dueAt: optionalString(body.dueAt),
      preferenceKey: optionalString(body.preferenceKey), preferenceValue: body.preferenceValue,
      preferenceScope: optionalString(body.preferenceScope), preferenceSourceType: optionalString(body.preferenceSourceType) as never,
      preferenceSourceId: optionalString(body.preferenceSourceId), active: typeof body.active === "boolean" ? body.active : undefined,
      reviewAt: optionalString(body.reviewAt), expiresAt: optionalString(body.expiresAt), generatedAt: optionalString(body.generatedAt),
      createdByType: "owner", goalId: optionalString(body.goalId), projectRef: optionalString(body.projectRef),
      supersedesId: optionalString(body.supersedesId),
      provenance: Array.isArray(body.provenance) ? body.provenance.filter((item): item is { sourceId: string; relation: never; confidence?: number } => typeof item === "object" && item !== null && typeof (item as { sourceId?: unknown }).sourceId === "string" && typeof (item as { relation?: unknown }).relation === "string") : undefined,
    });
    return Response.json({ record }, { status: 201 });
  } catch (error) { return handled(request, error); }
}
