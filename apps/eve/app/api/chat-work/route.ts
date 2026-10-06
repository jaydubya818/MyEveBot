import { requireWebAuth } from "../../../lib/web-auth";
import { betaRequest } from "../../../lib/beta-integration/runtime";

/** Owner-private selection UI. Availability is not execution authority. */
export async function GET(request: Request): Promise<Response> {
  const denied = await requireWebAuth(request);
  if (denied) return denied;
  if (!process.env.MYEVE_BETA_MODE) {
    return Response.json({ works: [], selectionAvailable: false }, { headers: { "Cache-Control": "no-store" } });
  }
  return betaRequest(request, "work");
}
