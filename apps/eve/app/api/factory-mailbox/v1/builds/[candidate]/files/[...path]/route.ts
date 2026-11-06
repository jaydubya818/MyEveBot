import { parseCandidateKey, putMacBuildFile } from "@/lib/qualification/hosted-mac-build";
import { PREVIEW_LIMITS, vercelPrivatePreviewStore } from "@/lib/qualification/hosted-preview";
import { boundedBody, hostedError, hostedJson, hostedNotFound, pollerContext } from "@/lib/qualification/hosted-http";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ candidate: string; path: string[] }> };

/** Mac: one inventoried build file (raw bytes); length and sha256 must match the submitted inventory. */
export async function PUT(request: Request, ctx: Context): Promise<Response> {
  const context = await pollerContext(request);
  if (context instanceof Response) return context;
  const { candidate, path } = await ctx.params, parsed = parseCandidateKey(candidate);
  if (!parsed) return hostedNotFound();
  const bytes = await boundedBody(request, PREVIEW_LIMITS.fileBytes);
  if (!bytes) return hostedJson({ error: "QDEV_HOSTED_BUILD_FILE_TOO_LARGE" }, 413);
  try { return hostedJson(await putMacBuildFile(context.db, context.profile, vercelPrivatePreviewStore(), parsed, path.join("/"), bytes)); }
  catch (error) { return hostedError(error); }
}
