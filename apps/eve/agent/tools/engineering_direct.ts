import { defineDynamic, defineTool } from "eve/tools";
import { z } from "zod";
import { GOLDEN_QUALIFICATION_REPOSITORY } from "../../lib/engineering/base-preflight.ts";
import { DirectDevelopmentStore, type DirectWorkspace } from "../../lib/engineering/direct-development.ts";
import { pathSchema } from "../../lib/engineering/contract.ts";
import { engineeringRuntime } from "../../lib/engineering/runtime.ts";
import { WorkError } from "../../lib/engineering/types.ts";
import { assertEngineeringKnowledgeWorkBinding } from "../lib/engineering-knowledge-binding.ts";
import { ENGINEERING_WORK_ID_PATTERN } from "../lib/engineering-work-binding.ts";
import { resolveSessionAgent } from "../lib/session-settings.ts";

const inputSchema = z.discriminatedUnion("operation", [
  z.object({operation:z.literal("inspect")}).strict(),
  z.object({operation:z.literal("read"),path:z.string().min(1).max(240)}).strict(),
  z.object({operation:z.literal("open")}).strict(),
  z.object({operation:z.literal("plan"),expectedRevision:z.number().int().positive(),plan:z.string().trim().min(1).max(8000)}).strict(),
  z.object({operation:z.literal("write"),expectedRevision:z.number().int().positive(),path:pathSchema,
    content:z.string().max(100_000)}).strict(),
  z.object({operation:z.literal("submit"),expectedRevision:z.number().int().positive()}).strict(),
]);

function summary(value: DirectWorkspace | null, current: boolean) {
  if (!value) return {workspace:null,current:false};
  return {current,workspace:{workId:value.workId,revision:value.revision,phase:value.phase,
    baseSha:value.baseSha,deadline:value.deadline,plan:value.plan,
    files:Object.keys(value.draftFiles).sort(),
    changedPaths:Object.keys(value.draftFiles).filter(path=>value.draftFiles[path]!==value.sourceFiles[path]).sort(),
    candidates:value.candidates.map(candidate=>({sha:candidate.sha,changedPaths:candidate.changedPaths,
      artifactHash:candidate.artifactHash,createdAt:candidate.createdAt})),
    evidence:value.evidence.map(item=>({candidate:item.candidate,check:item.check,result:item.result,
      observedAt:item.observedAt,producer:item.producer,artifactHash:item.artifactHash}))}};
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
        description:"Native Sofie direct development for the authenticated Work selected in this chat. Inspect a retained draft; after an independently admitted DEEP_AGENT route, open the approved repository snapshot, record a plan, read files, edit only approved source paths, and submit a frozen candidate for separate protected verification. Each write needs the current revision. This tool cannot run authoritative checks, publish, approve, or mark Work Ready. If no DEEP_AGENT route is admitted, explain that execution is not yet available.",
        inputSchema,
        async execute(input, toolCtx) {
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
          const service=new DirectDevelopmentStore(runtime.store,{
            profile:runtime.config.profile,approvedBase:runtime.config.approvedBase,
            objective:runtime.config.objective,criteria:runtime.config.criteria,
            agentId:runtime.config.agentId,issueNumber:1,
          });
          if (input.operation==="inspect") {
            const inspected=await service.inspect(selected);
            return {work:{id:inspected.work.id,version:inspected.work.version,
              control:inspected.work.control,lifecycle:inspected.work.lifecycle},
              ...summary(inspected.workspace,inspected.current)};
          }
          if (input.operation==="read") return service.read(selected,input.path);
          if (input.operation==="open") {
            await service.requireAdmission(selected);
            const observed=await runtime.github.snapshot(runtime.config.approvedBase.sha);
            const value=await service.open(selected,observed);
            return summary(value,true);
          }
          if (input.operation==="plan") {
            const value=await service.plan(selected,input.expectedRevision,input.plan);
            return summary(value,true);
          }
          if (input.operation==="write") {
            const value=await service.write(selected,input.expectedRevision,input.path,input.content);
            return summary(value,true);
          }
          const result=await service.submit(selected,input.expectedRevision);
          return {candidate:{sha:result.candidate.sha,changedPaths:result.candidate.changedPaths,
            artifactHash:result.candidate.artifactHash},...summary(result.workspace,true),
            next:"A separate protected verifier must check this frozen candidate. No publication or Ready state is implied."};
        },
      });
    },
  },
});
