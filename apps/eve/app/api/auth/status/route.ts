import { deploymentOwnerId } from "@/lib/owner-identity";
import { webAuthConfigStatus, webAuthRequired, authenticateWebPrincipal } from "@/lib/web-auth";

export async function GET(request: Request): Promise<Response> {
  const required = webAuthRequired();
  const principal = await authenticateWebPrincipal(request);
  return Response.json(
    {
      ownerId: principal?.id ?? null,
      isPrimary: principal?.id === deploymentOwnerId(),
      authenticated: principal !== null,
      configured: !required || webAuthConfigStatus().configured,
      mode: required ? "owner-session" : "local-development",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
