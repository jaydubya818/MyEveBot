import {ownerRuntimeFromAuth} from "../lib/relay/owner/runtime.ts";
import {ownerBudgetedModel,ownerModelStepKey} from "../lib/relay/owner/model.ts";
import type { LanguageModelMiddleware } from "ai";
import { gateway, wrapLanguageModel } from "ai";
import { defineAgent, defineDynamic } from "eve";

import { clientTurnSettings, resolveSessionAgent } from "./lib/session-settings.ts";

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
  // Keep native and build-tool packages out of eve's hosted bundle. The
  // framework traces them into the Vercel output for runtime Node resolution.
  build: {
    externalDependencies: ["@remotion/bundler", "@remotion/renderer", "heif2jpeg"],
  },
  // The dynamic fallback is newer than the framework's bundled Gateway
  // catalog. Use a conservative known window so compaction can compile and
  // starts early enough even when the selected model supports a larger one.
  modelContextWindowTokens: 200_000,
  model: defineDynamic({
    fallback: DEFAULT_MODEL,
    events: {
      "turn.started": async (_event, ctx) => {
        const agent = await resolveSessionAgent({ ownerId: ctx.session.auth.current?.principalId, sessionId: ctx.session.id, auth: ctx.session.auth, primaryFallback: ctx.session.auth.current?.attributes.owner === "true" });
        return agent?.preferredModel ?? clientTurnSettings(ctx.messages).model;
      },
      // Reasoning effort is a per-call AI SDK setting, not a field the dynamic
      // model selection object accepts, so a requested level rides on a live
      // gateway model wrapped with default settings. Live models are only
      // allowed from step.started; with no level requested this returns null
      // and the turn-scoped string selection (plain prompt-cache path) wins.
      "step.started": async (_event, ctx) => {
        const ownerRuntime=ownerRuntimeFromAuth(ctx.session.auth);
        if(ownerRuntime)return ownerBudgetedModel(ownerRuntime,ownerModelStepKey(_event));
        const requested = clientTurnSettings(ctx.messages);
        const agent = await resolveSessionAgent({ ownerId: ctx.session.auth.current?.principalId, sessionId: ctx.session.id, auth: ctx.session.auth, primaryFallback: ctx.session.auth.current?.attributes.owner === "true" });
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
