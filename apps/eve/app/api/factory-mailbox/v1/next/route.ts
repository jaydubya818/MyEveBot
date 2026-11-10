import { leaseMailboxRequest, MAILBOX_LIMITS } from "@/lib/engineering/factory-mailbox";
import { hostedError, hostedJson, pollerContext, NO_STORE } from "@/lib/qualification/hosted-http";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Mac poller long-poll: one leased request envelope of this installation, or 204 after at most 25 s. */
export async function GET(request: Request): Promise<Response> {
  const context = await pollerContext(request);
  if (context instanceof Response) return context;
  const wait = Number(new URL(request.url).searchParams.get("wait") ?? "0");
  if (!Number.isInteger(wait) || wait < 0 || wait * 1000 > MAILBOX_LIMITS.maxWaitMs) return hostedJson({ error: "MAILBOX_WAIT" }, 400);
  try {
    const leased = await leaseMailboxRequest(context.db, context.binding, { waitMs: wait * 1000, signal: request.signal });
    if (!leased) return new Response(null, { status: 204, headers: NO_STORE });
    // Wire contract v1 (MyFactory mailbox poller parseEnvelope): exactly id, installationId, ownerId, createdAt, deadline, target, method, path, headers,
    // bodySha256, body, bodyEncoding, leaseId. The lease expiry stays server-side; an extra field makes the poller refuse every envelope.
    const { leaseExpiresAt: _leaseExpiresAt, ...envelope } = leased;
    return hostedJson(envelope);
  } catch (error) { return hostedError(error); }
}
