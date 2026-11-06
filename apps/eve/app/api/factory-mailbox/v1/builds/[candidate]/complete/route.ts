import { completeMacBuildUpload, parseCandidateKey } from "@/lib/qualification/hosted-mac-build";
import { vercelPrivatePreviewStore } from "@/lib/qualification/hosted-preview";
import { hostedError, hostedJson, hostedNotFound, pollerContext } from "@/lib/qualification/hosted-http";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
type Context = { params: Promise<{ candidate: string }> };

/** Mac: hosted re-retains the bytes and verifies the build claim against its own expected binding and the pinned issuer. */
export async function POST(request: Request, ctx: Context): Promise<Response> {
  const context = await pollerContext(request);
  if (context instanceof Response) return context;
  const parsed = parseCandidateKey((await ctx.params).candidate);
  if (!parsed) return hostedNotFound();
  try { return hostedJson(await completeMacBuildUpload(context.db, context.profile, vercelPrivatePreviewStore(), parsed)); }
  catch (error) { return hostedError(error); }
}
