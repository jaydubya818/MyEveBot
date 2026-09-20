import { FederationStore } from "@/lib/relay/store";
import { retrieveArtifact } from "@/lib/relay/artifacts";
export const runtime = "nodejs";
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (process.env.MYEVE_RELAY_ENABLED !== "true")
    return new Response(null, { status: 404 });
  try {
    const ownerId =
      process.env.MYEVE_OWNER_ID ?? process.env.SOFIE_OWNER_ID ?? "owner";
    const { content, type } = await retrieveArtifact(
      new FederationStore(ownerId),
      (await context.params).id,
      request.url,
      request.headers.get("authorization") ?? "",
    );
    return new Response(content, {
      headers: {
        "content-type": type,
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    return new Response(null, { status: 403 });
  }
}
