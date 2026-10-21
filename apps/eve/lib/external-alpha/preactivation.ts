// Pre-activation checks for the external alpha. Pure functions, no network and
// no provider calls: the caller supplies the catalog pricing it read. Every
// check fails closed; a missing rate or a reserve that cannot fit the bound
// means the alpha must not be activated.
export type CatalogPricing = {
  input?: unknown;
  output?: unknown;
  cachedInputTokens?: unknown;
  cacheCreationInputTokens?: unknown;
};

export type PricingCheck =
  | { ok: true; rates: number[]; reservePerMicroUsdAt: (inputBytes: number) => number; maxInputBytes: (boundMicros: number) => number }
  | { ok: false; reason: string };

const outputTokens = 1024;
const inputPadding = 1024;

export function pricingPreflight(
  models: ReadonlyArray<{ id: string; pricing?: CatalogPricing | null }>,
  model: string,
): PricingCheck {
  const price = models.find((m) => m.id === model)?.pricing;
  if (!price) return { ok: false, reason: "EXTERNAL_ALPHA_PRICING_UNAVAILABLE:missing" };
  const rates = [
    price.input,
    price.output,
    price.cachedInputTokens ?? price.input,
    price.cacheCreationInputTokens ?? price.input,
  ].map(Number);
  if (rates.some((v) => !Number.isFinite(v) || v <= 0))
    return { ok: false, reason: "EXTERNAL_ALPHA_PRICING_UNAVAILABLE:invalid" };
  const inRate = Math.max(rates[0], rates[2], rates[3]);
  // Mirrors the reserve in model.ts: 2 * (inputBound * maxInputRate + 1024 * outputRate) * 1e6.
  const reserveAt = (inputBytes: number) =>
    Math.ceil(2 * ((inputBytes + inputPadding) * inRate + outputTokens * rates[1]) * 1e6);
  const maxInputBytes = (boundMicros: number) => {
    const fixed = 2 * outputTokens * rates[1] * 1e6;
    const left = boundMicros - fixed;
    return left <= 0 ? -1 : Math.floor(left / (2 * inRate * 1e6)) - inputPadding;
  };
  return { ok: true, rates, reservePerMicroUsdAt: reserveAt, maxInputBytes };
}

export type PreActivationInput = {
  policyValid: boolean;
  workConfigValid: boolean;
  signingKeyPresent: boolean;
  migrationApplied: boolean | null; // null: database not reachable
  paidPathsAllClassified: boolean;
  pricing: PricingCheck | null; // null: catalog not read
  chatTurnBoundMicros: number;
  minimumPromptBytes: number;
};

export function preActivationChecks(input: PreActivationInput) {
  const checks: Array<{ name: string; ok: boolean; detail?: string }> = [
    { name: "policy", ok: input.policyValid },
    { name: "work-config", ok: input.workConfigValid },
    { name: "signing-key", ok: input.signingKeyPresent },
    { name: "migration-0086", ok: input.migrationApplied === true, detail: input.migrationApplied === null ? "database unreachable" : undefined },
    { name: "paid-path-registry", ok: input.paidPathsAllClassified },
  ];
  const p = input.pricing;
  checks.push({
    name: "pricing",
    ok: !!p && p.ok && p.maxInputBytes(input.chatTurnBoundMicros) >= input.minimumPromptBytes,
    detail: !p ? "catalog not read" : p.ok ? undefined : p.reason,
  });
  return { ok: checks.every((c) => c.ok), checks };
}
