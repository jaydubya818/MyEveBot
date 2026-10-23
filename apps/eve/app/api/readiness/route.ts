import { getReadinessReport } from "@/lib/readiness";
import { authenticateWebPrincipal, requireWebAuth } from "@/lib/web-auth";
import { createHash } from "node:crypto";
import { externalAlphaPolicy } from "@/lib/external-alpha/policy";
import { digest } from "@/lib/engineering/contract";

export async function GET(request: Request): Promise<Response> {
  const denied = await requireWebAuth(request);
  if (denied) return denied;

  // Explicit owner-only enrollment diagnostic, outside the cached report.
  // This verifier cannot be used as the bearer token and grants no authority.
  if (new URL(request.url).searchParams.get("alphaEnrollment") === "1") {
    const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
    try {
      const principal = await authenticateWebPrincipal(request);
      const policy = externalAlphaPolicy(); // validates current production/project/key binding
      if (!principal || !policy || principal.id !== policy.ownerId)
        return Response.json({ error: "owner_required" }, { status: 403, headers });
      const token = process.env.MYEVE_EXTERNAL_ALPHA_ACCOUNTING_TOKEN;
      if (!token || !/^[a-f0-9]{64}$/.test(token)) throw Error();
      return Response.json({
        ownerId: policy.ownerId,
        projectId: policy.projectId,
        cohortId: policy.cohortId,
        slot: policy.slot,
        policySha256: digest(policy),
        credentialSha256: createHash("sha256").update(token, "utf8").digest("hex"),
      }, { headers });
    } catch {
      // Never include exception/connection/environment contents in this response.
      return Response.json({ error: "alpha_enrollment_unavailable" }, { status: 503, headers });
    }
  }

  const fresh = new URL(request.url).searchParams.get("fresh") === "1";
  return Response.json(await getReadinessReport({ fresh }), {
    headers: { "Cache-Control": "private, no-store" },
  });
}
