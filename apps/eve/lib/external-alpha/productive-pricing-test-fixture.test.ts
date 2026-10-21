import { afterEach, describe, expect, it, vi } from "vitest";
import { productivePricingFixture, bindProductivePricingFixture } from "../../test/fixtures/productive-pricing.ts";

const now = Date.parse("2026-10-10T12:00:00Z"), deadline = new Date(now + 60000).toISOString();
const price = Object.freeze({ revision: "historical-production-fixture", model: "provider/model", validUntil: "2026-10-09T00:00:00Z", contextLimitTokens: 64000, outputLimitTokens: 8192, inputMicrousdPerMillion: 750000, outputMicrousdPerMillion: 4500000 });
const plan = Object.freeze({ version: "WORK_LEDGER_V2", pricingRevision: price.revision, model: price.model, validUntil: price.validUntil, perOperationReserveMicrousd: 84864, plannedProductiveOperations: 2, plannedCompletionOperations: 1, maxPaidOperations: 3, completionReserveMicrousd: 84864 });
afterEach(() => vi.unstubAllEnvs());
const fixture = () => { vi.stubEnv("NODE_ENV", "test"); vi.stubEnv("MYEVE_EXTERNAL_ALPHA_PRODUCTIVE_FIXTURE", "1"); return productivePricingFixture(price, plan, deadline, now); };

describe("unadopted offline productive pricing proposal", () => {
  it("preserves all historical numerical bounds and original objects under a distinct fixture identity", () => {
    const before = JSON.stringify({ price, plan }), out = fixture();
    expect(JSON.stringify({ price, plan })).toBe(before);
    expect(out.price).toEqual({ ...price, revision: "fixture-offline-productive-v1", validUntil: deadline });
    expect(out.spendPlan).toEqual({ ...plan, pricingRevision: out.price.revision, validUntil: deadline });
    expect(out.identity.kind).toBe("TEST_ONLY_OFFLINE_PRODUCTIVE");
    expect(out.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(Object.isFrozen(out.price) && Object.isFrozen(out.spendPlan)).toBe(true);
    expect(productivePricingFixture(price, plan, new Date(now + 59000).toISOString(), now).sha256).not.toBe(out.sha256);
  });
  it("rejects expiry, unbounded validity, missing opt-in and production mode", () => {
    fixture();
    for (const end of [new Date(now).toISOString(), new Date(now + 300001).toISOString(), "invalid"]) expect(() => productivePricingFixture(price, plan, end, now)).toThrow("FIXTURE_PRICING_WINDOW");
    vi.stubEnv("MYEVE_EXTERNAL_ALPHA_PRODUCTIVE_FIXTURE", "0");
    expect(() => productivePricingFixture(price, plan, deadline, now)).toThrow("OFFLINE_PRODUCTIVE_FIXTURE_REQUIRED");
    vi.stubEnv("MYEVE_EXTERNAL_ALPHA_PRODUCTIVE_FIXTURE", "1"); vi.stubEnv("NODE_ENV", "production");
    expect(() => productivePricingFixture(price, plan, deadline, now)).toThrow("OFFLINE_PRODUCTIVE_FIXTURE_REQUIRED");
  });
  it("rejects inconsistent model, revision, expiry and reservation contracts", () => {
    fixture();
    for (const patch of [{ model: "other/model" }, { pricingRevision: "other" }, { validUntil: deadline }]) expect(() => productivePricingFixture(price, { ...plan, ...patch }, deadline, now)).toThrow("FIXTURE_CANONICAL_PRICING_BINDING");
    for (const patch of [{ perOperationReserveMicrousd: 1 }, { completionReserveMicrousd: 1 }]) expect(() => productivePricingFixture(price, { ...plan, ...patch }, deadline, now)).toThrow("FIXTURE_RESERVATION_BINDING");
  });
  it("binds only the exact untouched canonical dependency and prevents later mutation", () => {
    const out = fixture(), runtime = { control: { executionSpendPlan: plan } };
    expect(bindProductivePricingFixture(runtime, plan, out)).toBe(runtime);
    expect(runtime.control.executionSpendPlan).toBe(out.spendPlan);
    expect(() => { runtime.control.executionSpendPlan = plan; }).toThrow();
    expect(() => bindProductivePricingFixture(runtime, plan, out)).toThrow("FIXTURE_PLAN_ALREADY_CHANGED");
    expect(() => bindProductivePricingFixture({ control: { executionSpendPlan: { ...plan } } }, plan, out)).toThrow("FIXTURE_PLAN_ALREADY_CHANGED");
  });
});
