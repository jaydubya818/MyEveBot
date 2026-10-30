
import { createHash } from "node:crypto";
import { z } from "zod";
import { qualificationBinding, type QualificationProjectInput } from "../external-alpha/qualification-accounting.ts";

/**
 * Strict, NON-SECRET assembly profile carried inside the qdev host bundle (and therefore covered by the bundle digest the root re-proves on every
 * use). It names ids, public keys, pins and the NAMES of environment variables that hold protected values; it never contains a credential value,
 * a private key, a token or an activation permit. The launcher (`custody-launcher.ts`) turns it into `QdevCustody` from existing qualified bodies, so
 * the owner supplies protected refs and keys, not orchestration code. Mutually exclusive with the pinned custody module.
 */
const envName = z.string().regex(/^[A-Z][A-Z0-9_]{2,63}$/);
const reference = z.string().min(1).max(255);
const hex = (length: number) => z.string().regex(new RegExp(`^[a-f0-9]{${length}}$`));
const timestamp = z.string().datetime();
const verifierKey = z.object({ keyId: reference, publicKeyPem: z.string().min(1).max(4096), activeFrom: timestamp, notAfter: timestamp, revokedAt: timestamp.optional() }).strict();
const buildIssuer = z.object({
  keyId: reference, purpose: z.literal("STATIC_BUILD_PROVENANCE_V1"), ownerId: reference, factoryId: reference, factoryVersion: hex(64), buildProfileDigest: hex(64),
  publicKeyPem: z.string().min(1).max(4096), spkiSha256: hex(64), notBefore: timestamp, notAfter: timestamp, revoked: z.boolean(),
}).strict();
const microusd = z.number().int().positive().max(1_000_000_000);

export const assemblyProfileSchema = z.object({
  slot: z.enum(["Q1", "Q2"]),
  /** Host-pinned engineering Work for each stage (never a model value). */
  workIds: z.object({ stage1: reference, stage2: reference, stage3: reference }).strict(),
  /** The pinned stage-1 baseline commit/tree in the Factory repository. */
  baseline: z.object({ commit: hex(40), tree: hex(40) }).strict(),
  capability: z.object({
    clientId: reference, backendId: reference, missionId: reference,
    /** Env var NAME holding the canonical propagation JSON `{ "signer": { keyId, jwk } }` (the same protected source the MissionControl issuer reads). */
    signerEnv: envName,
    relay: z.object({ enrollment: z.record(z.string(), z.unknown()), enrollmentSha256: hex(64), revision: z.number().int().positive(),
      credentialEnv: envName, workloadTokenEnv: envName }).strict(),
  }).strict(),
  model: z.object({
    /** Gateway model id, e.g. "provider/model". The gateway credential is the NAMED env var. */
    id: z.string().regex(/^[a-z0-9][a-z0-9._-]{0,63}\/[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/), apiKeyEnv: envName,
    /** Owner-attested price source. The runtime refuses a run whose cost could exceed the charged reservation at this price. */
    price: z.object({ inputMicrousdPerMillionTokens: microusd, outputMicrousdPerMillionTokens: microusd }).strict(),
    system: z.string().trim().min(1).max(4000), temperature: z.number().min(0).max(1).optional(),
  }).strict(),
  verifier: z.object({
    origin: z.string().url(), credentialEnv: envName, keys: z.array(verifierKey).min(1).max(4),
    producerKeyIds: z.array(reference).max(8).default([]), producerPublicKeysPem: z.array(z.string().min(1).max(4096)).max(8).default([]),
    timeoutMs: z.number().int().min(1000).max(60_000).optional(),
  }).strict(),
  build: z.object({
    appId: z.string().regex(/^[A-Za-z0-9._:-]{1,160}$/), lockSha256: hex(64), packageSha256: hex(64), image: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    nodeVersion: z.string().regex(/^v24\.\d+\.\d+$/), buildProfileDigest: hex(64), issuer: buildIssuer,
    /** Env var NAME holding the Ed25519 PKCS#8 PEM of the build-provenance issuer. */
    signerEnv: envName,
  }).strict(),
  /**
   * Private release root and the loopback serving port. `activation` pins the owner's PUBLIC approver keys and the private directory holding owner-signed,
   * single-use approval files (`approvals/`, consumed markers in `consumed/`). Absent: publishing and rollback refuse. Present with no valid approval:
   * they still refuse. No permit, private key or callback lives here.
   */
  publishing: z.object({
    root: z.string().min(2).max(1024), installationId: reference, servePort: z.number().int().min(1024).max(65535).optional(),
    activation: z.object({ dir: z.string().min(2).max(1024), approverKeys: z.array(verifierKey).min(1).max(4) }).strict().optional(),
  }).strict(),
  servedOrigin: z.string().url(),
}).strict();
export type AssemblyProfile = z.infer<typeof assemblyProfileSchema>;

/** The durable journey id used by the journal and the retained stage admissions (one formula for both). */
export function qdevJourneyId(ownerId: string, project: QualificationProjectInput): string {
  const binding = qualificationBinding(project);
  return createHash("sha256").update(JSON.stringify([ownerId, binding.projectSha256, binding.sourceSha256])).digest("hex");
}
