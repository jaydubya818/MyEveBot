import { apiError, requireDatabase } from "@/lib/api-errors";
import {
  correctOwnerKnowledge,
  forgetOwnerKnowledge,
  inspectOwnerKnowledge,
  OWNER_KNOWLEDGE_TYPES,
  searchOwnerKnowledge,
  type OwnerKnowledgeRepository,
  type OwnerKnowledgeReview,
  type OwnerKnowledgeType,
} from "@/lib/owner-knowledge";
import { MEMORY_SCOPE_TYPES, type MemoryScopeType } from "@/lib/memory-scopes";
import { requireWebAuth, webPrincipal } from "@/lib/web-auth";

const REPOSITORIES = ["memory", "knowledge"] as const;
const REVIEWS = ["needs_review", "contradictions", "stale", "recent", "corrected"] as const;
const ID_PATTERN = /^(?:memory|knowledge|agent|goal|task|gtask|project)_[A-Za-z0-9_-]{1,240}$/;

function guard(request: Request): Response | null {
  return requireWebAuth(request) ?? requireDatabase(request);
}

function repository(value: unknown): OwnerKnowledgeRepository | null {
  return typeof value === "string" && REPOSITORIES.includes(value as OwnerKnowledgeRepository) ? value as OwnerKnowledgeRepository : null;
}

function invalidId(value: string | null): boolean {
  return value !== null && !ID_PATTERN.test(value);
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : "The owner knowledge operation failed.";
}

export async function GET(request: Request): Promise<Response> {
  const denied = guard(request);
  if (denied) return denied;
  const ownerId = webPrincipal(request)!.id;
  const url = new URL(request.url);
  const requestedRepository = url.searchParams.get("repository");
  const id = url.searchParams.get("id");
  if (id !== null || requestedRepository !== null) {
    const repo = repository(requestedRepository);
    if (!repo || !id || invalidId(id)) return apiError(request, 400, "invalid_owner_knowledge_id", "Choose a valid canonical owner knowledge record.");
    try {
      const item = await inspectOwnerKnowledge(ownerId, repo, id);
      return item ? Response.json({ item }, { headers: { "Cache-Control": "no-store" } }) : apiError(request, 404, "owner_knowledge_not_found", "That information was not found.");
    } catch (error) {
      console.error("Owner knowledge inspection failed", error);
      return apiError(request, 503, "owner_knowledge_unavailable", "That information is temporarily unavailable.");
    }
  }

  const type = url.searchParams.get("type");
  const scope = url.searchParams.get("scope");
  const review = url.searchParams.get("review");
  const agentId = url.searchParams.get("agent");
  const goalId = url.searchParams.get("goal");
  const updatedFrom = url.searchParams.get("updatedFrom");
  if (type && !OWNER_KNOWLEDGE_TYPES.includes(type as OwnerKnowledgeType)) return apiError(request, 400, "invalid_owner_knowledge_type", "Unknown information type.");
  if (scope && !MEMORY_SCOPE_TYPES.includes(scope as MemoryScopeType)) return apiError(request, 400, "invalid_owner_knowledge_scope", "Unknown information scope.");
  if (review && !REVIEWS.includes(review as OwnerKnowledgeReview)) return apiError(request, 400, "invalid_owner_knowledge_review", "Unknown review queue.");
  if (invalidId(agentId) || invalidId(goalId)) return apiError(request, 400, "invalid_owner_knowledge_filter", "One of the selected filters is invalid.");
  if (updatedFrom && !/^\d{4}-\d{2}-\d{2}$/.test(updatedFrom)) return apiError(request, 400, "invalid_owner_knowledge_date", "Updated date must use YYYY-MM-DD.");

  try {
    const result = await searchOwnerKnowledge(ownerId, {
      query: url.searchParams.get("q")?.slice(0, 200),
      type: type as OwnerKnowledgeType | undefined,
      scope: scope as MemoryScopeType | undefined,
      agentId: agentId ?? undefined,
      goalId: goalId ?? undefined,
      source: url.searchParams.get("source")?.slice(0, 80),
      status: url.searchParams.get("status")?.slice(0, 40),
      updatedFrom: updatedFrom ?? undefined,
      review: review as OwnerKnowledgeReview | undefined,
      page: Number(url.searchParams.get("page") ?? "1"),
      limit: Number(url.searchParams.get("limit") ?? "25"),
    });
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Owner knowledge search failed", error);
    return apiError(request, 503, "owner_knowledge_unavailable", "What MyEve Knows is temporarily unavailable.");
  }
}

export async function PATCH(request: Request): Promise<Response> {
  const denied = guard(request);
  if (denied) return denied;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const repo = repository(body?.repository);
  if (!body || !repo || typeof body.id !== "string" || invalidId(body.id) || typeof body.content !== "string") {
    return apiError(request, 400, "invalid_owner_knowledge_correction", "Choose a valid record and corrected information.");
  }
  try {
    const result = await correctOwnerKnowledge({ ownerId: webPrincipal(request)!.id, repository: repo, id: body.id, content: body.content, preferenceValue: body.preferenceValue });
    return Response.json(result);
  } catch (error) {
    console.error("Owner knowledge correction failed", error);
    const reason = message(error);
    return apiError(request, reason.toLowerCase().includes("not found") ? 404 : 409, "owner_knowledge_correction_failed", reason);
  }
}

export async function DELETE(request: Request): Promise<Response> {
  const denied = guard(request);
  if (denied) return denied;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const repo = repository(body?.repository);
  if (!body || !repo || typeof body.id !== "string" || invalidId(body.id) || body.confirmation !== "FORGET") {
    return apiError(request, 400, "invalid_owner_knowledge_forget", "Explicit FORGET confirmation is required for a valid record.");
  }
  try {
    const result = await forgetOwnerKnowledge({ ownerId: webPrincipal(request)!.id, repository: repo, id: body.id });
    return Response.json(result, { status: result.receipt.result === "completed" ? 200 : 207 });
  } catch (error) {
    console.error("Owner knowledge forget failed", error);
    const reason = message(error);
    return apiError(request, reason.toLowerCase().includes("not found") ? 404 : 409, "owner_knowledge_forget_failed", reason);
  }
}
