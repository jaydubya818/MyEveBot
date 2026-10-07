import { describe, expect, it } from "vitest";
import { pricingPreflight, preActivationChecks } from "./preactivation.ts";

const model = "openai/gpt-5.4-mini";
const good = [{ id: model, pricing: { input: "0.0000002", output: "0.0000008" } }];

describe("external alpha pre-activation", () => {
  it("fails closed on missing, zero, or non-finite rates", () => {
    expect(pricingPreflight([], model).ok).toBe(false);
    expect(pricingPreflight([{ id: model }], model).ok).toBe(false);
    expect(pricingPreflight([{ id: model, pricing: { input: 0, output: 1 } }], model).ok).toBe(false);
    expect(pricingPreflight([{ id: model, pricing: { input: "x", output: 1 } }], model).ok).toBe(false);
    expect(pricingPreflight([{ id: model, pricing: { input: 1 } }], model).ok).toBe(false);
  });
  it("computes the reserve and the input that fits the per-turn bound", () => {
    const p = pricingPreflight(good, model);
    if (!p.ok) throw Error("expected ok");
    const bytes = p.maxInputBytes(100000);
    expect(bytes).toBeGreaterThan(1000);
    expect(p.reservePerMicroUsdAt(bytes)).toBeLessThanOrEqual(100000);
    expect(p.reservePerMicroUsdAt(bytes + 2)).toBeGreaterThan(100000);
  });
  it("denies activation when anything is missing or the bound cannot fit", () => {
    const base = {
      policyValid: true, workConfigValid: true, signingKeyPresent: true,
      migrationApplied: true, paidPathsAllClassified: true,
      pricing: pricingPreflight(good, model), chatTurnBoundMicros: 100000, minimumPromptBytes: 2000,
    };
    expect(preActivationChecks(base).ok).toBe(true);
    expect(preActivationChecks({ ...base, migrationApplied: null }).ok).toBe(false);
    expect(preActivationChecks({ ...base, pricing: null }).ok).toBe(false);
    expect(preActivationChecks({ ...base, signingKeyPresent: false }).ok).toBe(false);
    expect(preActivationChecks({ ...base, minimumPromptBytes: 10_000_000 }).ok).toBe(false);
  });
});
