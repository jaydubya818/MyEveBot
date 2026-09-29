import { gateway } from "ai";
import { assembleContext } from "./context-assembly.ts";
import { resolveSessionAgent, type SessionAgentResolutionInput } from "./session-settings.ts";
import { PARTNER_PRIVATE_TOOLS } from "../../lib/private-owner-boundary.ts";
type Model=ReturnType<typeof gateway>;
type Options=Parameters<Model['doGenerate']>[0];
type Result=Awaited<ReturnType<Model['doGenerate']>>;
type Part=Awaited<ReturnType<Model['doStream']>>['stream'] extends ReadableStream<infer P>?P:never;

/** Old deployment prompt fragments and earlier conversations never cross this
 * provider boundary. This turn can use only this owner's canonical context. */
export function partnerPrompt(options:Options,context:string):Options {
 const start=options.prompt.findLastIndex(p=>p.role==='user' && p.content.some(c=>c.type==='text'&&!c.text.startsWith('Client context:\n')));
 if(start<0)throw new Error('A private owner message is required.');
 const conversation=options.prompt.slice(start).filter(p=>p.role!=='system');
 for(const message of conversation){
  if(message.role==='user' && message.content.some(p=>p.type!=='text'))throw new Error('Use Files to review private attachments before asking Sofie.');
  if(message.role==='assistant' && message.content.some(p=>p.type!=='text' && (p.type!=='tool-call'||!PARTNER_PRIVATE_TOOLS.has(p.toolName))))throw new Error('Unscoped assistant context.');
  if(message.role==='tool' && message.content.some(p=>p.type!=='tool-result'||!PARTNER_PRIVATE_TOOLS.has(p.toolName)))throw new Error('Unscoped tool context.');
 }
 return {prompt:[{role:'system',content:'You are Sofie in this owner’s private context. Only owner-bound Memory and Knowledge tools are available. Business sharing requires Our business. Never infer credential authority.\n'+context},...conversation],
  tools:options.tools?.filter(t=>t.type==='function'&&PARTNER_PRIVATE_TOOLS.has(t.name)),toolChoice:{type:'auto'},maxOutputTokens:4096,abortSignal:options.abortSignal,providerOptions:{}};
}
export function partnerPrivateModel(input:SessionAgentResolutionInput):Model {
 async function generate(options:Options):Promise<Result>{
  if(!input.ownerId || input.auth.current?.principalId!==input.ownerId || input.auth.initiator?.principalId!==input.ownerId)throw new Error('Exact private session ownership required.');
  if(input.auth.current.attributes?.myeveEngineeringWorkId || input.auth.initiator.attributes?.myeveEngineeringWorkId)throw new Error('Use Our business for scoped Work context.');
  const agent=await resolveSessionAgent(input);
  if(!agent || agent.ownerId!==input.ownerId)throw new Error('Owner-bound Agent unavailable.');
  const assembled=await assembleContext({ownerId:input.ownerId,agentId:agent.id,sessionId:input.sessionId});
  const result=await gateway(agent.preferredModel??'anthropic/claude-sonnet-5').doGenerate(partnerPrompt(options,assembled.markdown));
  if(result.content.some(p=>!['text','reasoning','tool-call'].includes(p.type) || (p.type==='tool-call'&&(p.providerExecuted||!PARTNER_PRIVATE_TOOLS.has(p.toolName)))))throw new Error('Private model requested an unavailable tool.');
  return {...result,content:result.content.filter(p=>p.type!=='reasoning')};
 }
 return {specificationVersion:'v4',provider:'myeve-private-owner',modelId:'owner-scoped',supportedUrls:{},doGenerate:generate,
  async doStream(options){const result=await generate(options);return {stream:new ReadableStream<Part>({start(controller){
   controller.enqueue({type:'stream-start',warnings:result.warnings});
   for(const [index,p] of result.content.entries()){if(p.type==='text'){const id=String(index);controller.enqueue({type:'text-start',id});controller.enqueue({type:'text-delta',id,delta:p.text});controller.enqueue({type:'text-end',id});}else if(p.type==='tool-call')controller.enqueue(p);}
   controller.enqueue({type:'finish',usage:result.usage,finishReason:result.finishReason});controller.close();
  }})};}};
}
