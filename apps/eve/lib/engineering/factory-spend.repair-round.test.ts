import { describe, expect, it } from "vitest";
import { REPAIR_ROUND_MAX_MODEL_CALLS, workSpendV2Schema } from "./factory-spend.ts";
import { factoryMinimumCeilingMicrousd, requireStageBudgetConfiguration } from "../qualification/work-budget-preflight.ts";
import { validateJourneyPlan } from "../qualification/plan.ts";

// R9 (owner approval 2026-11-17): productive step + a repair round of at most 3 model calls, $1.30 Work ceiling unchanged.
const PER_OP = 336_864, CEILING = 1_300_000, FV = "a".repeat(64);
const ids = { workId: "11111111-1111-4111-8111-111111111111", requestId: "22222222-2222-4222-8222-222222222222", workOrderId: "33333333-3333-4333-8333-333333333333" };
const op = (n: number, phase: "productive" | "completion", actual: number) => ({ operationId: `op-${n}`, workId: ids.workId, workGeneration: 1, dispatchIdentity: "d",
  requestId: ids.requestId, workOrderId: ids.workOrderId, factoryVersion: FV, runId: "run", model: "openai/gpt-5.4-mini", pricingRevision: "rev",
  reservedMicrousd: PER_OP, actualMicrousd: actual, providerRequestId: `p-${n}`, usage: { input_tokens: 10, output_tokens: 10 }, state: "settled" as const, phase });
function summary(planned: number, operations: ReturnType<typeof op>[]) {
  const settled = operations.reduce((n, o) => n + o.actualMicrousd, 0), completion = operations.filter(o => o.phase === "completion");
  const completionRemaining = PER_OP - completion.reduce((n, o) => n + o.actualMicrousd, 0), available = CEILING - settled;
  return { status: "KNOWN", currency: "USD", unit: "microUSD", ...ids, workGeneration: 1, deadline: "2026-11-18T00:00:00.000Z", ceilingMicrousd: CEILING,
    settledMicrousd: settled, retainedMicrousd: 0, availableMicrousd: available, cancelled: false, operations,
    contractVersion: "WORK_LEDGER_V2", pricingRevision: "rev", plannedProductiveOperations: planned, plannedCompletionOperations: 1,
    perOperationReserveMicrousd: PER_OP, completionReserveMicrousd: PER_OP, completionReserveRemainingMicrousd: completionRemaining,
    productiveAllowanceRemainingMicrousd: available - completionRemaining, unknownExposureMicrousd: 0, paidOperationsUsed: operations.length,
    maxPaidOperations: planned + 1, completionOperationsUsed: completion.length, completionOperationSlotsRemaining: 1 - completion.length,
    accountingComplete: true, pricingQualified: true, authorityState: "active", phase: completion.length ? "completion" : "productive" };
}
describe("R9 repair round accounting", () => {
  it("accepts step + 3 repair calls + completion under the unchanged $1.30 ceiling", () => {
    expect(REPAIR_ROUND_MAX_MODEL_CALLS).toBe(3);
    const ops = [op(1, "productive", 18_539), op(2, "productive", 9_185), op(3, "productive", 9_185), op(4, "productive", 9_185), op(5, "completion", 30)];
    expect(workSpendV2Schema.safeParse(summary(4, ops)).success).toBe(true);
  });
  it("refuses a plan beyond 1+3 productive calls and any operation beyond the declared plan", () => {
    expect(workSpendV2Schema.safeParse(summary(5, [op(1, "productive", 10)])).success).toBe(false);
    const six = [1, 2, 3, 4, 5].map(n => op(n, "productive", 10));
    expect(workSpendV2Schema.safeParse(summary(4, six)).success).toBe(false);
  });
  it("keeps the stage preflight minimum at the conservative step + first repair + completion (1,010,592) and admits the $1.30 template", () => {
    const spendPlan = { version: "WORK_LEDGER_V2" as const, pricingRevision: "rev", plannedProductiveOperations: 4, plannedCompletionOperations: 1, maxPaidOperations: 5, completionReserveMicrousd: PER_OP };
    expect(factoryMinimumCeilingMicrousd(spendPlan)).toBe(1_010_592);
    const plan = validateJourneyPlan({ slot: "Q1", stages: [1, 2, 3].map(stage => ({ stage, workCeilingMicrousd: CEILING, operations: [{ key: `s${stage}`, purpose: stage === 3 ? "FACTORY" : "CODING", reserveMicrousd: CEILING }] }))
      .concat([{ stage: 4, workCeilingMicrousd: CEILING, operations: [{ key: "s4", purpose: "VERIFIER", reserveMicrousd: 650_000 }] }]) as never });
    expect(() => requireStageBudgetConfiguration(plan, 1.3, spendPlan)).not.toThrow();
    expect(() => requireStageBudgetConfiguration(plan, 1.0, spendPlan)).toThrow("QDEV_WORK_BUDGET_BELOW_FACTORY_PLAN:1");
  });
});
