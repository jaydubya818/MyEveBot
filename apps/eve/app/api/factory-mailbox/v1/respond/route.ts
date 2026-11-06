import { MAILBOX_LIMITS, respondMailboxRequest } from "@/lib/engineering/factory-mailbox";
import { boundedBody, hostedError, hostedJson, pollerContext } from "@/lib/qualification/hosted-http";

export const dynamic = "force-dynamic";

/** Mac poller: the reply for exactly one live lease, bound to the request id and request body sha256. */
export async function POST(request: Request): Promise<Response> {
  const context = await pollerContext(request);
  if (context instanceof Response) return context;
  const raw = await boundedBody(request, Math.ceil(MAILBOX_LIMITS.maxBodyBytes / 3) * 4 + 16_384);
  if (!raw) return hostedJson({ error: "MAILBOX_BODY_TOO_LARGE" }, 413);
  let input: unknown;
  try { input = JSON.parse(Buffer.from(raw).toString("utf8")); } catch { return hostedJson({ error: "MAILBOX_RESPONSE_SHAPE" }, 400); }
  try { await respondMailboxRequest(context.db, context.binding, input); return hostedJson({ ok: true }); }
  catch (error) { return hostedError(error); }
}
