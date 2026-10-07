import { z } from "zod";
import { pathSchema } from "../engineering/contract.ts";
import { externalAlphaInstallation, externalAlphaPolicy } from "./policy.ts";

const hex64 = z.string().regex(/^[a-f0-9]{64}$/);
const productionHost = /^myfactory-cloud-production(-[a-z0-9]+-jaydubya818)?\.vercel\.app$/;

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
      })
      .strict(),
  })
  .strict();
export type ExternalAlphaWorkConfig = z.infer<typeof externalAlphaWorkConfigSchema>;

/** Absent or invalid configuration means Work authority is unavailable (fail closed). */
export function externalAlphaWorkConfig(
  env: NodeJS.ProcessEnv = process.env,
): ExternalAlphaWorkConfig | null {
  const raw = env.MYEVE_EXTERNAL_ALPHA_WORK_CONFIG;
  if (!raw || Buffer.byteLength(raw) > 20000 || typeof window !== "undefined") return null;
  try {
    const config = externalAlphaWorkConfigSchema.parse(JSON.parse(raw));
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


/** Work authority is offered only to a fully provisioned external-alpha
 * installation: exact policy, reviewed Work configuration and a signing key.
 * Everything else (including the canary and every other deployment) is false. */
export function externalAlphaWorkEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (!externalAlphaInstallation(env)) return false;
  try {
    return (
      externalAlphaPolicy(env) !== null &&
      externalAlphaWorkConfig(env) !== null &&
      !!env.MYEVE_EXTERNAL_ALPHA_AUTHORITY_SIGNING_KEY?.trim()
    );
  } catch {
    return false;
  }
}
