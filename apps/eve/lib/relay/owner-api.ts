import { createPublicKey } from "node:crypto";
import { z } from "zod";
import { listKnowledge } from "../knowledge.ts";
import { webPrincipal } from "../web-auth.ts";
import { FederationStore } from "./store.ts";
import { boundedJson, relayOrigin } from "./client.ts";
import {
  connectOwner,
  previewPublication,
  confirmPublication,
  publicationStatus,
  grantPeer,
  revokeGrant,
  rotateOrRevoke,
} from "./owner.ts";
import {
  pollRelay,
  sendExternal,
  getExternalResult,
  decideExternalWork,
} from "./inbox.ts";
import { importReceipts } from "./receipts.ts";
import { artifactShare } from "./artifacts.ts";
import { decryptSecret } from "./transport.ts";

export function authenticatedOwner(request: Request) {
  // Federation never inherits the application's development authentication bypass.
  const principal = webPrincipal(request, {
    ...process.env,
    NODE_ENV: "production",
  });
  if (!principal) throw new Error("Sign in to MyEve first.");
  const ownerOrigin = new URL(
    process.env.MYEVE_RELAY_OWNER_ORIGIN ?? request.url,
  ).origin;
  if (
    request.method !== "GET" &&
    (request.headers.get("origin") !== ownerOrigin ||
      request.headers.get("sec-fetch-site") === "cross-site")
  )
    throw new Error("Same-origin owner action required.");
  return principal.id;
}
export async function relayDashboard(store: FederationStore) {
  await store.purge();
  const query = (sql: string) => store.database.query(sql, [store.ownerId]);
  const [
    connections,
    agents,
    knowledge,
    publications,
    grants,
    inbox,
    activity,
    receipts,
    artifacts,
    peers,
  ] = await Promise.all([
    query(
      "SELECT local_agent_id,relay_owner_id,relay_agent_id,address,status,local_work_policy,signing_key_id FROM myeve_relay_connections WHERE owner_id=$1",
    ),
    query(
      "SELECT id,name FROM agents WHERE owner_id=$1 AND status='active' ORDER BY created_at",
    ),
    listKnowledge(store.ownerId, { limit: 100 }).then((records) =>
      records
        .filter((r) => !r.supersededById)
        .map(({ id, kind, statement }) => ({ id, kind, statement })),
    ),
    query(
      "SELECT id,name,visibility,audience,status,version,expires_at FROM myeve_relay_publications WHERE owner_id=$1 ORDER BY created_at DESC LIMIT 100",
    ),
    query(
      "SELECT id,document,status FROM myeve_relay_grants WHERE owner_id=$1 ORDER BY created_at DESC LIMIT 100",
    ),
    query(
      "SELECT request_id,direction,capability,conversation_id,sender_owner_id,sender_agent_id,state,local_run_id,local_decision,relay_acknowledged,envelope_encrypted,result_encrypted,created_at FROM myeve_relay_requests WHERE owner_id=$1 ORDER BY created_at DESC LIMIT 100",
    ),
    query(
      "SELECT kind,request_id,metadata,created_at FROM myeve_relay_activity WHERE owner_id=$1 ORDER BY created_at DESC LIMIT 100",
    ),
    query(
      "SELECT record FROM myeve_relay_receipts WHERE owner_id=$1 ORDER BY sequence DESC LIMIT 100",
    ),
    query(
      "SELECT id,metadata,expires_at,revoked FROM myeve_relay_artifacts WHERE owner_id=$1 ORDER BY created_at DESC LIMIT 100",
    ),
    query(
      "SELECT address,artifact_origin FROM myeve_relay_peers WHERE owner_id=$1",
    ),
  ]);
  return {
    enabled: true,
    origin: relayOrigin(),
    connection: connections[0] ?? null,
    agents,
    knowledge,
    publications,
    grants,
    inbox: inbox.map(({ envelope_encrypted, result_encrypted, ...row }) => ({
      ...row,
      envelope: envelope_encrypted
        ? decryptSecret(store.ownerId, envelope_encrypted)
        : null,
      result: result_encrypted
        ? decryptSecret(store.ownerId, result_encrypted)
        : null,
    })),
    activity,
    receipts: receipts.map((r) => r.record),
    artifacts,
    peers,
  };
}
const commandSchema = z
  .object({
    operation: z.enum([
      "connect",
      "preview",
      "confirm",
      "publication-status",
      "grant",
      "revoke-grant",
      "rotate",
      "revoke-credential",
      "poll",
      "send",
      "get",
      "decide",
      "receipts",
      "policy",
      "peer",
      "artifact-share",
      "artifact-revoke",
    ]),
    id: z.string().max(255).optional(),
    input: z.unknown().optional(),
  })
  .strict();
export async function ownerCommand(
  store: FederationStore,
  value: unknown,
): Promise<unknown> {
  const { operation, id = "", input } = commandSchema.parse(value);
  switch (operation) {
    case "connect":
      return connectOwner(store, input);
    case "preview":
      return previewPublication(store, input);
    case "confirm":
      return confirmPublication(
        store,
        id,
        z.object({ previewHash: z.string() }).strict().parse(input).previewHash,
      );
    case "publication-status":
      return publicationStatus(
        store,
        id,
        z.enum(["PAUSED", "REVOKED"]).parse(input),
      );
    case "grant":
      return grantPeer(store, input);
    case "revoke-grant":
      return revokeGrant(store, id);
    case "rotate":
      return rotateOrRevoke(store);
    case "revoke-credential":
      return rotateOrRevoke(store, true);
    case "poll":
      return pollRelay(store);
    case "send":
      return sendExternal(store, input);
    case "get":
      return getExternalResult(store, id);
    case "decide":
      return decideExternalWork(store, id, z.boolean().parse(input));
    case "receipts":
      return importReceipts(store, input);
    case "artifact-share":
      return artifactShare(store, id, z.string().max(255).parse(input));
    case "artifact-revoke":
      await store.database.query(
        "UPDATE myeve_relay_artifacts SET revoked=true WHERE owner_id=$1 AND id=$2",
        [store.ownerId, id],
      );
      return { revoked: true };
    case "policy": {
      const mode = z.enum(["accept", "reject", "approval"]);
      const policy = z
        .object({
          research: mode,
          analysis: mode,
          summarization: mode,
          artifact_generation: mode,
        })
        .strict()
        .parse(input);
      await store.database.query(
        "UPDATE myeve_relay_connections SET local_work_policy=$2::jsonb WHERE owner_id=$1",
        [store.ownerId, JSON.stringify(policy)],
      );
      await store.activity("local-policy", null, policy);
      return { policy };
    }
    case "peer": {
      const peer = z
        .object({
          address: z.string().regex(/^relay:\/\/[^/]+\/[^/]+$/),
          origin: z.string().url(),
          publicKey: z.string().max(2048),
        })
        .strict()
        .parse(input);
      const url = new URL(peer.origin);
      if (
        url.protocol !== "https:" ||
        url.origin !== peer.origin ||
        createPublicKey(peer.publicKey).asymmetricKeyType !== "ed25519"
      )
        throw new Error(
          "Use a pinned HTTPS artifact origin and Ed25519 public key.",
        );
      await store.database.query(
        "INSERT INTO myeve_relay_peers(owner_id,address,artifact_origin,artifact_public_key) VALUES($1,$2,$3,$4) ON CONFLICT(owner_id,address) DO UPDATE SET artifact_origin=$3,artifact_public_key=$4",
        [store.ownerId, peer.address, peer.origin, peer.publicKey],
      );
      return { address: peer.address };
    }
  }
}
export async function handleOwnerRequest(request: Request) {
  const headers = { "cache-control": "no-store" };
  if (process.env.MYEVE_RELAY_ENABLED !== "true")
    return Response.json(
      { enabled: false },
      { headers, status: request.method === "GET" ? 200 : 404 },
    );
  try {
    const store = new FederationStore(authenticatedOwner(request));
    if (request.method === "GET")
      return Response.json(await relayDashboard(store), { headers });
    const input = await boundedJson(
      new Response(request.body),
      4 * 1024 * 1024,
    );
    return Response.json(
      { result: (await ownerCommand(store, input)) ?? { success: true } },
      { headers },
    );
  } catch (error) {
    console.error(
      "Relay owner operation failed",
      error instanceof Error ? error.message : "unknown error",
    );
    const auth =
      error instanceof Error && /Sign in|Same-origin/.test(error.message);
    return Response.json(
      {
        error: auth
          ? (error as Error).message
          : "Relay action could not complete. Check the connection, selection, expiry, and local policy before retrying.",
      },
      { status: auth ? 403 : 400, headers },
    );
  }
}
