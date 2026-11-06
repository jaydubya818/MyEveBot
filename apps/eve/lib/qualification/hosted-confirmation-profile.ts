import { z } from "zod";

const envName = z.string().regex(/^[A-Z][A-Z0-9_]{2,63}$/);
/** Hosted confirmation bridge configuration (non-secret). See hosted-confirmation.ts. */
export const hostedConfirmationSchema = z.object({
  /** Env var NAMES only: the installation's Ed25519 confirmation key (PKCS#8 PEM), the confirmation submitter credential and the connection's service secret. */
  signerEnv: envName, submitterEnv: envName, connectionSecretEnv: envName,
  /** sha256 of the SPKI DER of the confirmation PUBLIC key MissionControl's operator enrolled for this installation. */
  keyId: z.string().regex(/^[a-f0-9]{64}$/),
  workflowId: z.string().regex(/^[A-Za-z0-9._:-]{1,160}$/),
  stage: z.object({ maxCostUsd: z.number().positive().max(1.3), maxDurationSeconds: z.number().int().min(60).max(600), budgetMinutes: z.number().int().min(10).max(120),
    requestDeadlineSeconds: z.number().int().min(60).max(600) }).strict(),
}).strict();
export type HostedConfirmationProfile = z.infer<typeof hostedConfirmationSchema>;
