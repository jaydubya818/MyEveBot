import { getReadinessReport } from "@/lib/readiness";
import { requireWebAuth } from "@/lib/web-auth";

export async function GET(request: Request): Promise<Response> {
  const denied = requireWebAuth(request);
  if (denied) return denied;

  const fresh = new URL(request.url).searchParams.get("fresh") === "1";
  return Response.json(await getReadinessReport({ fresh }), {
    headers: { "Cache-Control": "private, no-store" },
  });
}
