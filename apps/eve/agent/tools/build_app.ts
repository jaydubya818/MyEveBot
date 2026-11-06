import { defineDynamic, defineTool } from "eve/tools";
import { checkCapabilityAvailability } from "../../lib/capability-registry.ts";
import { ActionGateway, consumeActionAuthority, consumeProviderAuthority } from "../../lib/action-gateway.ts";
import { factoryAction } from "../../lib/engineering/factory-api.ts";
import { ownerAppBuildSchema, startOwnerAppBuild } from "../../lib/engineering/owner-app-build.ts";
import { localLiveFactoryEnabled, readOwnerAppProfile } from "../../lib/engineering/owner-app-profile.ts";
import { WorkStore } from "../../lib/engineering/store.ts";
import { WorkError } from "../../lib/engineering/types.ts";
import { EngineeringWorkerProjectionStore } from "../../lib/engineering/worker-projection.ts";
import { currentTruthLines } from "../../lib/engineering/current-truth-lines.ts";
import { runExternalAlphaTool } from "../../lib/external-alpha/tool-authority.ts";
import { toolActionRequest } from "../lib/action-context.ts";
import { resolveSessionAgent } from "../lib/session-settings.ts";

type Principal = { principalId: string; principalType: string; attributes: Record<string, unknown> } | null | undefined;
const directOwner = (p: Principal) => !!p && p.principalType === "user" && p.attributes.owner === "true" &&
  p.attributes.role !== "guest" && !p.attributes.myeveRoleId;

/** Thin Sofie entry: canonical Work plus the existing Factory start. MyFactory codes, checks, repairs, signs and previews. */
export default defineDynamic({
  events: {
    "step.started": async (_event, ctx) => {
      const caller = ctx.session.auth.current;
      if (checkCapabilityAvailability("tool.build_app")?.status !== "available" || !directOwner(caller) ||
          ("parent" in ctx.session && ctx.session.parent)) return null;
      return defineTool({
        availableInSubagents: false,
        description: "Build a small web app the owner asked for. Write 1-8 concrete acceptance checks from the request (for example 'Shows 0 initially', 'Clicking Reset sets the count to 0'). This creates one canonical Work and hands it to MyFactory, which writes the code, builds and tests it in an offline container, repairs once from failing checks, signs the verification evidence and prepares a private preview. Spend is capped by MyFactory at $1.35 per Work. It returns the Work id; later call status with that id and report progress, the verification result and the preview link exactly as returned. Never claim success before status shows a verified Result.",
        inputSchema: ownerAppBuildSchema,
        async execute(input, toolCtx) {
          return runExternalAlphaTool(toolCtx, "build_app", input, async () => {
            const principal = toolCtx.session.auth.current;
            if (!localLiveFactoryEnabled() || !directOwner(principal) || principal!.principalId !== caller!.principalId || toolCtx.session.parent)
              throw new WorkError("build_app_binding", "The direct owner and the local MyFactory switch are required.", 403);
            const ownerId = principal!.principalId;
            const store = new WorkStore({ scopeKind: "personal", scopeId: ownerId, actorId: ownerId });
            const profile = await readOwnerAppProfile();
            const agent = await resolveSessionAgent({ ownerId, sessionId: toolCtx.session.id, auth: toolCtx.session.auth, primaryFallback: true });
            if (profile.ownerId !== ownerId || !agent?.isPrimary || agent.id !== profile.agentId)
              throw new WorkError("build_app_agent", "The owner's configured primary Agent is required.", 403);
            const status = async (workId: string) => ({ workId, currentTruth: currentTruthLines((await new EngineeringWorkerProjectionStore(store, agent.id).get(workId)).projection) });
            if (input.operation === "status") return status(input.workId);
            const action = await toolActionRequest(toolCtx, { capabilityId: "tool.build_app", actionClass: "write", parameters: input });
            return new ActionGateway().execute(action, {
              async resolveTarget() {
                return { provider: "myfactory-local", account: ownerId, resource: "owner-app-repository:" + profile.repository, environment: "isolated-dogfood" };
              },
              async execute(parameters, handle) {
                await consumeActionAuthority(handle, parameters, action.capabilityId);
                await consumeProviderAuthority(handle, parameters, action.capabilityId);
                const { workId } = await startOwnerAppBuild(store, input, profile, toolCtx.callId, (s, id, command) => factoryAction(s, id, command));
                return status(workId);
              },
              receipt(result) { return { ...result }; },
              async verify(result) { return { verified: true, receipt: { ...result } }; },
            });
          });
        },
      });
    },
  },
});
