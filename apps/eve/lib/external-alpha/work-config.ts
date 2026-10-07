import { createHash, createPublicKey } from "node:crypto";
import { z } from "zod";
import { digest, pathSchema } from "../engineering/contract.ts";
import {
  assertExternalAlphaSigningKey,
  externalAlphaInstallation,
  externalAlphaPolicy,
  type ExternalAlphaPolicy,
} from "./policy.ts";

const hex64 = z.string().regex(/^[a-f0-9]{64}$/);
const productionHost = /^myfactory-cloud-production(-[a-z0-9]+-jaydubya818)?\.vercel\.app$/;

/** Reviewed pins for authenticating the Factory's signed Result. Non-secret.
 * FactoryVersion is the digest of the two pinned digests, exactly as for the
 * qualified producer protocol, so a Result cannot name a different build. */
const resultVerificationSchema = z
  .object({
    factoryId: z.literal("myfactory-external-alpha"),
    sourceDigest: hex64,
    configurationDigest: hex64,
    /** Policy digest of the independent cloud verifier the Factory must have used. */
    verifierPolicySha256: hex64,
    resultKeys: z
      .array(
        z
          .object({
            factoryId: z.literal("myfactory-external-alpha"),
            keyId: z.literal("external-alpha-result-v1"),
            publicKey: z.string().min(1).max(2000),
            activeFrom: z.string().datetime(),
            notAfter: z.string().datetime(),
            retiredAt: z.string().datetime().optional(),
            revokedAt: z.string().datetime().optional(),
          })
          .strict(),
      )
      .min(1)
      .max(4),
  })
  .strict();

/** Reviewed, non-secret server configuration. The Factory token is a separate
 * secret (MYEVE_EXTERNAL_ALPHA_FACTORY_TOKEN) and never part of this document. */
export const externalAlphaWorkConfigSchema = z
  .object({
    allowedFiles: z.array(pathSchema).min(1).max(30),
    checkCommands: z.array(z.string().min(1).max(500)).min(1).max(20),
    factory: z
      .object({
        origin: z.string().url(),
        trustedTeamId: z.string().regex(/^team_[A-Za-z0-9]+$/),
        receiptKeys: z
          .array(z.object({ keyId: hex64, publicKey: z.string().min(1).max(2000) }).strict())
          .min(1)
          .max(4),
        resultVerification: resultVerificationSchema,
      })
      .strict(),
  })
  .strict();
export type ExternalAlphaWorkConfig = z.infer<typeof externalAlphaWorkConfigSchema>;

/** Receipt/readback and Result custody use separate Ed25519 identities. A
 * legacy signing family or a relabelled receipt signer cannot qualify Results. */
export function assertExternalAlphaFactoryKeys(config: ExternalAlphaWorkConfig) {
  const keyDigest = (pem: string) => {
    const key = createPublicKey(pem);
    if (key.asymmetricKeyType !== "ed25519") throw Error("EXTERNAL_ALPHA_FACTORY_KEY");
    return createHash("sha256").update(key.export({ type: "spki", format: "der" })).digest("hex");
  };
  const receipts = config.factory.receiptKeys.map(k => {
    const id = keyDigest(k.publicKey);
    if (id !== k.keyId) throw Error("EXTERNAL_ALPHA_FACTORY_KEY");
    return id;
  });
  const results = config.factory.resultVerification.resultKeys.map(k => keyDigest(k.publicKey));
  if (new Set(receipts).size !== receipts.length || new Set(results).size !== results.length || results.some(id => receipts.includes(id)))
    throw Error("EXTERNAL_ALPHA_FACTORY_KEY_SEPARATION");
}

/** Absent or invalid configuration means Work authority is unavailable (fail closed). */
export function externalAlphaWorkConfig(
  env: NodeJS.ProcessEnv = process.env,
): ExternalAlphaWorkConfig | null {
  const raw = env.MYEVE_EXTERNAL_ALPHA_WORK_CONFIG;
  if (!raw || Buffer.byteLength(raw) > 20000 || typeof window !== "undefined") return null;
  try {
    const config = externalAlphaWorkConfigSchema.parse(JSON.parse(raw));
    assertExternalAlphaFactoryKeys(config);
    const url = new URL(config.factory.origin);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      !productionHost.test(url.hostname)
    )
      return null;
    return config;
  } catch {
    return null;
  }
}

/** The projection the Factory installation pins (without its keys). The Factory
 * recomputes every field of the presented authority against its own copy, so
 * MyEve refuses to offer Work unless an operator-supplied pin digest matches
 * what MyEve would put in every authority document. */
export function externalAlphaFactoryPin(policy: ExternalAlphaPolicy, config: ExternalAlphaWorkConfig) {
  const allowedFiles = [...config.allowedFiles].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return {
    cohortId: policy.cohortId,
    slot: policy.slot,
    ownerId: policy.ownerId,
    policySha256: digest(policy),
    application: { clientId: policy.clientId, projectId: policy.projectId },
    source: {
      repository: policy.repository,
      baseSha: policy.baseSha,
      treeSha: policy.treeSha,
      sourceDigest: policy.sourceDigest,
      allowedFiles,
    },
    factoryVersion: policy.factoryVersion,
  };
}
export const externalAlphaFactoryPinSha256 = (policy: ExternalAlphaPolicy, config: ExternalAlphaWorkConfig) =>
  digest(externalAlphaFactoryPin(policy, config));

/** Cross-checks the policy against the reviewed Work configuration and the
 * operator's Factory pin. Throws a fixed code; nothing secret is included. */
export function assertExternalAlphaWorkBinding(
  policy: ExternalAlphaPolicy,
  config: ExternalAlphaWorkConfig,
  env: NodeJS.ProcessEnv = process.env,
): void {
  assertExternalAlphaFactoryKeys(config);
  const r = config.factory.resultVerification;
  if (digest({ sourceDigest: r.sourceDigest, configurationDigest: r.configurationDigest }) !== policy.factoryVersion)
    throw Error("EXTERNAL_ALPHA_FACTORY_VERSION_BINDING");
  const sorted = [...config.allowedFiles].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  if (new Set(sorted).size !== sorted.length) throw Error("EXTERNAL_ALPHA_FILES_DUPLICATE");
  const pin = env.MYEVE_EXTERNAL_ALPHA_FACTORY_PIN_SHA256;
  if (!pin || !/^[a-f0-9]{64}$/.test(pin) || pin !== externalAlphaFactoryPinSha256(policy, config))
    throw Error("EXTERNAL_ALPHA_FACTORY_PIN_MISMATCH");
}

/** Work authority is offered only to a fully provisioned external-alpha
 * installation: exact policy, reviewed Work configuration, a Factory pin that
 * equals what the Factory will pin, and a signing key.
 * Everything else (including the canary and every other deployment) is false. */
export function externalAlphaWorkEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (!externalAlphaInstallation(env)) return false;
  try {
    const policy = externalAlphaPolicy(env);
    const config = externalAlphaWorkConfig(env);
    if (!policy || !config) return false;
    assertExternalAlphaSigningKey(env);
    assertExternalAlphaWorkBinding(policy, config, env);
    return true;
  } catch {
    return false;
  }
}
