import { computerRuntimeReadiness } from "@/lib/computer-runtime";
import { requireWebAuth, webPrincipal } from "@/lib/web-auth";

export async function GET(request: Request): Promise<Response> {
  const denied = requireWebAuth(request); if (denied) return denied;
  return Response.json(await computerRuntimeReadiness(webPrincipal(request)!.id), {
    headers: { "Cache-Control": "no-store" },
  });
}
