import { z } from "zod";
import { requireSameOrigin, requireWebAuth, webPrincipal } from "@/lib/web-auth";
import { byteSize, canonicalJson, exportCapsule, exportPreview, ownerReference } from "@/lib/capsules/format";
import { prepareImport, previewImport } from "@/lib/capsules/import";
import { candidateSummaries, capsuleService } from "@/lib/capsules/service";
import { CAPSULE_EXCLUSIONS, CapsuleError } from "@/lib/capsules/schema";

export const runtime = "nodejs";
const selection = { selectedIds: z.array(z.string().max(160)).min(1).max(100) };
const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("export_preview"), ...selection }).strict(),
  z.object({ action: z.literal("export"), ...selection, reviewedDigest: z.string().max(80) }).strict(),
  z.object({ action: z.literal("import_preview"), raw: z.string().max(1_048_576) }).strict(),
  z.object({ action: z.literal("import"), raw: z.string().max(1_048_576), reviewedDigest: z.string().max(80), decisions: z.unknown() }).strict(),
]);
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const json = (value: unknown, status = 200) => Response.json(value, { status, headers });
function failure(error: unknown) {
  return error instanceof CapsuleError ? json({ error: error.message, code: error.code }, 400) : json({ error: "Capsule review is temporarily unavailable. Try again; no active experience was changed." }, 503);
}
async function boundedBody(request: Request): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new CapsuleError("body", "A request body is required.");
  const chunks: Uint8Array[] = []; let total = 0;
  try {
    while (true) { const next = await reader.read(); if (next.done) break; total += next.value.byteLength; if (total > 2_200_000) { await reader.cancel(); throw new CapsuleError("size", "The request exceeds the Capsule size limit."); } chunks.push(next.value); }
    try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new CapsuleError("body", "Invalid request JSON."); }
  } finally { reader.releaseLock(); }
}
const guard = (request: Request) => requireWebAuth(request) ?? requireSameOrigin(request);
export async function GET(request: Request) {
  const denied = guard(request); if (denied) return denied;
  let service: Awaited<ReturnType<typeof capsuleService>> | undefined;
  try {
    const ownerId = webPrincipal(request)!.id;
    service = await capsuleService(ownerId);
    return json({ mode: service.mode, candidates: candidateSummaries(service.candidates, ownerId), exclusions: CAPSULE_EXCLUSIONS, reviews: service.reviews });
  } catch (error) { return failure(error); } finally { service?.close(); }
}
export async function POST(request: Request) {
  const denied = guard(request); if (denied) return denied;
  let service: Awaited<ReturnType<typeof capsuleService>> | undefined;
  try {
    const parsed = requestSchema.safeParse(await boundedBody(request));
    if (!parsed.success) throw new CapsuleError("request", "Choose a valid Capsule operation.");
    const body = parsed.data;
    const ownerId = webPrincipal(request)!.id;
    service = await capsuleService(ownerId);
    if (body.action === "export_preview") return json(exportPreview(service.candidates, body.selectedIds, ownerReference(ownerId)));
    if (body.action === "export") {
      const capsule = exportCapsule({ candidates: service.candidates, selectedIds: body.selectedIds, reviewedDigest: body.reviewedDigest, ownerRef: ownerReference(ownerId), eveRef: service.mode === "qualification" ? "sofie-a" : "source-eve" });
      return json({ raw: canonicalJson(capsule), bytes: byteSize(capsule), digest: capsule.digest });
    }
    const destination = await service.adapter.snapshot();
    if (body.action === "import_preview") return json(previewImport(body.raw, destination));
    const batch = prepareImport(body.raw, destination, body.reviewedDigest, body.decisions);
    return json({ ...await service.adapter.commit(batch), mode: service.mode, message: "Review saved. Current Truth is unchanged; Skills and behavior remain inactive until destination qualification." });
  } catch (error) { return failure(error); } finally { service?.close(); }
}
export async function DELETE(request: Request) {
  const denied = guard(request); if (denied) return denied;
  let service: Awaited<ReturnType<typeof capsuleService>> | undefined;
  try {
    const body = z.object({ id: z.string().regex(/^capsule_[a-f0-9]{64}$/) }).strict().safeParse(await boundedBody(request));
    if (!body.success) throw new CapsuleError("request", "Choose a saved Capsule review.");
    service = await capsuleService(webPrincipal(request)!.id);
    return json({ removed: await service.remove(body.data.id) });
  } catch (error) { return failure(error); } finally { service?.close(); }
}
