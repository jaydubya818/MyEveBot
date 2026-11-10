import { expect, it } from "vitest";
import { validateJourneyPlan } from "./plan.ts";
import { factoryMinimumCeilingMicrousd, requireStageBudgetConfiguration } from "./work-budget-preflight.ts";

// The qualified hosted MyFactory paid plan (WORK_LEDGER_V2, gpt-5.4-mini card): 2 productive + 1 completion at 336,864 microUSD per call.
const hostedSpendPlan = { version: "WORK_LEDGER_V2" as const, pricingRevision: "openai-gpt54mini-20261107-published", plannedProductiveOperations: 2,
  plannedCompletionOperations: 1, maxPaidOperations: 3, completionReserveMicrousd: 336_864 };
const plan = (reserve: number) => validateJourneyPlan({ slot: "Q1", stages: [
  { stage: 1, workCeilingMicrousd: 1_300_000, operations: [{ key: "s1-coding", purpose: "CODING", reserveMicrousd: reserve }] },
  { stage: 2, workCeilingMicrousd: 1_300_000, operations: [{ key: "s2-coding", purpose: "CODING", reserveMicrousd: reserve }] },
  { stage: 3, workCeilingMicrousd: 1_300_000, operations: [{ key: "s3-factory", purpose: "FACTORY", reserveMicrousd: reserve }] },
  { stage: 4, workCeilingMicrousd: 1_300_000, operations: [{ key: "s4-verifier", purpose: "VERIFIER", reserveMicrousd: 650_000 }] },
] });

it("derives MyFactory's minimum Work ceiling for a paid plan (completion reserve + productive slots at the per-call bound)", () => {
  expect(factoryMinimumCeilingMicrousd(hostedSpendPlan)).toBe(1_010_592);
  expect(factoryMinimumCeilingMicrousd({ ...hostedSpendPlan, pricingRevision: "owner-subscription-local.operations-v1", completionReserveMicrousd: 1 })).toBe(3);
});

it("refuses, before any Work exists, a stage Work budget above the operation reservation or below MyFactory's paid plan", () => {
  // The first hosted template: $1.30 Works against 650,000 reservations (the charged-parent guard refuses stage 1 only after confirmation).
  expect(() => requireStageBudgetConfiguration(plan(650_000), 1.3, hostedSpendPlan)).toThrow("QDEV_WORK_BUDGET_EXCEEDS_OPERATION_RESERVATION:1");
  // Shrinking the Work to the reservation instead leaves MyFactory unable to fit its conservative plan.
  expect(() => requireStageBudgetConfiguration(plan(650_000), 0.65, hostedSpendPlan)).toThrow("QDEV_WORK_BUDGET_BELOW_FACTORY_PLAN:1");
  expect(() => requireStageBudgetConfiguration(plan(1_300_000), 1.0, hostedSpendPlan)).toThrow("QDEV_WORK_BUDGET_BELOW_FACTORY_PLAN:1");
  // The corrected hosted template: reservation = stage ceiling = Work budget = $1.30 (within the $5.20 journey: 3 x 1.3M + 0.65M).
  const budgets = requireStageBudgetConfiguration(plan(1_300_000), 1.3, hostedSpendPlan);
  expect(budgets.map(b => [b.stage, b.nativeCeilingMicrousd, b.operationReserveMicrousd])).toEqual([[1, 1_300_000, 1_300_000], [2, 1_300_000, 1_300_000], [3, 1_300_000, 1_300_000]]);
  // Without a paid Factory plan only the reservation rule applies.
  expect(() => requireStageBudgetConfiguration(plan(650_000), 0.65)).not.toThrow();
});
