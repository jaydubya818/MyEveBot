import { authenticateWebPrincipal } from "../../../lib/web-auth.ts";
import { externalAlphaPolicy } from "../../../lib/external-alpha/policy.ts";
import { betaIntegration } from "../../../lib/beta-integration/runtime.ts";
import { readAlphaChatUsage } from "../../../lib/external-alpha/usage.ts";

export async function GET(request: Request) {
  const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
  try {
    const owner = await authenticateWebPrincipal(request);
    if (!owner) return Response.json({ error: "Sign in to view chat usage." }, { status: 401, headers });
    const policy = externalAlphaPolicy();
    if (!policy || owner.id !== policy.ownerId)
      return Response.json({ error: "Chat usage is unavailable for this workspace." }, { status: 403, headers });
    return Response.json(await readAlphaChatUsage(betaIntegration(), policy), { headers });
  } catch {
    return Response.json({ error: "Chat usage could not be refreshed. Limits still apply." }, { status: 503, headers });
  }
}
