import { createHash } from "node:crypto";
import type {
  DecisionProvider,
  DecisionRequest,
  DecisionResult,
} from "./contract.ts";

/** Local qualification only; deliberately imperfect and never reads expected labels or example IDs. */
export class FakeDecisionProvider implements DecisionProvider {
  async evaluate<T extends string>(
    request: DecisionRequest<T>,
    signal: AbortSignal,
  ): Promise<DecisionResult<T>> {
    if (signal.aborted) throw new Error("Aborted");
    const hash = createHash("sha256").update(request.state).digest();
    const outcome = request.outcomes[hash[0]! % request.outcomes.length]!;
    const confidence = [0.62, 0.7, 0.8, 0.9, 0.95, 0.99][hash[1]! % 6]!;
    return {
      outcome,
      confidence,
      probabilities: Object.fromEntries(
        request.outcomes.map((label) => [
          label,
          label === outcome
            ? confidence
            : (1 - confidence) / (request.outcomes.length - 1),
        ]),
      ) as Record<T, number>,
      provider: "Local fixture",
      model: "deterministic-fixture-v1",
      latencyMs: 0,
      inputTokens: null,
      costUsd: null,
      evaluatedAt: new Date().toISOString(),
    };
  }
}
