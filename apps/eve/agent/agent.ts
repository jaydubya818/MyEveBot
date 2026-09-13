import type { LanguageModelMiddleware } from "ai";
import { gateway, wrapLanguageModel } from "ai";
import { defineAgent, defineDynamic } from "eve";

import { clientTurnSettings, sessionAgent } from "./lib/session-settings.ts";

const DEFAULT_MODEL = "anthropic/claude-sonnet-5";

/** The AI SDK's provider-agnostic reasoning effort levels, minus the default. */
const REASONING_LEVELS = ["none", "minimal", "low", "medium", "high", "xhigh"] as const;
type ReasoningLevel = (typeof REASONING_LEVELS)[number];

function reasoningMiddleware(reasoning: ReasoningLevel): LanguageModelMiddleware {
  return {
    specificationVersion: "v4",
    transformParams: async ({ params }) => ({
        ...params,
        reasoning: params.reasoning ?? reasoning,
        providerOptions: {
          ...params.providerOptions,
          // eve enables the gateway's automatic prompt caching for string model
          // ids only; a live model bypasses that path, so re-apply it here.
          gateway: { caching: "auto", ...params.providerOptions?.gateway },
        },
      }),
  };
}

export default defineAgent({
  model: defineDynamic({
    fallback: DEFAULT_MODEL,
    events: {
      "turn.started": async (_event, ctx) => {
        const agent = await sessionAgent(ctx.session.auth.current?.principalId, ctx.session.auth.current?.attributes.myeveAgentId, ctx.session.auth.current?.attributes.owner === "true");
        return agent?.preferredModel ?? clientTurnSettings(ctx.messages).model;
      },
      // Reasoning effort is a per-call AI SDK setting, not a field the dynamic
      // model selection object accepts, so a requested level rides on a live
      // gateway model wrapped with default settings. Live models are only
      // allowed from step.started; with no level requested this returns null
      // and the turn-scoped string selection (plain prompt-cache path) wins.
      "step.started": async (_event, ctx) => {
        const requested = clientTurnSettings(ctx.messages);
        const agent = await sessionAgent(ctx.session.auth.current?.principalId, ctx.session.auth.current?.attributes.myeveAgentId, ctx.session.auth.current?.attributes.owner === "true");
        const model = agent?.preferredModel ?? requested.model;
        const configuredReasoning = agent?.reasoningPreference;
        const selectedReasoning = configuredReasoning && configuredReasoning !== "default" ? configuredReasoning : requested.reasoning;
        const reasoning = selectedReasoning === "default" ? null : selectedReasoning;
        if (reasoning === null) return null;
        return wrapLanguageModel({
          model: gateway(model ?? DEFAULT_MODEL),
          middleware: reasoningMiddleware(reasoning),
        });
      },
    },
  }),
});
