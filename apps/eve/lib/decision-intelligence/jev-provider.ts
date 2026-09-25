import { experimental_evaluate as evaluate, gateway } from "ai";
import {
  DecisionFailure,
  type DecisionProvider,
  type DecisionRequest,
  type DecisionResult,
} from "./contract.ts";

export const jevMetadata = {
  name: "Jev",
  gateway: "Vercel AI Gateway",
  model: "typesafe-ai/jev",
} as const;

export function jevConfigured(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return (
    env.MYEVE_DECISION_INTELLIGENCE_ENABLED === "true" &&
    Boolean(env.AI_GATEWAY_API_KEY?.trim() || env.VERCEL_OIDC_TOKEN?.trim())
  );
}

function normalizedError(error: unknown, aborted: boolean): DecisionFailure {
  if (aborted) return new DecisionFailure("TIMEOUT");
  let current = error;
  for (
    let depth = 0;
    depth < 5 && current && typeof current === "object";
    depth++
  ) {
    const item = current as {
      name?: string;
      statusCode?: number;
      cause?: unknown;
    };
    if (
      /InvalidResponseData|TypeValidation|InvalidArgument/.test(item.name ?? "")
    )
      return new DecisionFailure("INVALID_RESPONSE");
    if (item.statusCode === 429) return new DecisionFailure("RATE_LIMITED");
    if (
      item.statusCode === 401 ||
      item.statusCode === 403 ||
      item.statusCode === 404
    )
      return new DecisionFailure("PROVIDER_UNAVAILABLE");
    if (item.statusCode === 408 || item.statusCode === 504)
      return new DecisionFailure("TIMEOUT");
    current = item.cause;
  }
  return new DecisionFailure("GATEWAY_FAILURE");
}

/** The experimental SDK surface and Gateway route are isolated to this adapter. */
export class JevDecisionProvider implements DecisionProvider {
  private readonly configured: () => boolean;
  private readonly model: () => ReturnType<typeof gateway.evaluationModel>;

  constructor(
    options: {
      configured?: () => boolean;
      model?: () => ReturnType<typeof gateway.evaluationModel>;
    } = {},
  ) {
    this.configured = options.configured ?? (() => jevConfigured());
    this.model =
      options.model ?? (() => gateway.evaluationModel(jevMetadata.model));
  }

  async evaluate<T extends string>(
    request: DecisionRequest<T>,
    signal: AbortSignal,
  ): Promise<DecisionResult<T>> {
    if (!this.configured()) throw new DecisionFailure("PROVIDER_UNAVAILABLE");
    const started = performance.now();
    const boundedSignal = AbortSignal.any([signal, AbortSignal.timeout(3000)]);
    try {
      const model = this.model();
      const result = await evaluate({
        model: {
          specificationVersion: model.specificationVersion,
          provider: model.provider,
          modelId: model.modelId,
          supportedQuestionTypes: model.supportedQuestionTypes,
          async doEvaluate(options) {
            const result = await model.doEvaluate(options);
            // Provider warning strings can contain input/diagnostics. Do not let the
            // SDK's warning logger print them outside this privacy boundary.
            return { ...result, warnings: [] };
          },
        },
        state: request.state,
        questions: {
          classification: {
            type: "choice",
            instructions: request.question,
            criteria: request.definitions,
          },
        },
        abortSignal: boundedSignal,
        maxRetries: 0,
      });
      const answer = result.answers.classification;
      if (!request.outcomes.includes(answer.choice as T))
        throw new DecisionFailure("INVALID_RESPONSE");
      // AI SDK validates complete keys, finite [0,1] values, rounded sum-to-one,
      // and highest-probability selection. Preserve its choice, including ties.
      const probabilities = answer.probabilities
        ? ({ ...answer.probabilities } as Record<T, number>)
        : null;
      const inputTokens = result.usage.inputTokens;
      if (
        inputTokens !== undefined &&
        (!Number.isSafeInteger(inputTokens) || inputTokens < 0)
      )
        throw new DecisionFailure("INVALID_RESPONSE");
      return {
        outcome: answer.choice as T,
        probabilities,
        // This is P(selected class), not TypeSafe's separate confidence metadata.
        confidence: probabilities?.[answer.choice as T] ?? null,
        provider: jevMetadata.name,
        model: result.response.modelId,
        latencyMs: performance.now() - started,
        inputTokens: inputTokens ?? null,
        // The SDK evaluation usage contract has no monetary-cost field.
        costUsd: null,
        evaluatedAt: result.response.timestamp.toISOString(),
      };
    } catch (error) {
      if (error instanceof DecisionFailure) throw error;
      throw normalizedError(error, boundedSignal.aborted);
    }
  }
}
