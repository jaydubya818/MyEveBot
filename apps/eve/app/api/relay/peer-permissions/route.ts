import { z } from "zod";
import { authenticatedOwner } from "@/lib/relay/owner-api";
import { FederationStore } from "@/lib/relay/store";
import { boundedJson, RelayClient } from "@/lib/relay/client";
import { peerReadModel, PeerPermissionError, permissionCommandSchema, savePeerPermission, inspectPeerAuthority, peerAddressSchema } from "@/lib/relay/peer-permissions";
import { randomUUID } from "node:crypto";

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
      if (Array.isArray(result.agents)) {
        peers = await Promise.all(result.agents.slice(0, 20).map(async (peer: {address?: string; name?: string; capabilities?: {name: string}[]}) => {
          const address = peerAddressSchema.safeParse(peer.address);
          if (!address.success) return null;
          // The peer-address messaging resource is offered only when Relay confirms
          // this caller's exact authority. Discovery itself never supplies a grant.
          const inspection = peer.capabilities?.some(c => c.name === "message.send") ? await inspectPeerAuthority(connection, {
            target: address.data, resource: address.data, capability: "message.send", idempotencyKey: `configure-${randomUUID()}`,
            expiresAt: new Date(Date.now() + 60_000).toISOString(), payload: {body: "Inspect messaging relationship configuration"},
          }) : null;
          return {address: address.data, name: peer.name, messagingResource: inspection?.authorized ? address.data : null};
        }));
        peers = peers.filter(Boolean); discoveryStatus = "AVAILABLE";
      }
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
