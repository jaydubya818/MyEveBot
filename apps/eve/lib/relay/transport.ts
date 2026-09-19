import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  verify,
} from "node:crypto";
import { z } from "zod";
import { submissionSchema } from "./contracts.ts";

export function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.entries(value)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
    .join(",")}}`;
}
export const digest = (value: unknown) =>
  createHash("sha256").update(canonical(value)).digest("hex");
export const requestDigest = (envelope: Envelope) =>
  digest({
    ...envelope,
    authorizationContext: {
      grantId: envelope.authorizationContext.grantId,
      localAuthorizationRequired: true,
    },
  });
export const envelopeSchema = z
  .object({
    id: z.string().max(255),
    protocol: z.literal("relay.federation"),
    version: z.literal("1.0"),
    caller: z.object({ ownerId: z.string(), agentId: z.string() }).strict(),
    target: z
      .object({ ownerId: z.string(), agentId: z.string(), address: z.string() })
      .strict(),
    capability: z.enum([
      "knowledge.query",
      "message.send",
      "work.request",
      "artifact.share",
    ]),
    resource: z.string(),
    createdAt: z.string().datetime({ offset: true }),
    expiresAt: z.string().datetime({ offset: true }),
    idempotencyKey: z.string(),
    conversationId: z.string().optional(),
    payload: z.unknown(),
    publication: z.unknown(),
    authorizationContext: z
      .object({
        grantId: z.string(),
        policyDecisionId: z.string(),
        localAuthorizationRequired: z.literal(true),
      })
      .strict(),
  })
  .strict();
export type Envelope = z.infer<typeof envelopeSchema>;
export interface RelayIdentity {
  issuer: string;
  address: string;
  ownerId: string;
  agentId: string;
  keyId: string;
  publicKey: string;
}

// Verification never claims or executes. The inbox store performs the atomic,
// durable claim only after this returns a fully validated target-bound envelope.
export function verifyEnvelope(
  token: string,
  identity: RelayIdentity,
  now = Date.now(),
): Envelope {
  if (token.length > 256 * 1024) throw new Error("Delivery too large.");
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid Relay assertion.");
  const header = z
    .object({
      alg: z.literal("EdDSA"),
      typ: z.literal("relay-federation+jwt"),
      kid: z.string(),
    })
    .strict()
    .parse(JSON.parse(Buffer.from(parts[0]!, "base64url").toString()));
  if (
    header.kid !== identity.keyId ||
    !verify(
      null,
      Buffer.from(`${parts[0]}.${parts[1]}`),
      identity.publicKey,
      Buffer.from(parts[2]!, "base64url"),
    )
  )
    throw new Error("Invalid Relay signature.");
  const claims = z
    .object({
      iss: z.string(),
      aud: z.string(),
      jti: z.string(),
      iat: z.number().int(),
      exp: z.number().int(),
      envelope: envelopeSchema,
    })
    .strict()
    .parse(JSON.parse(Buffer.from(parts[1]!, "base64url").toString()));
  const current = Math.floor(now / 1000);
  const envelope = claims.envelope;
  if (
    claims.iss !== identity.issuer ||
    claims.aud !== identity.address ||
    claims.jti !== envelope.id ||
    claims.iat > current + 5 ||
    claims.exp <= current ||
    claims.exp - claims.iat > 60
  )
    throw new Error("Invalid Relay assertion claims.");
  if (
    envelope.target.ownerId !== identity.ownerId ||
    envelope.target.agentId !== identity.agentId ||
    envelope.target.address !== identity.address ||
    identity.address !== `relay://${identity.ownerId}/${identity.agentId}`
  )
    throw new Error("Wrong Relay target.");
  if (
    Date.parse(envelope.expiresAt) <= now ||
    claims.exp > Math.floor(Date.parse(envelope.expiresAt) / 1000) ||
    Date.parse(envelope.createdAt) > now + 5000 ||
    Date.parse(envelope.expiresAt) - Date.parse(envelope.createdAt) > 86400000
  )
    throw new Error("Invalid delivery lifetime.");
  submissionSchema.parse({
    target: envelope.target.address,
    capability: envelope.capability,
    resource: envelope.resource,
    idempotencyKey: envelope.idempotencyKey,
    expiresAt: envelope.expiresAt,
    payload: envelope.payload,
    ...(envelope.conversationId
      ? { conversationId: envelope.conversationId }
      : {}),
  });
  return envelope;
}

function encryptionKey() {
  const key = process.env.MYEVE_RELAY_ENCRYPTION_KEY;
  if (!key || !/^[a-fA-F0-9]{64}$/.test(key))
    throw new Error("Relay credential encryption is not configured.");
  return Buffer.from(key, "hex");
}
export function encryptSecret(ownerId: string, value: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from(ownerId));
  const bytes = Buffer.concat([
    cipher.update(JSON.stringify(value)),
    cipher.final(),
  ]);
  return [iv, cipher.getAuthTag(), bytes]
    .map((b) => b.toString("base64url"))
    .join(".");
}
export function decryptSecret<T>(ownerId: string, value: string): T {
  const parts = value.split(".").map((p) => Buffer.from(p, "base64url"));
  if (parts.length !== 3) throw new Error("Invalid credential envelope.");
  const cipher = createDecipheriv("aes-256-gcm", encryptionKey(), parts[0]!);
  cipher.setAAD(Buffer.from(ownerId));
  cipher.setAuthTag(parts[1]!);
  return JSON.parse(
    Buffer.concat([cipher.update(parts[2]!), cipher.final()]).toString(),
  ) as T;
}
