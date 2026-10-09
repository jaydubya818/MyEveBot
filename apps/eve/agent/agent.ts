import {externalAlphaInstallation} from '../lib/external-alpha/policy.ts';
import {externalAlphaModel} from '../lib/external-alpha/model.ts';
import {selectedAlphaWork} from "../lib/engineering/alpha-selected-work.ts";
import {retainedSummaryBinding,retainedWorkSummaryModel} from './lib/retained-work-summary.ts';
import {cloudConversationModel} from '../lib/engineering/cloud-conversation-model.ts';
import { cloudQualificationProject } from "../lib/engineering/cloud-access-qualification.ts";
import { hostedFactoryQueue } from "../lib/engineering/deployment-mode.ts";
import { partnerPrivateModel } from "./lib/partner-model.ts";
import { isPartnerPrincipal } from "../lib/private-owner-boundary.ts";
import { BusinessScopes } from "../lib/business-scopes.ts";
import { engineeringConversationModel } from "../lib/engineering/conversation-model.ts";
import { WorkStore } from "../lib/engineering/store.ts";
import {ownerRuntimeFromAuth} from "../lib/relay/owner/runtime.ts";
import {ownerBudgetedModel,ownerModelStepKey} from "../lib/relay/owner/model.ts";
import type { LanguageModelMiddleware } from "ai";
import { gateway, wrapLanguageModel } from "ai";
import { defineAgent, defineDynamic } from "eve";

import { clientTurnSettings, primaryChatSettings, rememberedChatSettings, resolveSessionAgent } from "./lib/session-settings.ts";

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
  model: defineDynamic({
    events: {
      // Resolve only at step.started: no serialized unbudgeted model selection may
      // be reused for selected-Work compaction or other auxiliary model work.
      // Reasoning effort is a per-call AI SDK setting, not a field the dynamic
      // model selection object accepts, so a requested level rides on a live
      // gateway model wrapped with default settings. Live models are only
      // allowed from step.started; with no level requested this returns a model ID
      // and returns the selected model with its normal prompt-cache behavior.
      "step.started": (_event, ctx) => {
        const select = async () => {
        const retained=ctx.session.auth.current?.attributes.myeveRetainedSummary;
        if(retained!==undefined){
          const binding=retainedSummaryBinding(retained),current=ctx.session.auth.current,initiator=ctx.session.auth.initiator;
          if(ctx.session.id!==binding.sessionId||current?.authenticator!=='myeve-web-session'||initiator?.authenticator!=='myeve-web-session'||current.principalType!=='user'||initiator.principalType!=='user'||current.principalId!==binding.ownerId||initiator.principalId!==binding.ownerId||current.attributes.owner!=='true'||initiator.attributes.owner!=='true'||current.attributes.webThreadId!==binding.threadId||initiator.attributes.webThreadId!==binding.threadId||current.attributes.myeveEngineeringWorkId||current.attributes.myeveRoleId||('parent' in ctx.session&&ctx.session.parent))throw Error('RETAINED_SUMMARY_AUTHENTICATION');
          const agent=await resolveSessionAgent({ownerId:binding.ownerId,sessionId:ctx.session.id,auth:ctx.session.auth,primaryFallback:true});
          if(!agent?.isPrimary)throw Error('RETAINED_SUMMARY_PRIMARY_AGENT');
          return {model:retainedWorkSummaryModel(binding),modelContextWindowTokens:200_000};
        }
        if(externalAlphaInstallation()){
          if('parent' in ctx.session&&ctx.session.parent)throw Error('EXTERNAL_ALPHA_DELEGATION_DISABLED');
          return {model:externalAlphaModel({ownerId:ctx.session.auth.current?.principalId,sessionId:ctx.session.id,auth:ctx.session.auth,primaryFallback:true,stepKey:ownerModelStepKey(_event)}),modelContextWindowTokens:32000};
        }
        if(process.env.MYEVE_ALPHA_OWNER_BINDING){
          const current=ctx.session.auth.current,selected=selectedAlphaWork(current?.attributes.myeveEngineeringWorkId);
          if(!selected||current?.authenticator!=='myeve-web-session'||current.principalType!=='user'||current.principalId!==selected.binding.ownerScope||current.attributes.owner!=='true'||current.attributes.role==='guest'||current.attributes.myeveRoleId||('parent' in ctx.session&&ctx.session.parent))throw Error('ALPHA_SELECTED_WORK_REQUIRED');
        }
        if(cloudQualificationProject()){
          const current=ctx.session.auth.current;
          if(!current||current.authenticator!=="myeve-web-session"||current.principalType!=="user"||current.attributes.owner!=="true"||current.attributes.role==="guest"||current.attributes.myeveRoleId||("parent" in ctx.session&&ctx.session.parent))throw Error("CLOUD_CONVERSATION_AUTHENTICATION");
          const agent=await resolveSessionAgent({ownerId:current.principalId,sessionId:ctx.session.id,auth:ctx.session.auth,primaryFallback:true});
          if(!agent?.isPrimary)throw Error("CLOUD_CONVERSATION_PRIMARY_AGENT");
          const selected=current.attributes.myeveEngineeringWorkId;
          if(selected!==undefined&&typeof selected!=="string")throw Error("CLOUD_CONVERSATION_WORK");
          return {model:cloudConversationModel({ownerId:current.principalId,agentId:agent.id,sessionId:ctx.session.id,stepKey:ownerModelStepKey(_event),workId:selected,productive:current.attributes.myeveEngineeringIntent==="continue"}),modelContextWindowTokens:64000};
        }
        const ownerRuntime=ownerRuntimeFromAuth(ctx.session.auth);
        if(ownerRuntime && ctx.session.auth.current?.attributes.myeveEngineeringWorkId!==undefined)
          throw new Error("Owner-channel and selected-Work spending authorities cannot be mixed.");
        if(ownerRuntime)return ownerBudgetedModel(ownerRuntime,ownerModelStepKey(_event));
        if(isPartnerPrincipal(ctx.session.auth.current?.principalId))return {model:partnerPrivateModel({ownerId:ctx.session.auth.current?.principalId,sessionId:ctx.session.id,auth:ctx.session.auth,primaryFallback:true}),modelContextWindowTokens:200_000};
        const requested = clientTurnSettings(ctx.messages);
        const agent = await resolveSessionAgent({ ownerId: ctx.session.auth.current?.principalId, sessionId: ctx.session.id, auth: ctx.session.auth, primaryFallback: ctx.session.auth.current?.attributes.owner === "true" });
        const model = agent?.preferredModel ?? requested.model;
        const workId=ctx.session.auth.current?.attributes.myeveEngineeringWorkId;
        if (workId !== undefined && (typeof workId!=="string" || !agent?.isPrimary ||
            ctx.session.auth.current?.principalType!=="user" || ctx.session.auth.current?.attributes.owner!=="true" || ("parent" in ctx.session && ctx.session.parent)))
          throw new Error("Selected Work requires an authenticated primary-Agent conversation.");
        if (typeof workId==="string" && agent?.isPrimary) {
          if(await new BusinessScopes(agent.ownerId).hasSharedWork(agent.ownerId,workId))throw new Error("Shared Work requires the scoped Our business conversation.");
          const store=new WorkStore({scopeId:agent.ownerId,scopeKind:"personal",actorId:agent.ownerId});
          return {
            model:engineeringConversationModel({store,workId,productive:ctx.session.auth.current?.attributes.myeveEngineeringIntent==="continue",sessionId:ctx.session.id,stepKey:`${ctx.session.id}:${ownerModelStepKey(_event)}`,modelId:(selectedAlphaWork(workId)||hostedFactoryQueue())?"openai/gpt-5.4-mini":model??DEFAULT_MODEL}),
            modelContextWindowTokens:200_000,
          };
        }
        const chatSettings = primaryChatSettings(agent, agent?.isPrimary ? rememberedChatSettings(requested) : requested);
        console.info("sofie_chat_model_selected", {sessionId:ctx.session.id, modelId:chatSettings.model ?? DEFAULT_MODEL});
        const selectedReasoning = chatSettings.reasoning;
        const reasoning = selectedReasoning === "default" ? null : selectedReasoning;
        if (reasoning === null) return { model: chatSettings.model ?? DEFAULT_MODEL, modelContextWindowTokens: 200_000 };
        return { model: wrapLanguageModel({
          model: gateway(chatSettings.model ?? DEFAULT_MODEL),
          middleware: reasoningMiddleware(reasoning),
        }), modelContextWindowTokens: 200_000 };
        };
        const resolve = async () => { const selected=await select(); const value='model' in selected?selected.model:selected;
          // agent-model-selection: an external-alpha installation can only dispatch through its budgeted model (or the deterministic evidence summary).
          if(externalAlphaInstallation()&&(typeof value==='string'||!['myeve-external-alpha','myeve-retained-evidence'].includes(value.provider)))throw Error('EXTERNAL_ALPHA_PAID_PATH_DENIED:agent-model-selection');
          return typeof value==='string'?gateway(value):value; };
        return {model:{specificationVersion:'v4' as const,provider:'myeve-scoped-selection',modelId:'authenticated-scope',supportedUrls:{},
          doGenerate:async(options:Parameters<ReturnType<typeof gateway>['doGenerate']>[0])=>(await resolve()).doGenerate(options),
          doStream:async(options:Parameters<ReturnType<typeof gateway>['doStream']>[0])=>(await resolve()).doStream(options)},
          // Eve estimates its full catalog before the alpha wrapper removes
          // unavailable capabilities. Keep the existing framework token window;
          // alpha admission separately enforces 32,000 bytes before any dispatch.
          // Paid compaction remains denied, including on oversized histories.
          modelContextWindowTokens:200_000};
      },
    },
  }),
});
