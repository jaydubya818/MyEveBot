import { z } from "zod";

export const criterionSchema = z
  .object({
    id: z.string().uuid(),
    statement: z.string().trim().min(1).max(1000),
    method: z.enum(["test", "human"]),
  })
  .strict();
export const criteriaSchema = z
  .array(criterionSchema)
  .min(1)
  .max(20)
  .refine(
    (items) => new Set(items.map((item) => item.id)).size === items.length,
    "Criterion identifiers must be unique.",
  );
export const createWorkSchema = z
  .object({
    title: z.string().trim().min(1).max(160),
    objective: z.string().trim().min(1).max(4000),
    repository: z
      .string()
      .trim()
      .regex(
        /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/,
        "Use a GitHub owner/repository name.",
      )
      .max(200),
    criteria: criteriaSchema,
    maxCostUsd: z.number().finite().positive().max(100),
    maxDurationSeconds: z.number().int().min(60).max(3600),
    idempotencyKey: z.string().uuid(),
  })
  .strict();
export const workCommandSchema = z.discriminatedUnion("operation", [
  z
    .object({
      operation: z.literal("revise"),
      expectedVersion: z.number().int().positive(),
      criteria: criteriaSchema,
    })
    .strict(),
  z
    .object({
      operation: z.enum(["pause", "takeover", "resume", "cancel", "reopen"]),
      expectedVersion: z.number().int().positive(),
    })
    .strict(),
]);
export type Criterion = z.infer<typeof criterionSchema>;
export type WorkCommand = z.infer<typeof workCommandSchema>;
export type WorkLifecycle =
  | "active"
  | "accepted"
  | "cancelled"
  | "failed"
  | "superseded";
export type WorkControl = "agent" | "human" | "paused" | "stopping";
export interface WorkPrincipal {
  scopeId: string;
  actorId: string;
  scopeKind: "personal" | "organization";
}
export interface Work {
  id: string;
  scopeId: string;
  title: string;
  objective: string;
  repository: string;
  lifecycle: WorkLifecycle;
  control: WorkControl;
  version: number;
  generation: number;
  criteriaVersion: number;
  criteria: Criterion[];
  maxCostUsd: number;
  maxDurationSeconds: number;
  createdAt: string;
  updatedAt: string;
}
export interface WorkEvent {
  id: string;
  kind: string;
  actorId: string;
  version: number;
  createdAt: string;
}
export interface CriteriaRevision {
  version: number;
  criteria: Criterion[];
  createdAt: string;
}
export class WorkError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 409,
  ) {
    super(message);
  }
}

/** Lifecycle operations cannot synthesize execution, readiness or acceptance. */
export function nextWorkState(
  work: Pick<Work, "lifecycle" | "control">,
  command: WorkCommand,
) {
  if (command.operation === "reopen") {
    if (!["accepted", "cancelled", "failed"].includes(work.lifecycle))
      throw new WorkError(
        "invalid_transition",
        "Only accepted, cancelled or failed Work can be reopened.",
      );
    return { lifecycle: "active" as const, control: "paused" as const };
  }
  if (work.lifecycle !== "active")
    throw new WorkError(
      "work_terminal",
      "Reopen this Work before making changes.",
    );
  if (work.control === "stopping")
    throw new WorkError(
      "work_stopping",
      "Wait for execution to stop before changing control.",
    );
  if (command.operation === "cancel")
    return { lifecycle: "cancelled" as const, control: "paused" as const };
  if (command.operation === "pause")
    return { lifecycle: work.lifecycle, control: "paused" as const };
  if (command.operation === "takeover")
    return { lifecycle: work.lifecycle, control: "human" as const };
  if (command.operation === "resume")
    return { lifecycle: work.lifecycle, control: "agent" as const };
  return { lifecycle: work.lifecycle, control: work.control };
}

export interface Observation {
  criterionId: string;
  criteriaVersion: number;
  candidate: string;
  profile: string;
  producer: "supervisor" | "human";
  result: "passed" | "failed" | "unknown";
}
export function evaluateReadiness(input: {
  work: Pick<Work, "lifecycle" | "control" | "criteria" | "criteriaVersion">;
  candidate: string | null;
  profile: string | null;
  observations: Observation[];
  activeAttempt: boolean;
  unresolvedEffect: boolean;
  authorityCurrent: boolean;
}) {
  const reasons: string[] = [];
  if (!criteriaSchema.safeParse(input.work.criteria).success)
    reasons.push("Valid, non-empty acceptance criteria are required.");
  if (input.work.lifecycle !== "active") reasons.push("Work is not active.");
  if (input.work.control !== "agent")
    reasons.push("Work is under human control or paused.");
  if (!input.authorityCurrent)
    reasons.push("Current execution authority is unavailable.");
  if (!input.candidate || !input.profile)
    reasons.push("A verified candidate and repository profile are required.");
  if (input.activeAttempt || input.unresolvedEffect)
    reasons.push("An execution or external effect still needs reconciliation.");
  for (const criterion of input.work.criteria) {
    const observations = input.observations.filter(
      (o) =>
        o.criterionId === criterion.id &&
        o.criteriaVersion === input.work.criteriaVersion &&
        o.candidate === input.candidate &&
        o.profile === input.profile,
    );
    if (
      observations.length !== 1 ||
      observations[0].result !== "passed" ||
      observations[0].producer !==
        (criterion.method === "human" ? "human" : "supervisor")
    )
      reasons.push(
        `Current ${criterion.method === "human" ? "human assessment" : "supervisor evidence"} is missing: ${criterion.statement}`,
      );
  }
  return { ready: reasons.length === 0, reasons };
}
