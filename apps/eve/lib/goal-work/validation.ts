import { z } from "zod";
export const text = z.string().trim().min(1).max(1000);
export const criteria = z
  .array(text)
  .min(1)
  .max(20)
  .refine((a) => new Set(a).size === a.length, "Duplicate criteria");
export const priority = z.enum(["low", "normal", "high", "critical"]);
export const dependency = z
  .object({
    id: text,
    kind: z.enum([
      "task",
      "external",
      "owner",
      "schedule",
      "file",
      "capability",
      "work",
    ]),
    reference: text,
    label: text.max(500),
    notBefore: z.string().datetime().optional(),
    options: z
      .array(text.max(255))
      .max(8)
      .refine((a) => new Set(a).size === a.length, "Duplicate options")
      .optional(),
  })
  .strict()
  .superRefine((d, ctx) => {
    if (d.kind === "schedule" && !d.notBefore)
      ctx.addIssue({ code: "custom", message: "Schedule time required" });
    if (d.kind === "owner" && !d.options?.length)
      ctx.addIssue({ code: "custom", message: "Decision options required" });
  });
export const goalInput = z
  .object({
    id: text,
    objective: z.string().trim().min(1).max(200),
    criteria,
    priority: priority.default("normal"),
    target: z.string().date().nullable().default(null),
    requireOwnerConfirmation: z.boolean().optional(),
  })
  .strict();
export const taskInput = z
  .object({
    id: text,
    objective: z.string().trim().min(1).max(240),
    criteria,
    priority: priority.default("normal"),
    dueAt: z.string().datetime().nullable().default(null),
    assignedTo: text.default("sofie"),
    requiredCapabilities: z.array(text).max(30).default([]),
    dependencies: z.array(dependency).max(20).default([]),
    provenance: z
      .object({
        kind: z.enum(["owner", "plan", "result"]),
        reference: text,
        depth: z.number().int().min(0).max(4).default(0),
      })
      .strict(),
  })
  .strict();
export const resultSchema = z
  .object({
    id: text,
    ownerId: text,
    workId: text,
    correlationKey: text,
    outcome: z.enum([
      "SUCCEEDED",
      "PARTIAL",
      "FAILED",
      "BLOCKED",
      "CANCELLED",
      "SUPERSEDED",
    ]),
    current: z.boolean(),
    verified: z.boolean(),
    satisfiedCriteria: z.array(text).max(20),
    evidence: z.array(text).max(40),
    reason: z.string().max(2000),
    satisfiedGoalCriteria: z.array(text).max(20).optional(),
  })
  .strict();

export const signalSchema = z
  .object({
    eventId: text,
    ownerId: text,
    goalId: text,
    taskId: text,
    goalGeneration: z.number().int().positive(),
    taskGeneration: z.number().int().positive(),
    dependencyId: text,
    kind: z.enum(["external", "owner", "file", "capability", "work"]),
    reference: text,
    evidenceRef: text,
    option: text.optional(),
  })
  .strict();
