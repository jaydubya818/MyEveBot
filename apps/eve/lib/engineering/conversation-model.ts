import { gateway } from "ai";
import { z } from "zod";
import { EngineeringConversationBudget } from "./conversation-budget.ts";
import { NativeRouteAuthority } from "./native-routing.ts";
import { RoutingStore } from "./routing-store.ts";
import { nativeBudgetedModel, nativeModelOptions, nativeToolInput } from "./native-model.ts";
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

/** Outer total includes each provider call once. Native ledger remains an
 * independently enforced execution subtotal, never added to this total. */
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
    const scoped=conversationOptions(options,config.profile.maxOutputTokens,phase);
    if(options.abortSignal?.aborted)throw new Error("Conversation cancelled before reservation.");
    const catalog=await Promise.race([(dependencies.catalog??gateway.getAvailableModels)(),new Promise<never>((_,reject)=>{
      const timer=setTimeout(()=>reject(new Error("Model pricing unavailable.")),5000);timer.unref();
    })]);
    const pricing=catalog.models.find(model=>model.id===input.modelId)?.pricing;
    const rates=pricing?[pricing.input,pricing.output,pricing.cachedInputTokens??pricing.input,pricing.cacheCreationInputTokens??pricing.input].map(Number):[];
    if(rates.length!==4 || rates.some(rate=>!Number.isFinite(rate)||rate<=0))throw new Error("Current model pricing is required.");
    const inputBound=Buffer.byteLength(JSON.stringify({prompt:scoped.prompt,tools:scoped.tools}))+4096;
    const microUsd=Math.ceil(2*(inputBound*Math.max(rates[0],rates[2],rates[3])+config.profile.maxOutputTokens*rates[1])*1_000_000);
    const reservation={...input,microUsd,maxCalls:config.profile.maxModelRequests,requestHash:digest({phase,modelId:input.modelId,prompt:scoped.prompt,tools:scoped.tools,maxOutputTokens:scoped.maxOutputTokens})};
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
      const valid=validConversationResponse(content,phase);
      const clean={content:valid?content:[],usage:response.usage,finishReason:response.finishReason,warnings:response.warnings,providerMetadata:response.providerMetadata};
      await budget.settle(reservation,Math.ceil(cost*1_000_000),clean);
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
