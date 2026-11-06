import { beginPreviewUpload, vercelPrivatePreviewStore } from "@/lib/qualification/hosted-preview";
import { boundedBody, hostedError, hostedJson, pollerContext } from "@/lib/qualification/hosted-http";

export const dynamic = "force-dynamic";

/** Mac: register a verified release (signed PASS verdict + the release manifest it binds). Returns the files still to upload. */
export async function POST(request: Request): Promise<Response> {
  const context = await pollerContext(request);
  if (context instanceof Response) return context;
  const raw = await boundedBody(request, 512 * 1024);
  if (!raw) return hostedJson({ error: "PREVIEW_UPLOAD_TOO_LARGE" }, 413);
  let input: unknown;
  try { input = JSON.parse(Buffer.from(raw).toString("utf8")); } catch { return hostedJson({ error: "PREVIEW_UPLOAD_SHAPE" }, 400); }
  try { return hostedJson(await beginPreviewUpload(context.db, context.profile, vercelPrivatePreviewStore(), input)); }
  catch (error) { return hostedError(error); }
}
