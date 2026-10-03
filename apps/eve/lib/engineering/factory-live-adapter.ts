import {cloudCustodyProjection} from './factory-cloud-custody.ts';
import {factoryTransport} from './factory-transport.ts';
import {factoryRequestHeaders} from './factory-request-headers.ts';
import {factorySpendSchema,factorySpendContractSchema,factorySpendReviewSchema,factorySpendPlanSchema,isWorkSpendV2,factorySpendSummary,isWorkSpend,validateSpendBinding,type FactorySpendPlan,type FactorySpend,type FactorySpendSummary} from './factory-spend.ts';
import {z} from 'zod';
import {boundedJson} from '../relay/client.ts';
import {canonical,digest,type ExecutionSnapshot,type ResultKey} from './factory-producer-protocol.ts';
import {readFactoryAttempt} from './factory-result-channel.ts';
import type {FactoryExecutionIdentity,FactoryExecutionTransport,FactoryQuiescence} from './factory-writer.ts';
import type {FactoryBinding} from './factory-receipt-store.ts';

const states=['PREPARING','PREPARED','DISPATCHING','RUNNING','UNKNOWN','STOPPING','COMPLETED','FAILED','CANCELLED','NOT_DISPATCHED'] as const;
const readbackSchema=z.object({requestId:z.string().uuid(),workOrderId:z.string().uuid(),runId:z.string().uuid().nullable(),snapshot:z.record(z.string(),z.unknown()).nullable(),identity:z.record(z.string(),z.unknown()).nullable(),state:z.enum(states),quiescent:z.boolean(),evidenceRef:z.string().nullable(),spend:factorySpendSchema,blocker:z.string().nullable()}).strict();
const hash=z.string().regex(/^[a-f0-9]{64}$/);
const localFactoryConnectionSchema=z.object({
 evidence:z.object({ownerScope:z.string().min(1),token:z.string().regex(/^[a-f0-9]{64}$/),expiresAt:z.string().datetime()}).strict().optional(),
 repairBinding:z.object({workId:z.uuid(),workVersion:z.number().int().positive(),workGeneration:z.number().int().positive(),workOrderId:z.uuid()}).strict().optional(),
 spendPlan:factorySpendPlanSchema.optional(),spendContract:factorySpendContractSchema.optional(),origin:z.string().url(),token:z.string().regex(/^[a-f0-9]{64}$/),factoryId:z.string().min(1),
 sourceDigest:hash,configurationDigest:hash,factoryVersion:hash,repositoryPath:z.string().startsWith('/'),
 keys:z.array(z.object({factoryId:z.string(),keyId:z.string(),publicKey:z.string(),activeFrom:z.string(),notAfter:z.string(),retiredAt:z.string().optional(),revokedAt:z.string().optional()}).strict()).min(1),
 qualification:z.object({scopeId:z.string(),profileHash:hash,evidenceRef:z.string().min(1),qualifiedAt:z.string().datetime(),expiresAt:z.string().datetime(),
 mode:z.enum(['LOCAL_FIXTURE','LOCAL_SPEND_FIXTURE','LIVE']),spendEnforced:z.boolean(),spendReview:factorySpendReviewSchema.optional()}).strict()}).strict();
export const cloudFactoryConnectionSchema=localFactoryConnectionSchema.omit({repositoryPath:true,qualification:true}).extend({
 repairBinding:z.never().optional(),
 transport:z.literal('CLOUD'),protocol:z.literal('MYFACTORY_EXECUTION_V2'),projectId:z.literal('prj_IRXTY6HOzS2q9wRPdabsJnmddzl4'),
 source:z.object({repository:z.string().regex(/^[-\w.]+\/[-\w.]+$/),commit:z.string().regex(/^[a-f0-9]{40}$/),tree:z.string().regex(/^[a-f0-9]{40}$/)}).strict(),
 qualification:localFactoryConnectionSchema.shape.qualification.extend({mode:z.literal('CLOUD_DETERMINISTIC')}),
}).strict();
export const factoryConnectionSchema=z.union([localFactoryConnectionSchema,cloudFactoryConnectionSchema]);
export type FactoryConnection=z.infer<typeof factoryConnectionSchema>;
export interface FactoryPrepareRequest {repairWorkOrderId?:string;spendContract?:FactorySpendPlan;requestId:string;workId:string;workGeneration:number;repository:string;deadline:string;maxSpendUsd:number;input:{title:string;description:string;kind:'feature';repositoryPath?:string;baseRef:string;acceptanceCriteria:string[];reproductionCommand:null;expectedFailureText:null;checkCommands:string[];allowedPaths:string[];workerProfile:'mac'|'container'}}
export interface FactoryReadback {requestId:string;workOrderId:string;runId:string|null;snapshot:ExecutionSnapshot|null;identity:FactoryExecutionIdentity|null;state:string;quiescent:boolean;evidenceRef:string|null;spend:FactorySpend;accounting:FactorySpendSummary;blocker:string|null}
/** Host configuration only: findings and client requests cannot select a repair Work. */
export function repairWorkOrderFor(config:FactoryConnection,work:{id:string;version:number;generation:number}) {
 const binding=config.repairBinding;if(!binding)return undefined;
 if(binding.workId!==work.id||binding.workVersion!==work.version||binding.workGeneration!==work.generation)
  throw Error('Repair binding differs from the exact current Work revision/generation');
 return binding.workOrderId;
}
/** Extends the existing authenticated loopback producer channel. Configuration
 * pins come from reviewed server configuration, never a result or model reply. */
export class LiveFactoryAdapter implements FactoryExecutionTransport {
 readonly config:FactoryConnection;
 private readonly fetcher:typeof fetch;
 private readonly transport:ReturnType<typeof factoryTransport>;
 constructor(config:FactoryConnection,fetcher:typeof fetch=fetch){
  this.config=factoryConnectionSchema.parse(config);this.fetcher=fetcher;
  this.transport=factoryTransport(this.config);
  if(digest({sourceDigest:config.sourceDigest,configurationDigest:config.configurationDigest})!==config.factoryVersion)
   throw Error('Exact configured loopback producer and FactoryVersion are required');
 }
 private async request(path:string,body?:unknown):Promise<FactoryReadback>{
  const response=await this.fetcher(new URL(this.transport.prefix+'/dispatches'+path,this.transport.origin),{method:body?'POST':'GET',redirect:'error',signal:AbortSignal.timeout(15000),
   headers:{...await factoryRequestHeaders(this.config),'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  if(!response.ok)throw Error('Factory control unavailable ('+response.status+'); reconcile the same request');
  const data=readbackSchema.parse(await boundedJson(response,128000)) as unknown as FactoryReadback;
  if(isWorkSpend(data.spend)){
   if(this.config.spendContract?.version!==(isWorkSpendV2(data.spend)?'WORK_LEDGER_V2':'WORK_LEDGER_V1')||this.config.spendContract.sourceDigest!==this.config.sourceDigest)throw Error('Unreviewed Factory spend contract');
  }else if(this.config.qualification.mode!=='LOCAL_FIXTURE')throw Error('Paid Factory requires complete Work ledger accounting');
  return {...data,accounting:factorySpendSummary(data.spend,this.config)};
 }
 async healthy(){
  try{const response=await this.fetcher(new URL(this.transport.prefix+'/actions',this.transport.origin),{headers:await factoryRequestHeaders(this.config),redirect:'error',signal:AbortSignal.timeout(5000)});
   if(!response.ok)return false;const data=await boundedJson(response,32000) as {controls?:string[];execution?:{mode:string;spendEnforced:boolean}};return data.execution?.mode===this.config.qualification.mode&&data.execution.spendEnforced===true&& ['factory.prepare','factory.dispatch','factory.observe','factory.stop'].every(action=>data.controls?.includes(action));
  }catch{return false;}
 }
 private repairRequest(request:FactoryPrepareRequest){
  const binding=this.config.repairBinding;
  if(request.repairWorkOrderId!==binding?.workOrderId||(binding&&(request.workId!==binding.workId||request.workGeneration!==binding.workGeneration)))throw Error('Repair preparation differs from reviewed host binding');
 }
 async prepare(request:FactoryPrepareRequest){
  this.repairRequest(request);
  let body:unknown=request;
  if('transport' in this.config){
   const source=this.config.source;
   if(request.repository!==source.repository||request.input.baseRef!==source.commit||request.input.repositoryPath!==undefined||request.input.workerProfile!=='container')throw Error('Cloud preparation requires exact source and no local filesystem');
   const {title,description,kind,acceptanceCriteria,checkCommands,allowedPaths}=request.input;
   body={protocol:this.config.protocol,requestId:request.requestId,workId:request.workId,workGeneration:request.workGeneration,repository:request.repository,deadline:request.deadline,maxSpendUsd:request.maxSpendUsd,source,input:{title,description,kind,acceptanceCriteria,checkCommands,allowedPaths}};
  }else if(!request.input.repositoryPath?.startsWith('/')||request.input.workerProfile!=='mac')throw Error('Local preparation requires the qualified local profile');
  const data=await this.request('',body);return this.validatePreparation(request,data);
 }
 async prepared(request:FactoryPrepareRequest){this.repairRequest(request);const data=await this.request('/'+encodeURIComponent(request.requestId));return this.validatePreparation(request,data);}
 private validatePreparation(request:FactoryPrepareRequest,data:FactoryReadback){
  if(request.repairWorkOrderId&&data.workOrderId!==request.repairWorkOrderId)throw Error('Factory returned a different repair WorkOrder');
  if(data.requestId!==request.requestId)throw Error('Factory preparation request mismatch');
  if(canonical(request.spendContract??null)!==canonical(this.config.spendPlan??null))throw Error('Factory preparation plan differs from reviewed configuration');
  validateSpendBinding(data.spend,{...request,workOrderId:data.workOrderId,factoryVersion:this.config.factoryVersion,remoteRunId:data.runId??undefined},request.maxSpendUsd,request.spendContract);
  const s=data.snapshot;if(!s){if(data.state!=='PREPARING')throw Error('Prepared execution snapshot missing');return data;}
  if('source' in this.config&&(s.version!==2||s.inputTree!==this.config.source.tree||s.configuration.workerProfile!=='container'||!s.configuration.cloud||s.configuration.cloud.evidenceClass!=='DETERMINISTIC'))throw Error('Cloud snapshot source/runtime/evidence mismatch');
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
  validateSpendBinding(data.spend,identity,undefined,this.config.spendPlan);
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
 async custody(identity:FactoryExecutionIdentity){
  const config=this.config;
  if(!('source' in config)||identity.factoryId!==config.factoryId||identity.factoryVersion!==config.factoryVersion||identity.repository!==config.source.repository||identity.baseSha!==config.source.commit||!z.string().uuid().safeParse(identity.requestId).success)throw Error('Cloud custody requires the admitted Factory identity');
  const response=await this.fetcher(new URL(this.transport.prefix+'/dispatches/'+identity.requestId+'/custody',this.transport.origin),{headers:await factoryRequestHeaders(this.config),redirect:'error',signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error('Cloud custody unavailable; reconcile the same candidate');
  return cloudCustodyProjection(await boundedJson(response,1100000),config.source);
 }
 async keys():Promise<ResultKey[]>{return this.config.keys;}
}
