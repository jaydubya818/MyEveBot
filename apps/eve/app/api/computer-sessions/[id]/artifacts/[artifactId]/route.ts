import { get } from "@vercel/blob";

import { apiError, requireDatabase } from "@/lib/api-errors";
import { computerApiFailure } from "@/lib/computer-api-errors";
import { computerArtifactStorageKey } from "@/lib/computer-sessions";
import { requireWebAuth, webPrincipal } from "@/lib/web-auth";

type RouteContext = { params: Promise<{ id: string; artifactId: string }> };

export async function GET(request: Request, ctx: RouteContext): Promise<Response> {
  const denied = requireWebAuth(request) ?? requireDatabase(request); if (denied) return denied;
  const { id, artifactId } = await ctx.params;
  try {
    const artifact = await computerArtifactStorageKey(webPrincipal(request)!.id, id, artifactId);
    if (!artifact) return apiError(request, 404, "computer_artifact_not_found", "Artifact not found.");
    const blob = await get(artifact.storageKey, { access: "private" });
    if (!blob?.stream) return apiError(request, 404, "computer_artifact_not_found", "Artifact not found.");
    const filename = artifact.filename.replace(/[\u0000-\u001f\u007f"\\]/g, "_");
    return new Response(blob.stream, { headers: {
      "Content-Type": artifact.contentType,
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    } });
  } catch (error) {
    return computerApiFailure(request, error, { context: "Computer artifact read failed", code: "computer_artifact_unavailable", message: "Artifact is temporarily unavailable." });
  }
}
