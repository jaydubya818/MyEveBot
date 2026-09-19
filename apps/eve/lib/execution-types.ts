import { createHash } from "node:crypto";
import { z } from "zod";

export const FAILURE_CATEGORIES = [
  "transient_provider_failure", "rate_limited", "timeout", "authorization_failed",
  "capability_unavailable", "invalid_input", "approval_required", "approval_expired",
  "budget_exceeded", "dependency_failed", "verification_failed", "permanent_failure", "unknown",
] as const;
export type FailureCategory = typeof FAILURE_CATEGORIES[number];
export type RetryEligibility = "retry" | "stop" | "recovery_required" | "wait";
export type Cost = { status: "unknown"; usd: null } | { status: "known" | "estimated"; usd: number };

export const routineConfigurationSchema = z.object({
  instructions: z.string().min(1).max(4000),
  authority: z.object({
    allowedCapabilities: z.array(z.string().min(1)).max(100),
    allowedTargets: z.array(z.object({
      capabilityId: z.string(), provider: z.string(), account: z.string(), resource: z.string(),
      environment: z.string().optional(),
    }).strict()).max(100).default([]),
    maximumRisk: z.enum(["low", "medium", "high", "critical"]).default("low"),
    requiresApprovalFor: z.array(z.string()).default([]),
  }).strict(),
  retry: z.object({
    maxAttempts: z.number().int().min(1).max(5).default(3),
    backoffSeconds: z.array(z.number().int().min(1).max(86400)).min(1).max(5).default([60, 300, 900]),
  }).strict().default({ maxAttempts: 3, backoffSeconds: [60, 300, 900] }),
  limits: z.object({
    maxSteps: z.number().int().min(1).max(200).default(30),
    maxRuntimeSeconds: z.number().int().min(30).max(3600).default(600),
    maxCostUsd: z.number().positive().max(100).default(1),
  }).strict().default({ maxSteps: 30, maxRuntimeSeconds: 600, maxCostUsd: 1 }),
  missedPolicy: z.enum(["skip", "run_latest"]).default("run_latest"),
  deliveryChannel: z.enum(["in_app", "push", "telegram"]).default("in_app"),
}).strict();
export type RoutineConfiguration = z.infer<typeof routineConfigurationSchema>;

export function occurrenceIdentity(ownerId: string, routineId: string, key: string): string {
  if (!ownerId || !routineId || !key) throw new Error("Occurrence identity requires owner, routine and trigger identity.");
  return `occ_${createHash("sha256").update(JSON.stringify([ownerId, routineId, key])).digest("hex")}`;
}

export function retryDecision(input: {
  category: FailureCategory; attempt: number; policy: RoutineConfiguration["retry"];
  consequentialOutcome?: "none" | "definitely_failed" | "completed" | "unknown";
}): { eligibility: RetryEligibility; delaySeconds: number | null } {
  if (input.consequentialOutcome === "unknown" || input.consequentialOutcome === "completed") {
    return { eligibility: "recovery_required", delaySeconds: null };
  }
  if (["approval_required", "authorization_failed", "capability_unavailable", "budget_exceeded", "dependency_failed"].includes(input.category)) {
    return { eligibility: "wait", delaySeconds: null };
  }
  const transient = ["transient_provider_failure", "rate_limited", "timeout"].includes(input.category);
  return transient && input.attempt < input.policy.maxAttempts
    ? { eligibility: "retry", delaySeconds: input.policy.backoffSeconds[Math.min(input.attempt - 1, input.policy.backoffSeconds.length - 1)]! }
    : { eligibility: "stop", delaySeconds: null };
}

export interface ExecutionClaim {
  ownerId: string; occurrenceId: string; routineId: string; runId: string;
  workerId: string; version: number; attempt: number; configuration: RoutineConfiguration;
}

// Narrow injectable database seam: production Neon and isolated PostgreSQL use
// the exact same SQL. No process-local locks or fake transactional semantics.
export interface ExecutionDatabase {
  query(sql: string, parameters?: unknown[]): Promise<Record<string, unknown>[]>;
}

export class LostExecutionClaim extends Error {
  constructor() { super("Execution ownership changed or expired."); this.name = "LostExecutionClaim"; }
}
