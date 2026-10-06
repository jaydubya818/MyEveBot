import {selectedAlphaWork,selectedEngineeringWorkEnabled} from "../../lib/engineering/alpha-selected-work.ts";
import {FACTORY_TOOL_DESCRIPTION} from "../../lib/engineering/factory-proposal-contract.ts";
import { engineeringWorkEnabled, hostedFactoryQueue } from "../../lib/engineering/deployment-mode.ts";
import { checkCapabilityAvailability } from "../../lib/capability-registry.ts";
import { defineDynamic, defineTool } from "eve/tools";
import {
  factoryAction,
  factoryActionSchema,
} from "../../lib/engineering/factory-api.ts";
import { factoryConfig } from "../../lib/engineering/factory-routing.ts";
import { WorkStore } from "../../lib/engineering/store.ts";
import { WorkError } from "../../lib/engineering/types.ts";
import { EngineeringWorkerProjectionStore } from "../../lib/engineering/worker-projection.ts";
import { currentTruthLines } from "../../lib/engineering/current-truth-lines.ts";
import {
  ActionGateway,
  consumeActionAuthority,
  consumeProviderAuthority,
} from "../../lib/action-gateway.ts";
import { toolActionRequest } from "../lib/action-context.ts";
import { assertEngineeringKnowledgeWorkBinding } from "../lib/engineering-knowledge-binding.ts";
import { resolveSessionAgent } from "../lib/session-settings.ts";
import { ENGINEERING_WORK_ID_PATTERN } from "../lib/engineering-work-binding.ts";
/** Selection and qualification are backend observations, never model parameters. */
export default defineDynamic({
  events: {
    "step.started": async (_event, ctx) => {
      if (
        checkCapabilityAvailability("tool.engineering_factory")?.status !==
        "available" && !selectedAlphaWork(ctx.session.auth.current?.attributes.myeveEngineeringWorkId)
      )
        return null;
      const initial = ctx.session.auth.current,
        selected = initial?.attributes.myeveEngineeringWorkId;
      if (
        !initial ||
        initial.principalType !== "user" ||
        initial.attributes.owner !== "true" ||
        initial.attributes.role === "guest" ||
        initial.attributes.myeveRoleId ||
        ("parent" in ctx.session && ctx.session.parent) ||
        !selectedEngineeringWorkEnabled(selected,engineeringWorkEnabled()) ||
        (!hostedFactoryQueue() && !selectedAlphaWork(selected) && !process.env.MYEVE_FACTORY_CONFIG) ||
        typeof selected !== "string" ||
        !ENGINEERING_WORK_ID_PATTERN.test(selected)
      )
        return null;
      return defineTool({
        availableInSubagents: false,
        description: FACTORY_TOOL_DESCRIPTION,
        inputSchema: factoryActionSchema,
        async execute(input, toolCtx) {
          if (
            checkCapabilityAvailability("tool.engineering_factory")?.status !==
            "available" && !selectedAlphaWork(selected)
          )
            throw new WorkError(
              "factory_disabled",
              "MyFactory is unavailable.",
              403,
            );
          const principal = toolCtx.session.auth.current;
          if (
            !principal ||
            principal.principalId !== initial?.principalId ||
            principal.principalType !== "user" ||
            principal.attributes.owner !== "true" ||
            principal.attributes.role === "guest" ||
            principal.attributes.myeveRoleId ||
            principal.attributes.myeveEngineeringWorkId !== selected ||
            toolCtx.session.parent
          )
            throw new WorkError(
              "factory_binding",
              "Current owner selected Work is required.",
              403,
            );
          await assertEngineeringKnowledgeWorkBinding(
            toolCtx,
            principal.principalId,
            selected,
          );
          const hosted = hostedFactoryQueue(),
            config = hosted ? null : await factoryConfig(),
            agent = await resolveSessionAgent({
              ownerId: principal.principalId,
              sessionId: toolCtx.session.id,
              auth: toolCtx.session.auth,
              primaryFallback: true,
            });
          if (!agent?.isPrimary || (config && agent.id !== config.engineering.agentId))
            throw new WorkError(
              "factory_agent",
              "The configured primary Agent is required.",
              403,
            );
          if (
            config && !selectedAlphaWork(selected) && !["LOCAL_FIXTURE", "LOCAL_SPEND_FIXTURE"].includes(
              config.connection.qualification.mode,
            )
          )
            throw new WorkError(
              "factory_live_not_authorized",
              "Live Factory execution requires separate authorization.",
              403,
            );
          const store = new WorkStore({
            scopeKind: "personal",
            scopeId: principal.principalId,
            actorId: principal.principalId,
          });
          const action = await toolActionRequest(toolCtx, {
            capabilityId: "tool.engineering_factory",
            actionClass: "write",
            parameters: { workId: selected, ...input },
          });
          return new ActionGateway().execute(action, {
            async resolveTarget() {
              return {
                provider: config?.connection.factoryId ?? process.env.MYEVE_FACTORY_ID!,
                account: principal.principalId,
                resource: "engineering-work:" + selected,
                environment: selectedAlphaWork(selected) ? "CLOUD_PRODUCTION" : hosted ? "private-alpha" : "isolated-dogfood",
              };
            },
            async execute(parameters, handle) {
              await consumeActionAuthority(
                handle,
                parameters,
                action.capabilityId,
              );
              await consumeProviderAuthority(
                handle,
                parameters,
                action.capabilityId,
              );
              await factoryAction(store, selected, input);
              return {
                currentTruth: currentTruthLines(
                  (
                    await new EngineeringWorkerProjectionStore(
                      store,
                      agent.id,
                    ).get(selected)
                  ).projection,
                  {factoryProposal:true},
                ),
              };
            },
            receipt(result) {
              return { ...result };
            },
            async verify(result) {
              return { verified: true, receipt: { ...result } };
            },
          });
        },
      });
    },
  },
});
