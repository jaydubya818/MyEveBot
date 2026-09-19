import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign,
  verify,
  randomUUID,
} from "node:crypto";
import { z } from "zod";
import { FederationStore } from "./store.ts";
import { decryptSecret, encryptSecret, type Envelope } from "./transport.ts";
import { submissionSchema } from "./contracts.ts";

function privateKey() {
  const value = process.env.MYEVE_RELAY_ARTIFACT_PRIVATE_KEY;
  if (!value || createPrivateKey(value).asymmetricKeyType !== "ed25519")
    throw new Error("MyEve artifact signing is not configured.");
  return value;
}
export function artifactPublicKey() {
  return createPublicKey(privateKey())
    .export({ type: "spki", format: "pem" })
    .toString();
}
function jwt(claims: Record<string, unknown>) {
  const material = `${Buffer.from(JSON.stringify({ alg: "EdDSA", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify(claims)).toString("base64url")}`;
  return `${material}.${sign(null, Buffer.from(material), privateKey()).toString("base64url")}`;
}
function verifyJwt(token: string, key: string) {
  if (token.length > 8192) throw new Error("Artifact assertion too large.");
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid artifact assertion.");
  const header = JSON.parse(Buffer.from(parts[0]!, "base64url").toString());
  if (
    header.alg !== "EdDSA" ||
    header.typ !== "JWT" ||
    !verify(
      null,
      Buffer.from(`${parts[0]}.${parts[1]}`),
      key,
      Buffer.from(parts[2]!, "base64url"),
    )
  )
    throw new Error("Invalid artifact signature.");
  const claims = z
    .object({
      iss: z.string(),
      aud: z.string(),
      sub: z.string().optional(),
      exp: z.number().int(),
    })
    .strict()
    .parse(JSON.parse(Buffer.from(parts[1]!, "base64url").toString()));
  if (claims.exp <= Date.now() / 1000 || claims.exp > Date.now() / 1000 + 301)
    throw new Error("Artifact assertion expired or unbounded.");
  return claims;
}
export async function receiveArtifact(
  store: FederationStore,
  envelope: Envelope,
) {
  const connection = await store.connection();
  const input = submissionSchema.parse({
    target: envelope.target.address,
    resource: envelope.resource,
    capability: envelope.capability,
    idempotencyKey: envelope.idempotencyKey,
    expiresAt: envelope.expiresAt,
    payload: envelope.payload,
  });
  if (input.capability !== "artifact.share")
    throw new Error("Not an artifact share.");
  const payload = input.payload;
  const caller = `relay://${envelope.caller.ownerId}/${envelope.caller.agentId}`;
  const [peer] = await store.database.query(
    "SELECT * FROM myeve_relay_peers WHERE owner_id=$1 AND address=$2",
    [store.ownerId, caller],
  );
  const url = new URL(payload.retrieval.url);
  if (
    !peer ||
    url.origin !== peer.artifact_origin ||
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    payload.retrieval.audience !== connection.address ||
    Date.parse(payload.retrieval.expiresAt) <= Date.now()
  )
    throw new Error("Artifact source is not locally trusted.");
  const claims = verifyJwt(
    url.searchParams.get("token") ?? "",
    peer.artifact_public_key,
  );
  if (
    claims.iss !== caller ||
    claims.aud !== connection.address ||
    claims.sub !== payload.reference
  )
    throw new Error("Artifact source or audience mismatch.");
  const response = await fetch(url, {
    redirect: "error",
    signal: AbortSignal.timeout(15000),
    headers: {
      authorization: `Bearer ${jwt({ iss: connection.address, aud: url.toString(), exp: Math.floor(Date.now() / 1000) + 30 })}`,
    },
  });
  if (!response.ok) throw new Error("Artifact source refused retrieval.");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Empty artifact response.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.length;
    if (size > payload.size) {
      await reader.cancel();
      throw new Error("Artifact exceeds declared size.");
    }
    chunks.push(part.value);
  }
  const bytes = Buffer.concat(chunks);
  if (
    bytes.length !== payload.size ||
    `sha256:${createHash("sha256").update(bytes).digest("hex")}` !==
      payload.checksum ||
    !["text/plain", "text/markdown", "application/json"].includes(payload.type)
  )
    throw new Error("Artifact integrity or supported type mismatch.");
  const id = `relay_artifact_${randomUUID()}`;
  const { retrieval: ignored, ...metadata } = payload;
  void ignored;
  await store.database.query(
    "INSERT INTO myeve_relay_artifacts(id,owner_id,request_id,content_encrypted,metadata,audience,audience_public_key,expires_at) VALUES($1,$2,$3,$4,$5::jsonb,$6,$7,$8)",
    [
      id,
      store.ownerId,
      envelope.id,
      encryptSecret(store.ownerId, bytes.toString("utf8")),
      JSON.stringify({
        ...metadata,
        sourceOwnerId: envelope.caller.ownerId,
        sourceAgentId: envelope.caller.agentId,
      }),
      connection.address,
      artifactPublicKey(),
      payload.expiresAt,
    ],
  );
  return { acknowledged: true };
}
export async function artifactShare(
  store: FederationStore,
  id: string,
  target: string,
) {
  const connection = await store.connection();
  const [row] = await store.database.query(
    "SELECT * FROM myeve_relay_artifacts WHERE owner_id=$1 AND id=$2 AND NOT revoked AND expires_at>now()",
    [store.ownerId, id],
  );
  const [peer] = await store.database.query(
    "SELECT * FROM myeve_relay_peers WHERE owner_id=$1 AND address=$2",
    [store.ownerId, target],
  );
  if (!row || !peer || row.metadata.sourceOwnerId !== connection.ownerId)
    throw new Error(
      "Select an owned artifact and explicitly trusted recipient.",
    );
  const origin = new URL(process.env.MYEVE_RELAY_ARTIFACT_ORIGIN ?? "");
  if (origin.protocol !== "https:" || origin.username || origin.password)
    throw new Error("An HTTPS MyEve artifact origin is required.");
  const expiresAt = new Date(
    Math.min(Date.now() + 120000, new Date(row.expires_at).getTime()),
  ).toISOString();
  await store.database.query(
    "UPDATE myeve_relay_artifacts SET audience=$3,audience_public_key=$4 WHERE owner_id=$1 AND id=$2",
    [store.ownerId, id, target, peer.artifact_public_key],
  );
  const token = jwt({
    iss: connection.address,
    aud: target,
    sub: id,
    exp: Math.floor(Date.parse(expiresAt) / 1000),
  });
  return {
    reference: id,
    name: row.metadata.name,
    type: row.metadata.type,
    size: row.metadata.size,
    checksum: row.metadata.checksum,
    visibility: "SHARED",
    expiresAt: new Date(row.expires_at).toISOString(),
    retrieval: {
      url: `${origin.origin}/api/relay/artifacts/${encodeURIComponent(id)}?token=${token}`,
      audience: target,
      expiresAt,
    },
  };
}
export async function retrieveArtifact(
  store: FederationStore,
  id: string,
  url: string,
  authorization: string,
) {
  const [row] = await store.database.query(
    "SELECT * FROM myeve_relay_artifacts WHERE owner_id=$1 AND id=$2 AND NOT revoked AND expires_at>now()",
    [store.ownerId, id],
  );
  if (!row) throw new Error("Artifact unavailable.");
  const connection = await store.connection();
  const claims = verifyJwt(
    new URL(url).searchParams.get("token") ?? "",
    artifactPublicKey(),
  );
  const proof = verifyJwt(
    authorization.replace(/^Bearer /, ""),
    row.audience_public_key,
  );
  if (
    claims.sub !== id ||
    claims.iss !== connection.address ||
    claims.aud !== row.audience ||
    proof.iss !== row.audience ||
    proof.aud !== url
  )
    throw new Error("Artifact audience denied.");
  return {
    content: decryptSecret<string>(store.ownerId, row.content_encrypted),
    type: String(row.metadata.type),
  };
}
