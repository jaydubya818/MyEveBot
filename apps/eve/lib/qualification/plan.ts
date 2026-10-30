import { z } from "zod";
import { QDEV_LIMITS, type QualificationPurpose } from "../external-alpha/qualification-accounting.ts";

/**
 * Pure journey plan validation for qdev-20261029-01. A plan that cannot fit the
 * approved bounds is refused BEFORE any reservation or dispatch: no automatic
 * retry, replacement Work, top-up or extension exists to make it fit later.
 * Stage order follows the proposal: (1) Sofie intent/plan + first coding Work,
 * (2) second coding Work + reconciliation, (3) Factory build and ordinary tests,
 * (4) independent verification in protected custody.
 */
export const STAGE_PURPOSES: Record<1 | 2 | 3 | 4, readonly QualificationPurpose[]> = {
  1: ["SOFIE", "CODING"],
  2: ["CODING"],
  3: ["FACTORY"],
  4: ["VERIFIER"],
};

const operationSchema = z.object({
  key: z.string().min(1).max(200),
  purpose: z.enum(["SOFIE", "CODING", "FACTORY", "VERIFIER"]),
  reserveMicrousd: z.number().int().min(1).max(QDEV_LIMITS.perWorkMicrousd),
}).strict();
const stageSchema = z.object({
  stage: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  workCeilingMicrousd: z.number().int().min(1).max(QDEV_LIMITS.perWorkMicrousd),
  operations: z.array(operationSchema).min(1).max(8),
}).strict();
export const journeyPlanSchema = z.object({
  slot: z.literal("Q1"),
  stages: z.array(stageSchema).min(1).max(QDEV_LIMITS.maxWorks),
}).strict();
export type JourneyPlan = z.infer<typeof journeyPlanSchema>;

export class PlanRefused extends Error {
  constructor(readonly code: string) { super(code); }
}

export function validateJourneyPlan(input: unknown): JourneyPlan {
  const parsed = journeyPlanSchema.safeParse(input);
  if (!parsed.success) throw new PlanRefused("QDEV_PLAN_INVALID");
  const plan = parsed.data;
  let total = 0;
  const keys = new Set<string>();
  plan.stages.forEach((stage, index) => {
    if (stage.stage !== index + 1) throw new PlanRefused("QDEV_PLAN_STAGE_ORDER");
    total += stage.workCeilingMicrousd;
    if (stage.operations.reduce((sum, op) => sum + op.reserveMicrousd, 0) > stage.workCeilingMicrousd)
      throw new PlanRefused("QDEV_PLAN_WORK_CEILING_EXCEEDED");
    for (const op of stage.operations) {
      if (!STAGE_PURPOSES[stage.stage].includes(op.purpose)) throw new PlanRefused("QDEV_PLAN_PURPOSE_FOR_STAGE");
      if (keys.has(op.key)) throw new PlanRefused("QDEV_PLAN_DUPLICATE_OPERATION");
      keys.add(op.key);
    }
  });
  if (total > QDEV_LIMITS.journeyMicrousd) throw new PlanRefused("QDEV_PLAN_JOURNEY_CEILING_EXCEEDED");
  // The verdict is the point of the journey: a plan without the independent
  // verifier stage last cannot ever produce a verified end-to-end result.
  if (plan.stages.at(-1)?.stage !== 4) throw new PlanRefused("QDEV_PLAN_VERIFIER_STAGE_REQUIRED");
  return plan;
}
