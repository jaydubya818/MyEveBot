import { apiError, requireDatabase } from "@/lib/api-errors";
import { capabilityMap } from "@/lib/capabilities";
import { createKnowledgeRelationship, listKnowledgeRelationships } from "@/lib/knowledge";
import { RELATIONSHIP_ENTITY_TYPES, type RelationshipEntityType } from "@/lib/knowledge-types";
import { requireWebAuth, webPrincipal } from "@/lib/web-auth";

function guard(request: Request): Response | null { const denied = requireWebAuth(request) ?? requireDatabase(request); if (denied) return denied; return capabilityMap().knowledge.state === "excluded" ? apiError(request, 404, "knowledge_not_included", "Knowledge is not included in this deployment.") : null; }
export async function GET(request: Request): Promise<Response> { const denied = guard(request); if (denied) return denied; const url = new URL(request.url); const type = url.searchParams.get("type"); const id = url.searchParams.get("id"); if (type && !RELATIONSHIP_ENTITY_TYPES.includes(type as RelationshipEntityType)) return apiError(request, 400, "invalid_relationship_type", "Unknown relationship endpoint type."); return Response.json({ relationships: await listKnowledgeRelationships(webPrincipal(request)!.id, type && id ? { type: type as RelationshipEntityType, id } : undefined) }, { headers: { "Cache-Control": "no-store" } }); }
export async function POST(request: Request): Promise<Response> {
  const denied = guard(request); if (denied) return denied; const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body.subjectType !== "string" || typeof body.objectType !== "string" || !RELATIONSHIP_ENTITY_TYPES.includes(body.subjectType as RelationshipEntityType) || !RELATIONSHIP_ENTITY_TYPES.includes(body.objectType as RelationshipEntityType) || typeof body.subjectId !== "string" || typeof body.objectId !== "string" || typeof body.predicate !== "string") return apiError(request, 400, "invalid_relationship", "Valid relationship endpoints and predicate are required.");
  try { return Response.json({ relationship: await createKnowledgeRelationship({ ownerId: webPrincipal(request)!.id, subjectType: body.subjectType as RelationshipEntityType, subjectId: body.subjectId, predicate: body.predicate, objectType: body.objectType as RelationshipEntityType, objectId: body.objectId, confidence: typeof body.confidence === "number" ? body.confidence : undefined }) }, { status: 201 }); }
  catch (error) { return apiError(request, 400, "invalid_relationship", error instanceof Error ? error.message : "The relationship could not be created."); }
}
