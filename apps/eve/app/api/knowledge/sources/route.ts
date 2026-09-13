import { apiError, requireDatabase } from "@/lib/api-errors";
import { capabilityMap } from "@/lib/capabilities";
import { createKnowledgeSource, listKnowledgeSources } from "@/lib/knowledge";
import { SOURCE_TYPES, type SourceType } from "@/lib/knowledge-types";
import { requireWebAuth, webPrincipal } from "@/lib/web-auth";

function guard(request: Request): Response | null { const denied = requireWebAuth(request) ?? requireDatabase(request); if (denied) return denied; return capabilityMap().knowledge.state === "excluded" ? apiError(request, 404, "knowledge_not_included", "Knowledge is not included in this deployment.") : null; }
function optionalString(value: unknown): string | null | undefined { return value === null || typeof value === "string" ? value : undefined; }

export async function GET(request: Request): Promise<Response> { const denied = guard(request); if (denied) return denied; return Response.json({ sources: await listKnowledgeSources(webPrincipal(request)!.id, Number(new URL(request.url).searchParams.get("limit") ?? "100")) }, { headers: { "Cache-Control": "no-store" } }); }
export async function POST(request: Request): Promise<Response> {
  const denied = guard(request); if (denied) return denied;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body.sourceType !== "string" || !SOURCE_TYPES.includes(body.sourceType as SourceType)) return apiError(request, 400, "invalid_source", "A valid source type is required.");
  try { return Response.json({ source: await createKnowledgeSource({ ownerId: webPrincipal(request)!.id, sourceType: body.sourceType as SourceType, provider: optionalString(body.provider), externalId: optionalString(body.externalId), referenceUri: optionalString(body.referenceUri), author: optionalString(body.author), capturedAt: typeof body.capturedAt === "string" ? body.capturedAt : undefined, contentHash: optionalString(body.contentHash), snapshotRef: optionalString(body.snapshotRef) }) }, { status: 201 }); }
  catch (error) { return apiError(request, 400, "invalid_source", error instanceof Error ? error.message : "The source could not be created."); }
}
