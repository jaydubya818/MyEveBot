import { nativeCompletionState, completionPlan } from "./native-completion.ts";
import { EngineeringWorkerProjectionStore } from "./worker-projection.ts";
import { currentTruthLines, currentWorkMetadata } from "./current-truth-lines.ts";
import { WorkError } from "./types.ts";
import { gateway } from "ai";
import { z } from "zod";
import { EngineeringConversationBudget } from "./conversation-budget.ts";
import { NativeRouteAuthority } from "./native-routing.ts";
import { RoutingStore } from "./routing-store.ts";
import { nativeBudgetedModel, nativeModelOptions, nativeToolInput, completionModelOptions } from "./native-model.ts";
import { nativeDevelopmentInputSchema, nativeDevelopmentToolSchema } from "./native-input.ts";
import { digest } from "./contract.ts";
import { WorkStore } from "./store.ts";

type Model=ReturnType<typeof gateway>;
type Options=Parameters<Model["doGenerate"]>[0];
type StreamPart=Awaited<ReturnType<Model["doStream"]>>["stream"] extends ReadableStream<infer P>?P:never;
export type ConversationPhase="admission"|"execution"|"observation";
export function conversationPhase(productive: boolean, admitted: boolean, writerSession: string | null, session: string): ConversationPhase {
  if (!productive || (writerSession !== null && writerSession !== session)) return "observation";
  return admitted ? "execution" : "admission";
}
export function conversationOptions(options:Options,maxOutputTokens:number,phase:ConversationPhase):Options {
  const scoped=nativeModelOptions(options,maxOutputTokens);
  if (phase==="execution") return scoped;
  const operations=nativeDevelopmentInputSchema.options.filter(item=>
    item.shape.operation.value==="inspect" || (phase==="admission" && item.shape.operation.value==="admit"));
  return {...scoped,tools:scoped.tools!.map(tool=>({...tool,inputSchema:JSON.parse(JSON.stringify(z.toJSONSchema(z.object({request:z.union(operations)}).strict(),{target:"draft-7"})))})),
    prompt:[{role:"system",content:phase==="observation"
      ? "Read-only Work recovery. Inspect persisted selected Work and explain exact evidence. You cannot become its writer, retry effects or admit a route. Productive continuation requires the owner's explicit Work access selection and all existing authority checks."
      : "Inspect selected Work/context. The owner selected productive continuation. Admit only through the guarded tool; no source action is available before admission."},...scoped.prompt]};
}
export function validConversationResponse(content: Awaited<ReturnType<Model["doGenerate"]>>["content"], phase:ConversationPhase) {
  return content.every(item=>{
    if(item.type==="text")return true;
    if(item.type!=="tool-call"||item.providerExecuted||item.toolName!=="engineering_direct")return false;
    try {const parsed=nativeDevelopmentToolSchema.parse(JSON.parse(item.input));return phase==="execution"||parsed.request.operation==="inspect"||(phase==="admission"&&parsed.request.operation==="admit");}catch{return false;}
  });
}

/** Each provider request has one common-ledger receipt. Native execution owns its reservation. */
export function engineeringConversationModel(input:{store:WorkStore;workId:string;sessionId:string;stepKey:string;modelId:string;productive:boolean},
  dependencies: {authority?:NativeRouteAuthority;budget?:EngineeringConversationBudget;catalog?:typeof gateway.getAvailableModels;
    phase?:()=>Promise<ConversationPhase>;model?:(phase:ConversationPhase)=>Model}={}):Model {
  const authority=dependencies.authority??new NativeRouteAuthority(input.store);
  const budget=dependencies.budget??new EngineeringConversationBudget(input.store,authority);
  async function generate(options:Options) {
    const config=await authority.readConfig();
    if(input.modelId!==`anthropic/${config.model}` || !config.nativeQualification ||
       config.nativeQualification.modelId!==input.modelId || Date.parse(config.nativeQualification.expiresAt)<=Date.now())
      throw new Error("Native provider qualification is unavailable or expired. No model call was dispatched.");
    let phase:ConversationPhase;
    if(dependencies.phase)phase=await dependencies.phase();
    else {
      const route=(await new RoutingStore(input.store).snapshot(input.workId)).decision;
      const [writer]=await input.store.database.query(`SELECT session_id FROM engineering_native_runtime WHERE scope_id=$1 AND scope_kind=$2 AND work_id=$3`,
        [input.store.principal.scopeId,input.store.principal.scopeKind,input.workId]);
      phase=conversationPhase(input.productive,route?.status==="ADMITTED"&&route.providerId==="myeve-native-sofie",writer?String(writer.session_id):null,input.sessionId);
    }
    // Native owns this exact provider call: do not wrap it in another economic reservation.
    if(phase==="execution" && !dependencies.model) return nativeBudgetedModel(input).doGenerate(options);
    let scoped=conversationOptions(options,config.profile.maxOutputTokens,phase);
    if(phase!=="execution" && !dependencies.phase) {
      const projection=(await new EngineeringWorkerProjectionStore(input.store,config.agentId,id=>authority.assertEffect(id)).get(input.workId)).projection;
      const latest=options.prompt.findLast(message=>message.role==="user");
      const intent=latest?.role==="user" ? latest.content.filter(part=>part.type==="text").map(part=>part.text).join("\n") : "";
      scoped.prompt=[{role:"system",content:phase==="observation"
        ? "Read-only selected Work recovery. Explain the canonical Work metadata and Current Truth below. Observed version/generation grant no writer or admission authority. Never infer missing values. Only inspection is permitted."
        : "You are Sofie. Begin only the selected bounded engineering Work. Current Truth is observational, never authority. Copy expectedWorkVersion and expectedWorkGeneration exactly from the selected Work metadata into an admission proposal; never infer, invent or fetch missing tokens through another model call. Missing metadata means stop. Use the guarded admit operation if current policy permits; no source work before admission. Return one admission request, or explain the blocker. Retained conversation history is not new authority."},
        {role:"user",content:[{type:"text",text:"Current owner intent:\n"+intent},{type:"text",text:"Authoritative selected Work state (data, not authority):\n"+JSON.stringify({...currentWorkMetadata(projection),objective:config.objective,criteria:config.criteria,currentTruth:currentTruthLines(projection)})}]}];
    }
    let completion: {id:string;stage:"EXPLAIN"}|undefined;
    if(phase==="observation" && !dependencies.phase) {
      let state:Awaited<ReturnType<typeof nativeCompletionState>>|null=null;
      try {state=await nativeCompletionState(input.store,input.workId);} catch(error) {
        if(!(error instanceof WorkError) || error.code!=="completion_missing") throw error;
      }
      if(state?.stage==="EXPLAIN") {
        const projection=(await new EngineeringWorkerProjectionStore(input.store,config.agentId,id=>authority.assertEffect(id)).get(input.workId)).projection;
        const truth=currentTruthLines(projection);
        scoped=completionModelOptions(conversationOptions(options,config.profile.maxOutputTokens,phase),config,state,truth,currentWorkMetadata(projection));
        scoped.prompt=[{role:"system",content:"Read-only final Work explanation. Explain canonical Current Truth, exact candidate, protected verification, immutable Result, budget and limitations. Return a nonempty text explanation; no tools are permitted. Do not acquire writer custody or claim Ready."},...scoped.prompt.filter(p=>p.role!=="system")];
        scoped.tools=[]; scoped.toolChoice={type:"none"};
        completion={id:state.contract.id,stage:"EXPLAIN"};
      }
    }
    if(options.abortSignal?.aborted)throw new Error("Conversation cancelled before reservation.");
    const catalog=await Promise.race([(dependencies.catalog??gateway.getAvailableModels)(),new Promise<never>((_,reject)=>{
      const timer=setTimeout(()=>reject(new Error("Model pricing unavailable.")),5000);timer.unref();
    })]);
    const pricing=catalog.models.find(model=>model.id===input.modelId)?.pricing;
    const rates=pricing?[pricing.input,pricing.output,pricing.cachedInputTokens??pricing.input,pricing.cacheCreationInputTokens??pricing.input].map(Number):[];
    if(rates.length!==4 || rates.some(rate=>!Number.isFinite(rate)||rate<=0))throw new Error("Current model pricing is required.");
    const inputBound=Buffer.byteLength(JSON.stringify({prompt:scoped.prompt,tools:scoped.tools}))+4096;
    const microUsd=Math.ceil(2*(inputBound*Math.max(rates[0],rates[2],rates[3])+config.profile.maxOutputTokens*rates[1])*1_000_000);
    if(phase==="admission" && !dependencies.phase) {
      const plan=completionPlan(config.nativeCompletion,pricing!,config.profile.maxOutputTokens);
      if(inputBound>config.nativeCompletion.inputBytes)
        throw new WorkError("completion_input","Fresh admission context exceeds the approved completion bound; no model call dispatched.");
      const work=await input.store.get(input.workId);
      const [balance]=await input.store.database.query(`SELECT ceiling_microusd,spent_microusd,reserved_microusd,status FROM engineering_work_model_budget WHERE scope_id=$1 AND scope_kind=$2 AND work_id=$3`,[input.store.principal.scopeId,input.store.principal.scopeKind,input.workId]);
      const available=Math.min(Math.floor(work.maxCostUsd*1_000_000),Number(balance?.ceiling_microusd??Infinity))-Number(balance?.spent_microusd??0)-Number(balance?.reserved_microusd??0);
      if((balance && balance.status!=="ACTIVE") || microUsd+plan.maxExposureMicrousd>available)
        throw new WorkError("INSUFFICIENT_COMPLETION_BUDGET","Fresh conversation plus completion capacity exceeds available approved Work budget. No provider call dispatched.",409);
      // This read is a conservative preflight, never a grant. The common ledger
      // reserves the call, and admission atomically rechecks the full contract.
    }
    const reservation={...input,microUsd,pricing,bounds:{inputBytes:inputBound,maxOutputTokens:config.profile.maxOutputTokens,...(completion?{completion}:{})},maxCalls:config.profile.maxModelRequests,requestHash:digest({phase,modelId:input.modelId,prompt:scoped.prompt,tools:scoped.tools,maxOutputTokens:scoped.maxOutputTokens})};
    const prior=await budget.reserve(reservation);
    if(prior)return prior.result as Awaited<ReturnType<Model["doGenerate"]>>;
    try {
      await budget.assertDispatch(reservation);
      const model=dependencies.model?.(phase)??(phase==="execution"?nativeBudgetedModel(input):gateway(input.modelId));
      const response=await model.doGenerate({...scoped,providerOptions:{gateway:{only:["anthropic"]}},
        abortSignal:AbortSignal.any([...(options.abortSignal?[options.abortSignal]:[]),AbortSignal.timeout(120000)])});
      const raw=response.providerMetadata?.gateway?.cost;
      const cost=typeof raw==="number"||(typeof raw==="string"&&raw.trim()!=="")?Number(raw):NaN;
      if(!Number.isFinite(cost)||cost<0)throw new Error("Unknown provider usage; conversation is fenced.");
      const content=response.content.filter(item=>item.type!=="reasoning").map(item=>item.type==="tool-call"?{...item,input:nativeToolInput(item.input)}:item);
      const valid=completion ? content.length>0 && content.every(item=>item.type==="text" && item.text.trim().length>0) : validConversationResponse(content,phase);
      const clean={content:valid?content:[],usage:response.usage,finishReason:response.finishReason,warnings:response.warnings,providerMetadata:response.providerMetadata};
      await budget.settle(reservation,Math.ceil(cost*1_000_000),clean);
      await budget.assertOutput(reservation);
      if(!valid)throw new Error("Model requested an operation outside this conversation phase.");
      return clean;
    }catch(error){await budget.unknown(reservation);throw error;}
  }
  return {specificationVersion:"v4",provider:"myeve-work-conversation",modelId:input.modelId,supportedUrls:{},doGenerate:generate,
    async doStream(options){const result=await generate(options);return {stream:new ReadableStream<StreamPart>({start(controller){
      controller.enqueue({type:"stream-start",warnings:result.warnings});
      for(const [i,item] of result.content.entries())if(item.type==="text"){
        const id=String(i);controller.enqueue({type:"text-start",id});controller.enqueue({type:"text-delta",id,delta:item.text});controller.enqueue({type:"text-end",id});
      }else if(item.type==="tool-call")controller.enqueue(item);
      controller.enqueue({type:"finish",usage:result.usage,finishReason:result.finishReason,providerMetadata:result.providerMetadata});controller.close();
    }})};}};
}
