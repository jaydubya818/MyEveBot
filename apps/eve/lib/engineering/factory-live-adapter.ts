import {factorySpendSchema,factorySpendContractSchema,factorySpendReviewSchema,factorySpendSummary,isWorkSpend,validateSpendBinding,type FactorySpend,type FactorySpendSummary} from './factory-spend.ts';
import {z} from 'zod';
import {boundedJson} from '../relay/client.ts';
import {canonical,digest,type ExecutionSnapshot,type ResultKey} from './factory-producer-protocol.ts';
import {readFactoryAttempt} from './factory-result-channel.ts';
import type {FactoryExecutionIdentity,FactoryExecutionTransport,FactoryQuiescence} from './factory-writer.ts';
import type {FactoryBinding} from './factory-receipt-store.ts';

const states=['PREPARING','PREPARED','DISPATCHING','RUNNING','UNKNOWN','STOPPING','COMPLETED','FAILED','CANCELLED','NOT_DISPATCHED'] as const;
const readbackSchema=z.object({requestId:z.string().uuid(),workOrderId:z.string().uuid(),runId:z.string().uuid().nullable(),snapshot:z.record(z.string(),z.unknown()).nullable(),identity:z.record(z.string(),z.unknown()).nullable(),state:z.enum(states),quiescent:z.boolean(),evidenceRef:z.string().nullable(),spend:factorySpendSchema,blocker:z.string().nullable()}).strict();
const hash=z.string().regex(/^[a-f0-9]{64}$/);
export const factoryConnectionSchema=z.object({spendContract:factorySpendContractSchema.optional(),origin:z.string().url(),token:z.string().regex(/^[a-f0-9]{64}$/),factoryId:z.string().min(1),
 sourceDigest:hash,configurationDigest:hash,factoryVersion:hash,repositoryPath:z.string().startsWith('/'),
 keys:z.array(z.object({factoryId:z.string(),keyId:z.string(),publicKey:z.string(),activeFrom:z.string(),notAfter:z.string(),retiredAt:z.string().optional(),revokedAt:z.string().optional()}).strict()).min(1),
 qualification:z.object({scopeId:z.string(),profileHash:hash,evidenceRef:z.string().min(1),qualifiedAt:z.string().datetime(),expiresAt:z.string().datetime(),
 mode:z.enum(['LOCAL_FIXTURE','LOCAL_SPEND_FIXTURE','LIVE']),spendEnforced:z.boolean(),spendReview:factorySpendReviewSchema.optional()}).strict()}).strict();
export type FactoryConnection=z.infer<typeof factoryConnectionSchema>;
export interface FactoryPrepareRequest {requestId:string;workId:string;workGeneration:number;repository:string;deadline:string;maxSpendUsd:number;input:{title:string;description:string;kind:'feature';repositoryPath:string;baseRef:string;acceptanceCriteria:string[];reproductionCommand:null;expectedFailureText:null;checkCommands:string[];allowedPaths:string[];workerProfile:'mac'}}
export interface FactoryReadback {requestId:string;workOrderId:string;runId:string|null;snapshot:ExecutionSnapshot|null;identity:FactoryExecutionIdentity|null;state:string;quiescent:boolean;evidenceRef:string|null;spend:FactorySpend;accounting:FactorySpendSummary;blocker:string|null}
/** Extends the existing authenticated loopback producer channel. Configuration
 * pins come from reviewed server configuration, never a result or model reply. */
export class LiveFactoryAdapter implements FactoryExecutionTransport {
 readonly config:FactoryConnection;
 private readonly fetcher:typeof fetch;
 constructor(config:FactoryConnection,fetcher:typeof fetch=fetch){
  this.config=factoryConnectionSchema.parse(config);this.fetcher=fetcher;
  const u=new URL(config.origin);
  if(u.protocol!=='http:'||u.hostname!=='127.0.0.1'||u.pathname!=='/'||u.search||u.hash||u.username||u.password||
   digest({sourceDigest:config.sourceDigest,configurationDigest:config.configurationDigest})!==config.factoryVersion)
   throw Error('Exact configured loopback producer and FactoryVersion are required');
 }
 private async request(path:string,body?:unknown):Promise<FactoryReadback>{
  const response=await this.fetcher(new URL('/api/connect/v1/dispatches'+path,this.config.origin),{method:body?'POST':'GET',redirect:'error',signal:AbortSignal.timeout(15000),
   headers:{authorization:'Bearer '+this.config.token,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  if(!response.ok)throw Error('Factory control unavailable ('+response.status+'); reconcile the same request');
  const data=readbackSchema.parse(await boundedJson(response,128000)) as unknown as FactoryReadback;
  if(isWorkSpend(data.spend)){
   if(this.config.spendContract?.version!=='WORK_LEDGER_V1'||this.config.spendContract.sourceDigest!==this.config.sourceDigest)throw Error('Unreviewed Factory spend contract');
  }else if(this.config.qualification.mode!=='LOCAL_FIXTURE')throw Error('Paid Factory requires complete Work ledger accounting');
  return {...data,accounting:factorySpendSummary(data.spend,this.config)};
 }
 async healthy(){
  try{const response=await this.fetcher(new URL('/api/connect/v1/actions',this.config.origin),{headers:{authorization:'Bearer '+this.config.token},redirect:'error',signal:AbortSignal.timeout(5000)});
   if(!response.ok)return false;const data=await boundedJson(response,32000) as {controls?:string[];execution?:{mode:string;spendEnforced:boolean}};return data.execution?.mode===this.config.qualification.mode&&data.execution.spendEnforced===true&& ['factory.prepare','factory.dispatch','factory.observe','factory.stop'].every(action=>data.controls?.includes(action));
  }catch{return false;}
 }
 async prepare(request:FactoryPrepareRequest){const data=await this.request('',request);return this.validatePreparation(request,data);}
 async prepared(request:FactoryPrepareRequest){const data=await this.request('/'+encodeURIComponent(request.requestId));return this.validatePreparation(request,data);}
 private validatePreparation(request:FactoryPrepareRequest,data:FactoryReadback){
  if(data.requestId!==request.requestId)throw Error('Factory preparation request mismatch');
  validateSpendBinding(data.spend,{...request,workOrderId:data.workOrderId,factoryVersion:this.config.factoryVersion,remoteRunId:data.runId??undefined},request.maxSpendUsd);
  const s=data.snapshot;if(!s){if(data.state!=='PREPARING')throw Error('Prepared execution snapshot missing');return data;}
  if(s.factoryId!==this.config.factoryId||s.factoryVersion!==this.config.factoryVersion||s.sourceDigest!==this.config.sourceDigest||s.configurationDigest!==this.config.configurationDigest||
   s.requestId!==request.requestId||s.workOrderId!==data.workOrderId||s.runId!==data.runId||s.inputCommit!==request.input.baseRef||s.attemptNumber!==1||
   canonical(s.configuration.allowedPaths)!==canonical(request.input.allowedPaths)||canonical(s.configuration.commands)!==canonical(request.input.checkCommands)||
   digest(s.configuration)!==s.configurationDigest||
   (this.config.qualification.spendReview&&s.configuration.model!==this.config.qualification.spendReview.pricing.model))throw Error('Prepared Factory execution differs from qualified request/version');
  return data;
 }
 private identity(identity:FactoryExecutionIdentity,data:FactoryReadback){
  if(data.requestId!==identity.requestId||data.workOrderId!==identity.workOrderId||data.runId!==identity.remoteRunId||
   !data.identity||canonical(data.identity)!==canonical(identity))throw Error('Factory readback does not bind this exact writer');
  validateSpendBinding(data.spend,identity);
  const price=this.config.qualification.spendReview?.pricing;
  if(isWorkSpend(data.spend)&&price&&data.spend.operations.some(op=>op.workGeneration===identity.workGeneration&&(op.model!==price.model||op.pricingRevision!==price.revision)))throw Error('Factory spend pricing identity differs from reviewed attempt');
  return data;
 }
 async dispatch(identity:FactoryExecutionIdentity){this.identity(identity,await this.request('/'+identity.requestId+'/dispatch',identity));}
 async stop(identity:FactoryExecutionIdentity){this.identity(identity,await this.request('/'+identity.requestId+'/stop',identity));}
 async read(identity:FactoryExecutionIdentity){return this.identity(identity,await this.request('/'+identity.requestId));}
 async observe(identity:FactoryExecutionIdentity):Promise<FactoryQuiescence|null>{
  const data=await this.read(identity);
  if(!data.quiescent)return null;
  if(!['COMPLETED','FAILED','CANCELLED','NOT_DISPATCHED'].includes(data.state)||!data.evidenceRef)throw Error('Incomplete terminal Factory resource proof');
  return {...identity,state:data.state as FactoryQuiescence['state'],quiescent:true,evidenceRef:data.evidenceRef};
 }
 async result(binding:FactoryBinding){return readFactoryAttempt(this.config,binding,this.fetcher);}
 async keys():Promise<ResultKey[]>{return this.config.keys;}
}
