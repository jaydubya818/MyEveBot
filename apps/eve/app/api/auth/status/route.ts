import { webAuthConfigStatus, webAuthRequired, webPrincipal } from "@/lib/web-auth";

export async function GET(request: Request): Promise<Response> {
  const required = webAuthRequired();
  return Response.json(
    {
      authenticated: webPrincipal(request) !== null,
      configured: !required || webAuthConfigStatus().configured,
      mode: required ? "owner-session" : "local-development",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
