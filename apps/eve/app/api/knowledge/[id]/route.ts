import { apiError, requireDatabase } from "@/lib/api-errors";
import { capabilityMap } from "@/lib/capabilities";
import { addKnowledgeProvenance, getKnowledge, transitionKnowledge } from "@/lib/knowledge";
import type { KnowledgeStatus, ProvenanceRelation } from "@/lib/knowledge-types";
import { requireWebAuth, webPrincipal } from "@/lib/web-auth";

type Context = { params: Promise<{ id: string }> };
function guard(request: Request): Response | null { const denied = requireWebAuth(request) ?? requireDatabase(request); if (denied) return denied; return capabilityMap().knowledge.state === "excluded" ? apiError(request, 404, "knowledge_not_included", "Knowledge is not included in this deployment.") : null; }
function handled(request: Request, error: unknown): Response { const message = error instanceof Error ? error.message : "The knowledge request failed."; return apiError(request, message.toLowerCase().includes("not found") ? 404 : 400, "invalid_knowledge", message); }

export async function GET(request: Request, context: Context): Promise<Response> {
  const denied = guard(request); if (denied) return denied;
  const record = await getKnowledge(webPrincipal(request)!.id, (await context.params).id);
  return record ? Response.json({ record }, { headers: { "Cache-Control": "no-store" } }) : apiError(request, 404, "knowledge_not_found", "Knowledge record not found.");
}

export async function PATCH(request: Request, context: Context): Promise<Response> {
  const denied = guard(request); if (denied) return denied;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body.operation !== "string") return apiError(request, 400, "invalid_knowledge", "A knowledge operation is required.");
  const ownerId = webPrincipal(request)!.id; const id = (await context.params).id;
  try {
    if (body.operation === "transition" && typeof body.status === "string") return Response.json({ record: await transitionKnowledge(ownerId, id, body.status as KnowledgeStatus) });
    if (body.operation === "add_provenance" && typeof body.sourceId === "string" && typeof body.relation === "string") {
      await addKnowledgeProvenance(ownerId, id, { sourceId: body.sourceId, relation: body.relation as ProvenanceRelation, confidence: typeof body.confidence === "number" ? body.confidence : undefined });
      return Response.json({ record: await getKnowledge(ownerId, id) });
    }
    return apiError(request, 400, "invalid_knowledge_operation", "Unknown knowledge operation.");
  } catch (error) { return handled(request, error); }
}
