import {createHash} from 'node:crypto';
import type {gateway} from 'ai';
import {cloudRuntimeConfiguration} from './cloud-runtime-guard.ts';
import {engineeringConfig} from './runtime.ts';
import {getAgent} from '../agents.ts';
import {WorkStore} from './store.ts';
type Model=ReturnType<typeof gateway>;
type Options=Parameters<Model['doGenerate']>[0];
type Result=Awaited<ReturnType<Model['doGenerate']>>;
type Part=Awaited<ReturnType<Model['doStream']>>['stream'] extends ReadableStream<infer P>?P:never;
export interface CloudConversationIdentity {ownerId:string;agentId:string;sessionId:string;stepKey:string;workId?:string;productive:boolean}
const usage={inputTokens:{total:0,noCache:0,cacheRead:0,cacheWrite:0},outputTokens:{total:0,text:0,reasoning:0}};
const uuid=(value:string)=>{const h=createHash('sha256').update(value).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;};
/** A fixed model corpus behind Eve's real model boundary. Outputs are ordinary
 * proposals executed by the existing authenticated tools, never browser events
 * or admission grants. There is deliberately no network/model fallback. */
export function cloudFixtureResponse(options:Options,identity:CloudConversationIdentity,
 config:{objective:string;criteria:unknown;repository:string},work?:{id:string;version:number;generation:number;control:string;lifecycle:string}):Result{
 const step=Number(identity.stepKey.split(':').at(-1));
 if(!/^.+:\d+$/.test(identity.stepKey)||!Number.isSafeInteger(step)||step<0||step>=8||JSON.stringify(options.prompt).length>200000)throw Error('CLOUD_CONVERSATION_BOUND');
 options.abortSignal?.throwIfAborted();
 const lastUser=options.prompt.findLast(m=>m.role==='user');
 const text=lastUser?.role==='user'?lastUser.content.map(p=>p.type==='text'?p.text:'').join(' '):'';
 const afterTool=options.prompt.at(-1)?.role==='tool';
 let proposal:{toolName:string;input:unknown}|undefined;
 let reply='This staging conversation supports only the bounded project-slug qualification Work.';
 if(afterTool)reply='The saved Work response is shown above. Open Work to review its current state, Result and Proof. Execution and publication still require their own authority.';
 else if(identity.workId){
  if(!work||work.id!==identity.workId)throw Error('CLOUD_CONVERSATION_WORK');
  if(identity.productive&&/\b(continue|start|implement|fix|proceed)\b/i.test(text)){
   if(work.lifecycle==='active'&&work.control==='agent')proposal={toolName:'engineering_factory',input:{operation:'start',expectedWorkVersion:work.version,expectedWorkGeneration:work.generation}};
   else reply='This Work is paused or under owner control. Use Give Back in Work before asking me to continue.';
  }else proposal={toolName:'engineering_work',input:{operation:'get',workId:work.id}};
 }else if(/\b(project[- ]slug|slug)\b/i.test(text)&&/\b(fix|implement|create|make|prepare)\b/i.test(text)){
  proposal={toolName:'engineering_work',input:{operation:'create',create:{title:'Implement project slug validation',objective:config.objective,repository:config.repository,criteria:config.criteria,maxCostUsd:1,maxDurationSeconds:180,idempotencyKey:uuid(identity.sessionId+':'+identity.stepKey)}}};
 }
 if(proposal&&!options.tools?.some(t=>t.type==='function'&&t.name===proposal.toolName))throw Error('CLOUD_CONVERSATION_TOOL_UNAVAILABLE');
 return {content:proposal?[{type:'tool-call',toolCallId:'cloud-'+uuid(identity.sessionId+':'+identity.stepKey),toolName:proposal.toolName,input:JSON.stringify(proposal.input)}]:[{type:'text',text:reply}],
  finishReason:{unified:proposal?'tool-calls':'stop',raw:proposal?'tool_calls':'stop'},usage,warnings:[],providerMetadata:{cloudQualification:{kind:'DETERMINISTIC',paidModelOperations:0}}};
}
export function cloudConversationModel(identity:CloudConversationIdentity):Model{
 async function generate(options:Options):Promise<Result>{
  cloudRuntimeConfiguration();
  const config=await engineeringConfig();
  if(identity.ownerId!==config.ownerId||identity.agentId!==config.agentId)throw Error('CLOUD_CONVERSATION_SCOPE');
  const agent=await getAgent(identity.ownerId,identity.agentId);
  if(!agent?.isPrimary||agent.status!=='active')throw Error('CLOUD_CONVERSATION_AGENT');
  const store=new WorkStore({scopeId:identity.ownerId,scopeKind:'personal',actorId:identity.ownerId});
  const work=identity.workId?await store.get(identity.workId):undefined;
  return cloudFixtureResponse(options,identity,{objective:config.objective,criteria:config.criteria,repository:config.profile.repository},work);
 }
 return {specificationVersion:'v4',provider:'myeve-cloud-deterministic',modelId:'cloud-work-corpus-v1',supportedUrls:{},doGenerate:generate,
  async doStream(options){const result=await generate(options);return {stream:new ReadableStream<Part>({start(c){
   c.enqueue({type:'stream-start',warnings:[]});
   for(const item of result.content)if(item.type==='text'){c.enqueue({type:'text-start',id:'text'});c.enqueue({type:'text-delta',id:'text',delta:item.text});c.enqueue({type:'text-end',id:'text'});}else if(item.type==='tool-call')c.enqueue(item);
   c.enqueue({type:'finish',usage:result.usage,finishReason:result.finishReason,providerMetadata:result.providerMetadata});c.close();
  }})};}};
}
