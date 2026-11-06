import { beginMacBuildUpload, pendingMacBuilds } from "@/lib/qualification/hosted-mac-build";
import { vercelPrivatePreviewStore } from "@/lib/qualification/hosted-preview";
import { boundedBody, hostedError, hostedJson, pollerContext } from "@/lib/qualification/hosted-http";

export const dynamic = "force-dynamic";

/** Mac: the builds this installation's journey is waiting for (expected binding included), and whether their private preview is ready. */
export async function GET(request: Request): Promise<Response> {
  const context = await pollerContext(request);
  if (context instanceof Response) return context;
  try { return hostedJson({ builds: await pendingMacBuilds(context.db, context.profile) }); }
  catch (error) { return hostedError(error); }
}

/** Mac: register a built candidate (inventory, lock pin, Mac-signed build claim). Returns the files still to upload. */
export async function POST(request: Request): Promise<Response> {
  const context = await pollerContext(request);
  if (context instanceof Response) return context;
  const raw = await boundedBody(request, 512 * 1024);
  if (!raw) return hostedJson({ error: "QDEV_HOSTED_BUILD_UPLOAD_TOO_LARGE" }, 413);
  let input: unknown;
  try { input = JSON.parse(Buffer.from(raw).toString("utf8")); } catch { return hostedJson({ error: "QDEV_HOSTED_BUILD_UPLOAD_SHAPE" }, 400); }
  try { return hostedJson(await beginMacBuildUpload(context.db, context.profile, vercelPrivatePreviewStore(), input)); }
  catch (error) { return hostedError(error); }
}
