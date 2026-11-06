import { PREVIEW_LIMITS, putPreviewFile, vercelPrivatePreviewStore } from "@/lib/qualification/hosted-preview";
import { boundedBody, hostedError, hostedJson, pollerContext } from "@/lib/qualification/hosted-http";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ artifact: string; path: string[] }> };

/** Mac: one release file (raw bytes) for a manifest path; accepted only when length and sha256 match the manifest entry. */
export async function PUT(request: Request, ctx: Context): Promise<Response> {
  const context = await pollerContext(request);
  if (context instanceof Response) return context;
  const { artifact, path } = await ctx.params;
  const bytes = await boundedBody(request, PREVIEW_LIMITS.fileBytes);
  if (!bytes) return hostedJson({ error: "PREVIEW_FILE_TOO_LARGE" }, 413);
  try { return hostedJson(await putPreviewFile(context.db, context.profile, vercelPrivatePreviewStore(), artifact, path.join("/"), bytes)); }
  catch (error) { return hostedError(error); }
}
