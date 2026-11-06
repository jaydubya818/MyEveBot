import { webPrincipal } from "@/lib/web-auth";
import { previewGrantBase, previewGrantKey, servePreviewFile, verifyPreviewGrant, vercelPrivatePreviewStore } from "@/lib/qualification/hosted-preview";
import { hostedContext, hostedError, hostedNotFound } from "@/lib/qualification/hosted-http";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ artifact: string; grant: string; path?: string[] }> };

/**
 * One file of a verified release. Requires the owner-issued grant bound to this owner, installation and release (the sandboxed preview has an
 * opaque origin, so the SameSite=Strict session cannot ride along on its sub-resource requests). If a session cookie is present it must be
 * the owner's. Every response re-verifies the signed PASS verdict (against the installation's VERIFIED build), the manifest it binds and the
 * file's sha256.
 */
async function handle(request: Request, ctx: Context): Promise<Response> {
  const context = hostedContext();
  if (!context) return hostedNotFound();
  try {
    const { artifact, grant, path } = await ctx.params;
    if (!verifyPreviewGrant(previewGrantKey(process.env.MYEVE_SESSION_SECRET), context.binding, artifact, grant)) return hostedNotFound();
    if (request.headers.get("cookie") && webPrincipal(request) && webPrincipal(request)?.id !== context.profile.ownerId) return hostedNotFound();
    // Browser context: root-relative references are kept inside this grant path and opaque-origin module loads are answered (see hosted-preview.ts).
    return await servePreviewFile(context.db, context.profile, vercelPrivatePreviewStore(), artifact, (path ?? []).join("/"), request.method, undefined,
      { grantBase: previewGrantBase(artifact, grant), requestOrigin: request.headers.get("origin") });
  } catch (error) { return hostedError(error); }
}
export const GET = handle;
export const HEAD = handle;
