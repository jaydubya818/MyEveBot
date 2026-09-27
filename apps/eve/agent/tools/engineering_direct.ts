import { nativeBehavior } from "../../lib/engineering/native-behavior.ts";
import { nativeAdmissionTransition } from "../../lib/engineering/current-truth-lines.ts";
import { RoutingStore } from "../../lib/engineering/routing-store.ts";
import { EngineeringWorkerProjectionStore } from "../../lib/engineering/worker-projection.ts";
import { EngineeringKnowledgeStore } from "../../lib/engineering/knowledge.ts";
import { NativeModelBudget } from "../../lib/engineering/native-model-budget.ts";
import { ActionGateway, localAuthorityProvider, consumeActionAuthority, consumeProviderAuthority } from "../../lib/action-gateway.ts";
import { toolActionRequest } from "../lib/action-context.ts";
import { NativeRouteAuthority, admitNativeWork } from "../../lib/engineering/native-routing.ts";
import { defineDynamic, defineTool } from "eve/tools";
import { GOLDEN_QUALIFICATION_REPOSITORY } from "../../lib/engineering/base-preflight.ts";
import { DirectDevelopmentStore, type DirectWorkspace } from "../../lib/engineering/direct-development.ts";
import { nativeDevelopmentToolSchema as inputSchema } from "../../lib/engineering/native-input.ts";
import { engineeringRuntime } from "../../lib/engineering/runtime.ts";
import { WorkError } from "../../lib/engineering/types.ts";
import { assertEngineeringKnowledgeWorkBinding } from "../lib/engineering-knowledge-binding.ts";
import { ENGINEERING_WORK_ID_PATTERN } from "../lib/engineering-work-binding.ts";
import { resolveSessionAgent } from "../lib/session-settings.ts";

function summary(value: DirectWorkspace | null, current: boolean) {
  if (!value) return {workspace:null,current:false};
  return {current,workspace:{workId:value.workId,revision:value.revision,phase:value.phase,
    baseSha:value.baseSha,deadline:value.deadline,plan:value.plan,
    files:Object.keys(value.draftFiles).sort(),
    changedPaths:Object.keys(value.draftFiles).filter(path=>value.draftFiles[path]!==value.sourceFiles[path]).sort(),
    candidates:value.candidates.map(candidate=>({sha:candidate.sha,changedPaths:candidate.changedPaths,
      artifactHash:candidate.artifactHash,createdAt:candidate.createdAt})),
    evidence:value.evidence.map(item=>({candidate:item.candidate,check:item.check,result:item.result,
      observedAt:item.observedAt,producer:item.producer,artifactHash:item.artifactHash,
      artifactExcerpt:item.artifact.slice(0,2000),artifactTruncated:item.artifact.length>2000}))}};
}

/** Exact selected-Work binding is rechecked at execution. Tool discovery and
 * model-supplied arguments cannot supply owner, Agent or Work authority. */
export default defineDynamic({
  events: {
    "step.started": async (_event, ctx) => {
      const current=ctx.session.auth.current;
      const workId=current?.attributes.myeveEngineeringWorkId;
      if (process.env.MYEVE_ENGINEERING_MODE!=="dogfood" ||
          typeof workId!=="string" || !ENGINEERING_WORK_ID_PATTERN.test(workId)) return null;
      return defineTool({
        availableInSubagents:false,
        description:"Native Sofie direct development for the authenticated Work selected in this chat. Inspect a retained draft; admit the owner-resumed Work only when current trusted provider qualification permits it; then open the approved repository snapshot, record a plan, read files, edit only approved source paths, and submit a frozen candidate for separate protected verification. Each write needs the current revision. This tool cannot run authoritative checks, publish, approve, or mark Work Ready. Admission does not change Work control or qualify a provider. Explain current denial reasons if admission is unavailable.",
        inputSchema,
        async execute({ request: input }, toolCtx) {
          const principal=toolCtx.session.auth.current;
          const selected=principal?.attributes.myeveEngineeringWorkId;
          if (!principal || typeof selected!=="string" || selected!==workId ||
              principal.principalType!=="user" || principal.attributes.owner!=="true" ||
              toolCtx.session.parent)
            throw new WorkError("direct_binding","Direct Work requires this owner's selected primary-Agent chat.",403);
          const ownerId=principal.principalId;
          await assertEngineeringKnowledgeWorkBinding(toolCtx,ownerId,selected);
          const runtime=await engineeringRuntime({scopeId:ownerId,scopeKind:"personal",actorId:ownerId});
          const agent=await resolveSessionAgent({ownerId,sessionId:toolCtx.session.id,
            auth:toolCtx.session.auth,primaryFallback:true});
          if (runtime.config.profile.repository!==GOLDEN_QUALIFICATION_REPOSITORY ||
              !agent?.isPrimary || agent.id!==runtime.config.agentId ||
              !await runtime.authorityCurrent())
            throw new WorkError("direct_authority","The approved primary Agent and qualification repository are required.",403);
          const authority = new NativeRouteAuthority(runtime.store);
          const service=new DirectDevelopmentStore(runtime.store,{
            profile:runtime.config.profile,approvedBase:runtime.config.approvedBase,
            objective:runtime.config.objective,criteria:runtime.config.criteria,
            agentId:runtime.config.agentId,issueNumber:1,assertCurrentAuthority:id=>authority.assertEffect(id),
          });
          if (input.operation==="inspect") {
            const inspected=await service.inspect(selected);
            const truth=await new EngineeringWorkerProjectionStore(runtime.store,agent.id).get(selected);
            const facts=await new EngineeringKnowledgeStore(runtime.store).list(selected,{status:"active",limit:5});
            return {work:truth.work,projection:truth.projection,routing:truth.routing,facts,behavior:nativeBehavior(runtime.config.nativeMode),
              ...summary(inspected.workspace,inspected.current)};
          }
          if (principal.attributes.myeveEngineeringIntent!=="continue")
            throw new WorkError("direct_read_only","This conversation is read-only. The owner must select productive continuation; existing admission and writer checks still apply.",403);
          if (input.operation==="admit") {
            const work=await runtime.store.get(selected);
            if(work.version!==input.expectedWorkVersion || work.generation!==input.expectedWorkGeneration)
              throw new WorkError("routing_changed","Reload the current Work before admission.");
            if((await new RoutingStore(runtime.store).snapshot(selected)).decision?.status==="ADMITTED") {
              await authority.assertEffect(selected);
              await new NativeModelBudget(runtime.store,authority).assertSession(selected,toolCtx.session.id);
              const {projection}=await new EngineeringWorkerProjectionStore(runtime.store,agent.id,id=>authority.assertEffect(id)).get(selected);
              if(projection.workVersion!==input.expectedWorkVersion || projection.workGeneration!==input.expectedWorkGeneration)
                throw new WorkError("routing_changed","Work changed while admission was observed.");
              return nativeAdmissionTransition(projection,true);
            }
          }
          if (input.operation==="read") {
            await authority.assertEffect(selected);
            return service.read(selected,input.path);
          }
          if (input.operation!=="admit") await new NativeModelBudget(runtime.store,authority).assertSession(selected,toolCtx.session.id);
          const action = await toolActionRequest(toolCtx, {
            capabilityId: "tool.engineering_direct", actionClass: "write", parameters: {workId:selected,...input},
          });
          const gateway = new ActionGateway(undefined, {
            async evaluate(request,target,routineAuthority) {
              const local = await localAuthorityProvider.evaluate(request,target,routineAuthority);
              if (local.decision!=="ALLOW") return local;
              try {
                if (input.operation==="admit") {
                  const assessment=await authority.assess(selected);
                  if (!assessment.decision.admitted) throw new Error(assessment.decision.reasons.join(" "));
                } else await authority.assertEffect(selected);
                return local;
              } catch {
                return {decision:"DENY",reason:"Current Work, provider qualification or execution authority is unavailable.",source:"native-work"};
              }
            },
          }, undefined, ()=>process.env.MYEVE_ENGINEERING_MODE==="dogfood" && process.env.VERCEL_ENV!=="production");
          return gateway.execute(action, {
            async resolveTarget() { return {provider:"myeve-native-sofie",account:ownerId,resource:`engineering-work:${selected}`,environment:"isolated-dogfood"}; },
            async execute(parameters,handle) {
              await consumeActionAuthority(handle,parameters,action.capabilityId);
              await consumeProviderAuthority(handle,parameters,action.capabilityId);
              if (input.operation==="admit") {
                const receipt=await admitNativeWork(runtime.store,selected,input.expectedWorkVersion,input.expectedWorkGeneration,authority,toolCtx.session.id);
                const {projection}=await new EngineeringWorkerProjectionStore(runtime.store,agent.id,id=>authority.assertEffect(id)).get(selected);
                return {...receipt,...nativeAdmissionTransition(projection)};
              }
              await authority.assertEffect(selected);
              if (input.operation==="open") {
                await service.requireAdmission(selected);
                const observed=await runtime.github.snapshot(runtime.config.approvedBase.sha);
                await authority.assertEffect(selected);
                return summary(await service.open(selected,observed),true);
              }
              if (input.operation==="plan") return summary(await service.plan(selected,input.expectedRevision,input.plan),true);
              if (input.operation==="write") return summary(await service.write(selected,input.expectedRevision,input.path,input.content),true);
              const result=await service.submit(selected,input.expectedRevision);
              return {candidate:{sha:result.candidate.sha,changedPaths:result.candidate.changedPaths,
                artifactHash:result.candidate.artifactHash},...summary(result.workspace,true),
                next:"A separate protected verifier must check this frozen candidate. No publication or Ready state is implied."};
            },
            receipt(result) { return {...result}; },
            async verify(result) { return {verified:true,receipt:{...result}}; },
          });
        },
      });
    },
  },
});
