import { requireWebAuth, webPrincipal } from "@/lib/web-auth";
import { issuePreviewGrant, latestPreview, previewGrantKey } from "@/lib/qualification/hosted-preview";
import { hostedContext, hostedError, hostedNotFound, NO_STORE } from "@/lib/qualification/hosted-http";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ artifact: string }> };

/**
 * The Result link. Owner session only (same-origin, signed SameSite=Strict session): resolves `latest` or one release of THIS owner and
 * installation and redirects to a 10-minute grant path for the sandboxed preview. Nothing here is public.
 */
export async function GET(request: Request, ctx: Context): Promise<Response> {
  const context = hostedContext();
  if (!context) return hostedNotFound();
  const denied = await requireWebAuth(request);
  if (denied) return denied;
  if (webPrincipal(request)?.id !== context.profile.ownerId) return hostedNotFound();
  try {
    const { artifact } = await ctx.params;
    const target = artifact === "latest" ? await latestPreview(context.db, context.profile) : artifact;
    if (!target || !/^[a-f0-9]{64}$/.test(target)) return hostedNotFound();
    const [ready] = await context.db.query("SELECT 1 AS ok FROM hosted_verified_previews WHERE installation_id=$1 AND owner_id=$2 AND artifact_sha256=$3 AND state='READY'",
      [context.binding.installationId, context.binding.ownerId, target]);
    if (!ready) return hostedNotFound();
    const grant = issuePreviewGrant(previewGrantKey(process.env.MYEVE_SESSION_SECRET), context.binding, target);
    return new Response(null, { status: 303, headers: { ...NO_STORE, "referrer-policy": "no-referrer", location: `/api/previews/v1/${target}/g/${grant}/index.html` } });
  } catch (error) { return hostedError(error); }
}
