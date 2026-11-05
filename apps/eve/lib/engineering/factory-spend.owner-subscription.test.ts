import { describe, expect, it } from "vitest";
import { factorySpendAdmission, OWNER_SUBSCRIPTION_PRICING_REVISION } from "./factory-spend.ts";
const source = "a".repeat(64), version = "b".repeat(64);
const plan = (n: number, extra: Record<string, unknown> = {}) => ({ version: "WORK_LEDGER_V2" as const, pricingRevision: OWNER_SUBSCRIPTION_PRICING_REVISION,
  plannedProductiveOperations: n, plannedCompletionOperations: 1, maxPaidOperations: n + 1, completionReserveMicrousd: 1, ...extra });
const profile = (over: Record<string, any> = {}) => ({ sourceDigest: source, factoryVersion: version, spendContract: { version: "WORK_LEDGER_V2" as const, sourceDigest: source },
  spendPlan: plan(2), qualification: { mode: "OWNER_SUBSCRIPTION_LOCAL" as const, spendEnforced: true }, ...over });

describe("OWNER_SUBSCRIPTION_LOCAL spend admission", () => {
  it("admits the exact operation plan with no USD review", () => {
    expect(factorySpendAdmission(profile()).allowed).toBe(true);
    expect(factorySpendAdmission(profile({ spendPlan: plan(1) })).allowed).toBe(true);
  });
  it("refuses any other plan, unenforced spend, a foreign contract or a USD review", () => {
    for (const over of [{ spendPlan: plan(3) }, { spendPlan: plan(2, { pricingRevision: "usd-v1" }) }, { spendPlan: plan(2, { completionReserveMicrousd: 5 }) },
      { spendPlan: undefined }, { spendContract: { version: "WORK_LEDGER_V2", sourceDigest: "c".repeat(64) } }, { spendContract: undefined },
      { qualification: { mode: "OWNER_SUBSCRIPTION_LOCAL", spendEnforced: false } },
      { qualification: { mode: "OWNER_SUBSCRIPTION_LOCAL", spendEnforced: true, spendReview: {} as any } }])
      expect(factorySpendAdmission(profile(over as any)).allowed, JSON.stringify(over)).toBe(false);
  });
  it("does not relax LIVE: the same plan without a qualified review is refused", () => {
    expect(factorySpendAdmission(profile({ qualification: { mode: "LIVE", spendEnforced: true } })).allowed).toBe(false);
  });
});
