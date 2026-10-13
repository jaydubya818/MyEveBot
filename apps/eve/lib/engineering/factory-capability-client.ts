import type {MissionControlAdmissionProof} from '../missioncontrol/admit-execution.ts';
import {admissionActionDigest,verifyPolicyMessage,type PolicyKey,type SignedPolicyMessage} from '../../../../packages/capability-enforcement/src/ordering-wire.ts';
import {verifyFactoryPreparationTerminal,type TerminalBinding} from '../../../../packages/capability-enforcement/src/factory-preparation-terminal.ts';
import {boundedJson} from '../relay/client.ts';
import {FactoryPreparationTerminalReceived} from './factory-preparation-terminal.ts';
import {digest} from './factory-producer-protocol.ts';

export type FactoryCapabilityClientConfig={origin:string;binding:Omit<TerminalBinding,'requestId'|'workId'|'generation'|'nativeRequestDigest'>;
  key:PolicyKey;headers:()=>Promise<Record<string,string>>;
  sourcePermit:(challenge:SignedPolicyMessage,request:Record<string,any>,proof:MissionControlAdmissionProof|null)=>Promise<SignedPolicyMessage>;
  relayPermit:(source:SignedPolicyMessage)=>Promise<SignedPolicyMessage>};
/** Host-owned original enrollment only. Network I/O precedes native accounting
 * locks. This client issues no new generation, budget or execution permission. */
export class FactoryCapabilityClient{
 constructor(readonly config:FactoryCapabilityClientConfig,readonly send:typeof fetch=fetch){
  const url=new URL(config.origin);
  if(url.origin!==config.origin||url.username||url.password||url.protocol!=='https:'
    ||!config.binding.missionId||!config.key||typeof config.sourcePermit!=='function'||typeof config.relayPermit!=='function')throw Error('FACTORY_CAPABILITY_CONFIGURATION');
 }
 private async request(path:string,body:unknown){
  const response=await this.send(new URL('/api/capability-admission/'+path,this.config.origin),{method:'POST',redirect:'error',
   signal:AbortSignal.timeout(5000),headers:{...await this.config.headers(),'content-type':'application/json'},body:JSON.stringify(body)});
  if(!response.ok){if(path==='readback'&&response.status===404)return null;throw Error('FACTORY_CAPABILITY_UNAVAILABLE');}
  return boundedJson(response,65536);
 }
 private async terminal(value:unknown,request:Record<string,any>){
  if(value&&typeof value==='object'&&Object.keys(value).sort().join(',')==='keyId,message,signature'){
   const envelope=value as SignedPolicyMessage,receipt=await verifyFactoryPreparationTerminal(envelope,this.config.key,
    {...this.config.binding,requestId:request.requestId,workId:request.workId,generation:request.workGeneration,nativeRequestDigest:digest(request)});
   throw new FactoryPreparationTerminalReceived(receipt,envelope);
  }
  return value;
 }
 async read(request:Record<string,any>){return this.terminal(await this.request('readback',
  {schema:'factory-capability-admission-readback/v1',request,missionId:this.config.binding.missionId}),request);}
 async prepare(request:Record<string,any>,proof:MissionControlAdmissionProof|null=null){
  const retained=await this.read(request);if(retained)return retained;
  if(!proof)throw Error('FACTORY_SOURCE_BINDING');
  const envelope=await this.request('challenge',{schema:'factory-capability-admission-challenge/v1',request,missionId:this.config.binding.missionId}) as SignedPolicyMessage;
  const challenge=await verifyPolicyMessage(envelope,this.config.key),b=this.config.binding;
  const action=await admissionActionDigest({workId:request.workId,missionId:b.missionId,generation:request.workGeneration,
   nativeSnapshot:{factoryId:b.factoryId,factoryVersion:b.factoryVersion,sourceDigest:b.sourceDigest,configurationDigest:b.configurationDigest,
    backendId:b.backendId,incarnation:b.incarnation,enrollmentVersion:b.enrollmentVersion},args:request});
  if(challenge.kind!=='CHALLENGE'||challenge.ownerId!==b.ownerId||challenge.organizationId!==b.organizationId
   ||challenge.installationId!==b.installationId||challenge.backendId!==b.backendId||challenge.incarnation!==b.incarnation
   ||challenge.enrollmentVersion!==b.enrollmentVersion||challenge.agentId!==b.agentId||challenge.capabilityId!=='myfactory'
   ||challenge.workId!==request.workId||challenge.workGeneration!==request.workGeneration||challenge.missionId!==b.missionId
   ||challenge.actionDigest!==action||challenge.budgetMicros!==Math.ceil(request.maxSpendUsd*1e6)
   ||challenge.issuedAt>Date.now()||challenge.expiresAt<=Date.now())throw Error('FACTORY_CAPABILITY_CHALLENGE');
  const myeve=await this.config.sourcePermit(envelope,request,proof),relay=await this.config.relayPermit(myeve);
  return this.terminal(await this.request('prepare',{schema:'factory-capability-admission-prepare/v1',request,missionId:b.missionId,capabilityPermits:{myeve,relay}}),request);
 }
}
