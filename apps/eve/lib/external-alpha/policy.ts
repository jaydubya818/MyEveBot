import { createPrivateKey } from "node:crypto";
import { z } from "zod";
import { digest } from "../engineering/contract.ts";

/** Fixed, non-transferable allocations. The separate shared PostgreSQL cohort
 * ledger enforces owner and global admission ceilings in one transaction. */
export const externalAlphaLimits = Object.freeze({
  days: 5,
  chatTurnsPerDay: 10,
  chatOperationsPerTurn: 2,
  chatMicrousd: 100_000,
  worksPerDay: 1,
  workOperations: 5,
  workMicrousd: 1_300_000,
  factoryOperations: 3,
  factoryMicrousd: 1_000_000,
  productiveSeconds: 180,
  ownerDailyMicrousd: 2_300_000,
  ownerLifetimeMicrousd: 11_500_000,
  cohortDailyMicrousd: 4_600_000,
  cohortLifetimeMicrousd: 23_000_000,
  candidates: 1,
  writers: 1,
  cleanupSeconds: 1200,
});
const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const externalAlphaPolicySchema = z
  .object({
    version: z.literal(1),
    kind: z.literal("TWO_EXTERNAL_OWNERS_V1"),
    cohortId: z.uuid(),
    slot: z.enum(["1", "2"]),
    ownerId: z.uuid(),
    projectId: z.string().regex(/^prj_[A-Za-z0-9]+$/),
    clientId: z.string().regex(/^external-alpha-[a-f0-9]{32}$/),
    repository: z.string().regex(/^[\w.-]+\/myeve-alpha-workspace-0[12]$/),
    baseSha: z.string().regex(/^[a-f0-9]{40}$/),
    treeSha: z.string().regex(/^[a-f0-9]{40}$/),
    workspacePolicy: z.literal("ISOLATED_WORKSPACE_V1"),
    dayBoundary: z.literal("UTC_MIDNIGHT"),
    model: z.literal("openai/gpt-5.4-mini"),
    provider: z.literal("vercel-ai-gateway/openai"),
    sourceDigest: hash,
    factoryVersion: hash,
    limits: z
      .object(
        Object.fromEntries(
          Object.entries(externalAlphaLimits).map(([k, v]) => [
            k,
            z.literal(v),
          ]),
        ) as {
          [K in keyof typeof externalAlphaLimits]: z.ZodLiteral<
            (typeof externalAlphaLimits)[K]
          >;
        },
      )
      .strict(),
    publication: z.literal(false),
    automaticRepair: z.literal(false),
    fallback: z.literal(false),
  })
  .strict()
  .superRefine((p, ctx) => {
    if (!p.repository.endsWith("-0" + p.slot))
      ctx.addIssue({
        code: "custom",
        message: "Workspace must match this fixed tester slot",
      });
  });
export type ExternalAlphaPolicy = z.infer<typeof externalAlphaPolicySchema>;
/** The immutable provisioning name keeps missing policy fail-closed. Any name
 * in the tester family (even a malformed one) is an installation, so a typo can
 * never degrade into an ordinary, fully featured deployment. */
export function externalAlphaInstallation(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return (
    !!env.MYEVE_EXTERNAL_ALPHA_POLICY ||
    /^myeve-alpha-tester/.test(env.EVE_PROJECT_NAME ?? "")
  );
}
/** The slot is part of the immutable provisioning name (myeve-alpha-tester-N). */
export function externalAlphaProjectSlot(
  env: NodeJS.ProcessEnv = process.env,
): "1" | "2" | null {
  const match = /^myeve-alpha-tester-([12])$/.exec(env.EVE_PROJECT_NAME ?? "");
  return match ? (match[1] as "1" | "2") : null;
}
/** Name of the server-only Ed25519 key that signs Work authority. Never read
 * its value into a log, error message or document. */
export const EXTERNAL_ALPHA_SIGNING_KEY_ENV = "MYEVE_EXTERNAL_ALPHA_AUTHORITY_SIGNING_KEY";
/** The installation cannot run without a usable signing key. Presence and key
 * type are validated; the value is never echoed. */
export function assertExternalAlphaSigningKey(env: NodeJS.ProcessEnv = process.env): void {
  const pem = env[EXTERNAL_ALPHA_SIGNING_KEY_ENV];
  if (!pem?.trim() || typeof window !== "undefined") throw Error("EXTERNAL_ALPHA_SIGNING_KEY_REQUIRED");
  try {
    if (createPrivateKey(pem.replaceAll("\\n", "\n")).asymmetricKeyType !== "ed25519") throw Error();
  } catch {
    throw Error("EXTERNAL_ALPHA_SIGNING_KEY_REQUIRED");
  }
}
/** Runtime checks that shape validation cannot express. Every failure is a
 * fixed error code; nothing from the environment is included in the message. */
export function assertExternalAlphaRuntimeBinding(
  p: ExternalAlphaPolicy,
  env: NodeJS.ProcessEnv = process.env,
): void {
  // The immutable provisioning name decides the slot. The policy cannot override it.
  if (externalAlphaProjectSlot(env) !== p.slot) throw Error("EXTERNAL_ALPHA_INSTALLATION_SLOT");
  if (!p.repository.endsWith("myeve-alpha-workspace-0" + p.slot)) throw Error("EXTERNAL_ALPHA_INSTALLATION_REPOSITORY");
  assertExternalAlphaSigningKey(env);
}
/** Installed configuration is inert. Database invitation/activation is separate. */
export function externalAlphaPolicy(
  env: NodeJS.ProcessEnv = process.env,
): ExternalAlphaPolicy | null {
  const raw = env.MYEVE_EXTERNAL_ALPHA_POLICY;
  if (!raw) {
    if (externalAlphaInstallation(env))
      throw Error("EXTERNAL_ALPHA_POLICY_REQUIRED");
    return null;
  }
  if (Buffer.byteLength(raw) > 10000 || typeof window !== "undefined")
    throw Error("EXTERNAL_ALPHA_POLICY");
  const p = externalAlphaPolicySchema.parse(JSON.parse(raw));
  if (
    env.VERCEL !== "1" ||
    env.VERCEL_ENV !== "production" ||
    (env.VERCEL_TARGET_ENV && env.VERCEL_TARGET_ENV !== "production") ||
    env.VERCEL_PROJECT_ID !== p.projectId ||
    env.MYEVE_OWNER_ID !== p.ownerId ||
    digest(p) !== env.MYEVE_EXTERNAL_ALPHA_POLICY_SHA256 ||
    env.MYEVE_ALPHA_OWNER_BINDING ||
    env.MYEVE_PRODUCTION_CANARY_CONFIG ||
    env.MYEVE_CLOUD_QUALIFICATION_CONFIG
  )
    throw Error("EXTERNAL_ALPHA_INSTALLATION_BINDING");
  assertExternalAlphaRuntimeBinding(p, env);
  return p;
}
