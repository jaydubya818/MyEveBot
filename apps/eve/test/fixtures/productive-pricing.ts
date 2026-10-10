import { createHash } from "node:crypto";

type Price = {
  revision: string; model: string; validUntil: string;
  contextLimitTokens: number; outputLimitTokens: number;
  inputMicrousdPerMillion: number; outputMicrousdPerMillion: number;
};
type Plan = {
  version: string; pricingRevision: string; model: string; validUntil: string;
  perOperationReserveMicrousd: number; plannedProductiveOperations: number;
  plannedCompletionOperations: number; maxPaidOperations: number; completionReserveMicrousd: number;
};

/** Unadopted test-only proposal. It never represents a current provider tariff.
 * Retains the real harness model literal because the unmodified worker pins it.
 * Distinct fixture revision and digest prevent reuse as production evidence.
 */
export function productivePricingFixture(price: Price, plan: Plan, validUntil: string, now = Date.now()) {
  if (process.env.NODE_ENV !== "test" || process.env.MYEVE_EXTERNAL_ALPHA_PRODUCTIVE_FIXTURE !== "1") throw Error("OFFLINE_PRODUCTIVE_FIXTURE_REQUIRED");
  const expires = Date.parse(validUntil);
  if (!Number.isFinite(expires) || expires <= now || expires > now + 300000) throw Error("FIXTURE_PRICING_WINDOW");
  if (price.model !== plan.model || price.revision !== plan.pricingRevision || price.validUntil !== plan.validUntil) throw Error("FIXTURE_CANONICAL_PRICING_BINDING");
  const reserve = Math.ceil(price.contextLimitTokens * price.inputMicrousdPerMillion / 1000000) + Math.ceil(price.outputLimitTokens * price.outputMicrousdPerMillion / 1000000);
  if (reserve !== plan.perOperationReserveMicrousd || plan.completionReserveMicrousd !== reserve * plan.plannedCompletionOperations) throw Error("FIXTURE_RESERVATION_BINDING");
  const revision = "fixture-offline-productive-v1";
  const fixturePrice = Object.freeze({ ...price, revision, validUntil });
  const fixturePlan = Object.freeze({ ...plan, pricingRevision: revision, validUntil });
  const identity = Object.freeze({ kind: "TEST_ONLY_OFFLINE_PRODUCTIVE", version: 1, transport: "https://deterministic.factory.invalid", price: fixturePrice, spendPlan: fixturePlan });
  return Object.freeze({ price: fixturePrice, spendPlan: fixturePlan, identity, sha256: createHash("sha256").update(JSON.stringify(identity)).digest("hex") });
}

/** Uses the already exposed control dependency only in the offline test graph.
 * Refuses replacement of anything except the exact original canonical plan.
 * No production constructor, adapter, source file, environment or rate is edited.
 */
export function bindProductivePricingFixture(runtime: any, canonicalPlan: Plan, fixture: ReturnType<typeof productivePricingFixture>) {
  if (process.env.NODE_ENV !== "test" || process.env.MYEVE_EXTERNAL_ALPHA_PRODUCTIVE_FIXTURE !== "1") throw Error("OFFLINE_PRODUCTIVE_FIXTURE_REQUIRED");
  if (runtime.control.executionSpendPlan !== canonicalPlan) throw Error("FIXTURE_PLAN_ALREADY_CHANGED");
  Object.defineProperty(runtime.control, "executionSpendPlan", { value: fixture.spendPlan, writable: false, configurable: false, enumerable: true });
  return runtime;
}
