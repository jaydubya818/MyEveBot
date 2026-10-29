import { createHash, createPublicKey, verify } from "node:crypto";
import { AppError, canonical, digest, isDigest, keys, requireValue } from "./contracts.ts";
import { isRetainedStaticArtifact, type StaticArtifactCandidate } from "./static-artifact.ts";

export const STATIC_BUILD_CLAIM_DOMAIN = "myeve.static-build-claim/v1\0";
export const STATIC_BUILD_CLAIM_MAX_BYTES = 8192;
const invalid = () => new AppError("APP_BUILD_CLAIM_INVALID");
const sha256 = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
const hash = (value: unknown, length: number) => typeof value === "string" && new RegExp(`^[a-f0-9]{${length}}$`).test(value);
const reference = (value: unknown) => typeof value === "string" && value.length > 0 &&
  value.trim() === value && Buffer.byteLength(value) <= 255 && !/[\x00-\x1f\x7f]/.test(value);
const positive = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value > 0;
function timestamp(value: unknown): number {
  requireValue(typeof value === "string");
  const time = Date.parse(value);
  requireValue(Number.isFinite(time) && new Date(time).toISOString() === value);
  return time;
}

export interface StaticBuildBinding {
  ownerId: string;
  agentId: string;
  appId: string;
  workId: string;
  workVersion: number;
  workGeneration: number;
  requestId: string;
  runId: string;
  factoryId: string;
  factoryVersion: string;
  sourceDigest: string;
  configurationDigest: string;
  inputCommit: string;
  inputTree: string;
  candidateCommit: string;
  candidateTree: string;
  lockSha256: string;
  buildProfileDigest: string;
  deadline: string;
}

/** Trusted backend configuration, never a model argument or claim field. */
export interface StaticBuildIssuer {
  keyId: string;
  purpose: "STATIC_BUILD_PROVENANCE_V1";
  ownerId: string;
  factoryId: string;
  factoryVersion: string;
  buildProfileDigest: string;
  publicKeyPem: string;
  spkiSha256: string;
  notBefore: string;
  notAfter: string;
  revoked: boolean;
}

const references = ["ownerId", "agentId", "appId", "workId", "requestId", "runId", "factoryId"] as const;
const commits = ["inputCommit", "inputTree", "candidateCommit", "candidateTree"] as const;
const hashes = ["factoryVersion", "sourceDigest", "configurationDigest", "lockSha256", "buildProfileDigest"] as const;
const bindingKeys = [...references, ...commits, ...hashes, "workVersion", "workGeneration", "deadline"];
function binding(value: unknown): StaticBuildBinding {
  keys(value, bindingKeys);
  requireValue(references.every(key => reference(value[key])) && commits.every(key => hash(value[key], 40)) &&
    hashes.every(key => hash(value[key], 64)) && positive(value.workVersion) && positive(value.workGeneration));
  timestamp(value.deadline);
  requireValue(value.factoryVersion === sha256(canonical({ sourceDigest: value.sourceDigest, configurationDigest: value.configurationDigest })));
  return value as unknown as StaticBuildBinding;
}

/** Signature/artifact consistency only. The caller independently authorizes all
 * expected inputs and later effects. No canonical Result or acceptance Proof is created. */
export function verifyStaticBuildClaim(encoded: unknown, candidate: StaticArtifactCandidate,
  expectedBinding: StaticBuildBinding, trustedIssuer: StaticBuildIssuer, now = Date.now()) {
  try {
    requireValue(isRetainedStaticArtifact(candidate));
    requireValue(Number.isSafeInteger(now) && now >= 0);
    requireValue(typeof encoded === "string" && Buffer.byteLength(encoded) <= STATIC_BUILD_CLAIM_MAX_BYTES);
    const envelope: unknown = JSON.parse(encoded);
    keys(envelope, ["payload", "signature"]);
    requireValue(canonical(envelope) === encoded);
    const payload = envelope.payload;
    keys(payload, ["schema", "keyId", "binding", "inventoryDigest", "artifactDigest", "builtAt"]);
    requireValue(payload.schema === "myeve.static-build-claim/v1" && reference(payload.keyId) &&
      isDigest(payload.inventoryDigest) && isDigest(payload.artifactDigest));
    const claimed = binding(payload.binding);
    const expected = binding(structuredClone(expectedBinding));
    requireValue(canonical(claimed) === canonical(expected));
    requireValue(candidate.source.sourceCommit === expected.candidateCommit && candidate.source.sourceTree === expected.candidateTree &&
      candidate.source.lockSha256 === expected.lockSha256 && payload.inventoryDigest === candidate.inventoryDigest &&
      payload.artifactDigest === candidate.artifactDigest);

    const issuer: unknown = structuredClone(trustedIssuer);
    keys(issuer, ["keyId", "purpose", "ownerId", "factoryId", "factoryVersion", "buildProfileDigest", "publicKeyPem", "spkiSha256", "notBefore", "notAfter", "revoked"]);
    requireValue(issuer.keyId === payload.keyId && issuer.purpose === "STATIC_BUILD_PROVENANCE_V1" && issuer.revoked === false &&
      issuer.ownerId === expected.ownerId && issuer.factoryId === expected.factoryId &&
      issuer.factoryVersion === expected.factoryVersion && issuer.buildProfileDigest === expected.buildProfileDigest);
    const builtAt = timestamp(payload.builtAt), notBefore = timestamp(issuer.notBefore), notAfter = timestamp(issuer.notAfter);
    requireValue(notBefore < notAfter && builtAt >= notBefore && builtAt < notAfter && builtAt <= timestamp(expected.deadline) && builtAt <= now);
    requireValue(typeof issuer.publicKeyPem === "string" && Buffer.byteLength(issuer.publicKeyPem) <= 4096 &&
      /^-----BEGIN PUBLIC KEY-----\n[A-Za-z0-9+/=\n]+\n-----END PUBLIC KEY-----\n?$/.test(issuer.publicKeyPem) && hash(issuer.spkiSha256, 64));
    const publicKey = createPublicKey(issuer.publicKeyPem);
    requireValue(publicKey.asymmetricKeyType === "ed25519");
    const spki = publicKey.export({ type: "spki", format: "der" });
    requireValue(sha256(spki) === issuer.spkiSha256);
    requireValue(typeof envelope.signature === "string" && /^[A-Za-z0-9_-]{86}$/.test(envelope.signature));
    const signature = Buffer.from(envelope.signature, "base64url");
    requireValue(signature.length === 64 && signature.toString("base64url") === envelope.signature);
    requireValue(verify(null, Buffer.from(STATIC_BUILD_CLAIM_DOMAIN + canonical(payload)), publicKey, signature));
    return Object.freeze({
      schema: "myeve.static-build-claim-observation/v1" as const,
      claimDigest: digest(payload), binding: Object.freeze(expected),
      inventoryDigest: candidate.inventoryDigest, artifactDigest: candidate.artifactDigest,
      keyId: issuer.keyId as string, publicKeySha256: issuer.spkiSha256 as string,
      builtAt: payload.builtAt as string, observedAt: new Date(now).toISOString(),
      provenance: "SIGNATURE_MATCHED_CONFIGURED_KEY" as const,
      independentVerification: "NOT_ESTABLISHED" as const,
      signedResult: false as const, releaseQualified: false as const, installed: false as const,
    });
  } catch {
    throw invalid();
  }
}
