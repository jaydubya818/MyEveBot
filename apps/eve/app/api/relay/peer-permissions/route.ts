import { z } from "zod";
import { authenticatedOwner } from "@/lib/relay/owner-api";
import { FederationStore } from "@/lib/relay/store";
import { boundedJson, RelayClient } from "@/lib/relay/client";
import { peerReadModel, PeerPermissionError, permissionCommandSchema, savePeerPermission } from "@/lib/relay/peer-permissions";

export const runtime = "nodejs";
const headers = { "cache-control": "no-store" };
async function handle(request: Request) {
  try {
    const store = new FederationStore(authenticatedOwner(request));
    if (request.method === "POST") {
      const input = permissionCommandSchema.parse(await boundedJson(new Response(request.body), 64 * 1024));
      if (process.env.MYEVE_RELAY_ENABLED !== "true" && !input.revoke) throw new PeerPermissionError("FEDERATION_DISABLED", "Federation is disabled. Existing relationships can still be revoked.", 403);
      const permission = await savePeerPermission(store, input);
      return Response.json({ saved: true, id: permission.id, revision: permission.revision,
        message: "MyEve policy saved. Relay independently controls effective access." }, { headers });
    }
    const model = await peerReadModel(store, undefined, new URL(request.url).searchParams.get("id") ?? undefined);
    let peers: unknown[] = [], discoveryStatus = "UNAVAILABLE";
    if (process.env.MYEVE_RELAY_ENABLED === "true") try {
      const connection = await store.connection();
      const result = await new RelayClient(connection.credential).command({ operation: "discover", input: {} });
      if (Array.isArray(result.agents)) { peers = result.agents.slice(0, 50); discoveryStatus = "AVAILABLE"; }
    } catch { /* Existing policy can still be viewed and revoked offline. */ }
    return Response.json({ ...model, peers, discoveryStatus }, { headers });
  } catch (error) {
    if (error instanceof PeerPermissionError) return Response.json({ code: error.code, error: error.message }, { status: error.status, headers });
    if (error instanceof z.ZodError) return Response.json({ error: "Check the exact peer, capability, resource scope, and expiration." }, { status: 400, headers });
    const auth = error instanceof Error && /Sign in|Same-origin/.test(error.message);
    return Response.json({ error: auth ? error.message : "Peer permissions could not be loaded or saved. Retry without changing your selection." }, { status: auth ? 403 : 503, headers });
  }
}
export const GET = handle;
export const POST = handle;
