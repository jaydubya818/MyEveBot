import { get } from "@vercel/blob";

import { apiError, requireDatabase } from "@/lib/api-errors";
import { artifactStorageKey } from "@/lib/task-runs";
import { requireWebAuth, webPrincipal } from "@/lib/web-auth";

type RouteContext = { params: Promise<{ id: string; artifactId: string }> };

const INLINE_EVIDENCE_TYPES = new Set([
  "application/json",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/markdown",
  "text/plain",
]);

export async function GET(request: Request, ctx: RouteContext): Promise<Response> {
  const denied = requireWebAuth(request) ?? requireDatabase(request);
  if (denied) return denied;
  const owner = webPrincipal(request)!;
  const { id, artifactId } = await ctx.params;
  try {
    const artifact = await artifactStorageKey(owner.id, id, artifactId);
    if (artifact === null) return apiError(request, 404, "artifact_not_found", "Evidence not found.");
    const blob = await get(artifact.storageKey, { access: "private" });
    if (blob === null || blob.statusCode !== 200) {
      return apiError(request, 404, "artifact_not_found", "Evidence not found.");
    }
    const contentType = artifact.contentType.toLowerCase().split(";", 1)[0]?.trim() ?? "";
    const disposition = INLINE_EVIDENCE_TYPES.has(contentType) ? "inline" : "attachment";
    const filename = artifact.filename.replace(/[\u0000-\u001f\u007f"\\]/g, "_");
    return new Response(blob.stream, {
      headers: {
        "Content-Type": artifact.contentType,
        "Content-Disposition": `${disposition}; filename="${filename}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Evidence download failed", error);
    return apiError(request, 503, "artifact_unavailable", "Evidence is temporarily unavailable.");
  }
}
