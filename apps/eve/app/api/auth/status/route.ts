import { deploymentOwnerId } from "@/lib/owner-identity";
import { webAuthConfigStatus, webAuthRequired, webPrincipal } from "@/lib/web-auth";

export async function GET(request: Request): Promise<Response> {
  const required = webAuthRequired();
  return Response.json(
    {
      ownerId: webPrincipal(request)?.id ?? null,
      isPrimary: webPrincipal(request)?.id === deploymentOwnerId(),
      authenticated: webPrincipal(request) !== null,
      configured: !required || webAuthConfigStatus().configured,
      mode: required ? "owner-session" : "local-development",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
