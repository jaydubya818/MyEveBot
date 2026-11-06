import { completePreviewUpload, vercelPrivatePreviewStore } from "@/lib/qualification/hosted-preview";
import { hostedError, hostedJson, pollerContext } from "@/lib/qualification/hosted-http";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
type Context = { params: Promise<{ artifact: string }> };

/** Mac: every file is read back from the private store and re-hashed; only then the release becomes viewable. */
export async function POST(request: Request, ctx: Context): Promise<Response> {
  const context = await pollerContext(request);
  if (context instanceof Response) return context;
  const { artifact } = await ctx.params;
  try { return hostedJson(await completePreviewUpload(context.db, context.profile, vercelPrivatePreviewStore(), artifact)); }
  catch (error) { return hostedError(error); }
}
