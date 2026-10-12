import {sign,verify,type KeyObject} from 'node:crypto';
import {canonical,digest,validateAlphaTasksPackage,validateRuntime,validateOperation,validateTaskData,
  type AlphaTasksPackage,type RuntimeProfile,type TaskData,type Hash} from './contracts.ts';
import {keys,text,isDigest,requireValue} from '../contracts.ts';
import {verifySourceClosure,sourceClosureDigest,type SourceClosure} from './source.ts';
import {IsolatedExecutionError,type IsolatedResult} from './isolation.ts';
import {PostgresRemoteDeliveryJournal,type DeliveryRecord} from './remote-journal.ts';

export interface RemoteEnrollment {
  ownerId:string; installationId:string; agentId:string; hostId:string; revision:number;
  controllerKeyId:string; executorKeyId:string; profile:RuntimeProfile; active:boolean; expiresAt:number;
}
export interface RemoteBinding {
  ownerId:string; installationId:string; agentId:string; hostId:string; enrollmentDigest:string;
  operationId:string; packageDigest:string; originDigest:string; sourceClosureDigest:Hash; runtimeDigest:Hash;
}
type Action='EXECUTE'|'READ'|'FENCE';
interface Execution {pkg:AlphaTasksPackage;operation:string;input:unknown;data:TaskData}
export interface RemoteRequest {
  schema:'myapps.remote-isolation.request/v1'; action:Action; binding:RemoteBinding;
  commandDigest:string; issuedAt:number; expiresAt:number; execution:Execution|null;
}
export interface SignedRemoteRequest {document:RemoteRequest;keyId:string;signature:string;source:SourceClosure|null}
export type RemoteOutcome={status:'COMPLETED';result:IsolatedResult}|{status:'DENIED'|'UNKNOWN';result:null};
export interface RemoteObservation {
  schema:'myapps.remote-isolation.observation/v1';requestDigest:string;commandDigest:string;binding:RemoteBinding;
  observedAt:number;status:'COMPLETED'|'DENIED'|'UNKNOWN'|'NOT_FOUND'|'PENDING_BACKEND'|'AUTHORITY_FENCED'|'CLEANUP_CONFIRMED';
  result:IsolatedResult|null;
}
export interface SignedRemoteObservation {document:RemoteObservation;keyId:string;signature:string}
export interface RemoteAuthorization {commandDigest:string;enrollmentDigest:string;action:Action;expiresAt:number}
/** A qualified backend must atomically fence this exact operation against every delayed launcher.
 * Merely deleting a currently visible container does not satisfy fence(). No default is supplied. */
export interface RemoteExecutor {
  execute(source:SourceClosure,operation:string,input:unknown,data:TaskData,operationId:string):Promise<IsolatedResult>;
  fence?(binding:RemoteBinding,commandDigest:string):Promise<{bindingDigest:string;commandDigest:string;fenced:true;cleanup:'CONFIRMED'|'UNKNOWN'}>;
}
interface Trust {
  enrollment:()=>Promise<RemoteEnrollment>;
  controllerPublicKey:KeyObject;executorPublicKey:KeyObject;
  now?:()=>number;
}
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
function enrollment(value:RemoteEnrollment,now:number) {
  keys(value,['ownerId','installationId','agentId','hostId','revision','controllerKeyId','executorKeyId','profile','active','expiresAt']);
  for(const key of ['ownerId','installationId','agentId','hostId','controllerKeyId','executorKeyId'] as const)text(value[key]);
  requireValue(Number.isSafeInteger(value.revision)&&value.revision>0&&typeof value.active==='boolean'&&
    Number.isSafeInteger(value.expiresAt)&&value.expiresAt>now,'APP_REMOTE_ENROLLMENT');
  validateRuntime(value.profile);return structuredClone(value);
}
function enrollmentDigest(e:RemoteEnrollment) {const {active,...identity}=e;return digest(identity);}
function checkKey(key:KeyObject,kind:'private'|'public') {
  requireValue(key.type===kind&&key.asymmetricKeyType==='ed25519','APP_REMOTE_KEY');
}
function signature(document:unknown,key:KeyObject) {checkKey(key,'private');return sign(null,Buffer.from(canonical(document)),key).toString('base64');}
function authentic(document:unknown,sig:unknown,key:KeyObject) {
  checkKey(key,'public');requireValue(typeof sig==='string'&&/^[A-Za-z0-9+/]{86}==$/.test(sig)&&
    verify(null,Buffer.from(canonical(document)),key,Buffer.from(sig,'base64')),'APP_REMOTE_SIGNATURE');
}
function binding(value:RemoteBinding,e:RemoteEnrollment) {
  keys(value,['ownerId','installationId','agentId','hostId','enrollmentDigest','operationId','packageDigest','originDigest','sourceClosureDigest','runtimeDigest']);
  requireValue(value.ownerId===e.ownerId&&value.installationId===e.installationId&&value.agentId===e.agentId&&
    value.hostId===e.hostId&&value.enrollmentDigest===enrollmentDigest(e)&&UUID.test(value.operationId)&&
    value.runtimeDigest===digest(e.profile),'APP_REMOTE_BINDING');
  for(const key of ['packageDigest','originDigest','sourceClosureDigest','runtimeDigest'])requireValue(isDigest(value[key as keyof RemoteBinding]),'APP_REMOTE_BINDING');
}
function validateRequest(wire:SignedRemoteRequest,e:RemoteEnrollment,trust:Trust):RemoteRequest {
  keys(wire,['document','keyId','signature','source']);
  requireValue(wire.keyId===e.controllerKeyId,'APP_REMOTE_KEY');
  authentic(wire.document,wire.signature,trust.controllerPublicKey);
  const r=wire.document;keys(r,['schema','action','binding','commandDigest','issuedAt','expiresAt','execution']);
  const now=(trust.now??Date.now)();
  requireValue(r.schema==='myapps.remote-isolation.request/v1'&&['EXECUTE','READ','FENCE'].includes(r.action)&&
    Number.isSafeInteger(r.issuedAt)&&Number.isSafeInteger(r.expiresAt)&&r.issuedAt<=now&&r.expiresAt>now&&
    r.expiresAt-r.issuedAt>0&&r.expiresAt-r.issuedAt<=30000&&isDigest(r.commandDigest),'APP_REMOTE_REQUEST');
  binding(r.binding,e);
  if(r.action==='EXECUTE') {
    requireValue(e.active&&r.execution&&wire.source,'APP_REMOTE_DISABLED');
    keys(r.execution,['pkg','operation','input','data']);
    const p=validateAlphaTasksPackage(r.execution.pkg),op=validateOperation(r.execution.operation,r.execution.input);
    validateTaskData(r.execution.data);
    requireValue(canonical(op)===canonical({operation:r.execution.operation,input:r.execution.input})&&
      p.spec.ownerId===e.ownerId&&p.origin.installationId===e.installationId&&digest(p)===r.binding.packageDigest&&
      digest(p.origin)===r.binding.originDigest&&digest(p.runtime)===r.binding.runtimeDigest&&
      p.sourceClosureDigest===r.binding.sourceClosureDigest&&digest({binding:r.binding,execution:r.execution})===r.commandDigest,'APP_REMOTE_BINDING');
    const source=verifySourceClosure(wire.source,p.origin.candidateTree);
    requireValue(sourceClosureDigest(source)===p.sourceClosureDigest,'APP_REMOTE_SOURCE');
  } else requireValue(r.execution===null&&wire.source===null,'APP_REMOTE_REQUEST');
  return structuredClone(r);
}
function result(value:IsolatedResult,b:RemoteBinding,execution?:Execution|null):IsolatedResult {
  keys(value,['operationId','output','data','cleanup','sourceClosureDigest','runtimeDigest']);
  requireValue(value.operationId===b.operationId&&value.cleanup==='CONFIRMED'&&value.sourceClosureDigest===b.sourceClosureDigest&&
    value.runtimeDigest===b.runtimeDigest,'APP_REMOTE_RESULT');
  validateTaskData(value.data);canonical(value.output);
  if(execution&&['list','render'].includes(execution.operation))
    requireValue(canonical(value.data)===canonical(execution.data),'APP_READ_MUTATED_DATA');
  return structuredClone(value);
}
function observation(row:DeliveryRecord|null):Pick<RemoteObservation,'status'|'result'> {
  if(!row)return {status:'NOT_FOUND',result:null};
  if(row.fenceRequested)return {status:row.cleanupConfirmed?'CLEANUP_CONFIRMED':row.fenceConfirmed?'AUTHORITY_FENCED':'PENDING_BACKEND',result:null};
  // A durable claim without an authenticated completed outcome may be a crashed worker.
  return row.outcome??{status:'UNKNOWN',result:null};
}

/** No listener, URL, credential loader or bootstrap registration. All ingress remains denied. */
export class RemoteIsolationReceiver {
  constructor(private readonly trust:Trust,private readonly signer:KeyObject,private readonly journal:PostgresRemoteDeliveryJournal,
    private readonly executor:RemoteExecutor,
    private readonly authorize:(request:RemoteRequest)=>Promise<RemoteAuthorization>) {}
  async receive(wire:SignedRemoteRequest):Promise<SignedRemoteObservation> {
    const snapshot=structuredClone(wire);
    const now=this.trust.now??Date.now,e=enrollment(await this.trust.enrollment(),now());
    const r=validateRequest(snapshot,e,this.trust),grant=await this.authorize(structuredClone(r));
    requireValue(grant.commandDigest===r.commandDigest&&grant.enrollmentDigest===r.binding.enrollmentDigest&&grant.action===r.action&&
      Number.isSafeInteger(grant.expiresAt)&&grant.expiresAt>now()&&grant.expiresAt<=r.expiresAt,'APP_REMOTE_AUTHORITY');
    // Recheck external enrollment after the authorization round trip, before durable admission.
    requireValue(digest(enrollment(await this.trust.enrollment(),now()))===digest(e)&&
      r.expiresAt>now()&&grant.expiresAt>now(),'APP_REMOTE_ENROLLMENT');
    if(r.action==='EXECUTE'&&await this.journal.claim(r.binding,r.commandDigest)) {
      let outcome:RemoteOutcome;
      try {
        requireValue(now()<grant.expiresAt&&now()<r.expiresAt&&
          digest(enrollment(await this.trust.enrollment(),now()))===digest(e),'APP_REMOTE_ENROLLMENT');
        requireValue(!(await this.journal.read(r.binding,r.commandDigest))?.fenceRequested,'APP_REMOTE_FENCE');
        // No await may separate this last lease check from invoking the qualified executor.
        requireValue(now()<grant.expiresAt&&now()<r.expiresAt&&now()<e.expiresAt,'APP_REMOTE_AUTHORITY');
        const x=r.execution!;
        outcome={status:'COMPLETED',result:result(await this.executor.execute(structuredClone(snapshot.source!),x.operation,structuredClone(x.input),structuredClone(x.data),r.binding.operationId),r.binding,x)};
      } catch(error) {
        outcome={status:error instanceof IsolatedExecutionError&&error.cleanup==='CONFIRMED'?'DENIED':'UNKNOWN',result:null};
      }
      // A failure here intentionally leaves the claim UNKNOWN; no redispatch on later delivery.
      await this.journal.complete(r.binding,r.commandDigest,outcome);
    } else if(r.action==='FENCE') {
      await this.journal.requestFence(r.binding,r.commandDigest);
      if(this.executor.fence&&!(await this.journal.read(r.binding,r.commandDigest))?.cleanupConfirmed) {
        try {
          requireValue(now()<grant.expiresAt&&now()<r.expiresAt&&now()<e.expiresAt,'APP_REMOTE_AUTHORITY');
          const ack=await this.executor.fence(r.binding,r.commandDigest);
          keys(ack,['bindingDigest','commandDigest','fenced','cleanup']);
          requireValue(ack.bindingDigest===digest(r.binding)&&ack.commandDigest===r.commandDigest&&ack.fenced===true&&['CONFIRMED','UNKNOWN'].includes(ack.cleanup),'APP_REMOTE_FENCE');
          await this.journal.confirmFence(r.binding,r.commandDigest,ack.cleanup==='CONFIRMED');
        } catch { /* Missing qualified fencing/cleanup stays PENDING_BACKEND or retains prior evidence. */ }
      }
    }
    const retained=await this.journal.read(r.binding,r.commandDigest);
    if(retained?.outcome) {
      keys(retained.outcome,['status','result']);
      requireValue(['COMPLETED','DENIED','UNKNOWN'].includes(retained.outcome.status),'APP_REMOTE_RESULT');
      if(retained.outcome.status==='COMPLETED')result(retained.outcome.result,r.binding,r.execution);
      else requireValue(retained.outcome.result===null,'APP_REMOTE_RESULT');
    }
    const value=observation(retained);
    const document:RemoteObservation={schema:'myapps.remote-isolation.observation/v1',requestDigest:digest(r),
      commandDigest:r.commandDigest,binding:r.binding,observedAt:now(),...value};
    return {document,keyId:e.executorKeyId,signature:signature(document,this.signer)};
  }
}

/** Transport injection is deliberately inert. A future qualified host must preserve canonical
 * AlphaTasksHost.authorize and its existing operation reservation / late-result CAS. */
export class RemoteAlphaTasksIsolation {
  constructor(private readonly trust:Trust,private readonly signer:KeyObject,
    private readonly exchange:(request:SignedRemoteRequest)=>Promise<SignedRemoteObservation>) {}
  async prepare(pkg:AlphaTasksPackage,source:SourceClosure,operation:unknown,input:unknown,data:TaskData,operationId:string):Promise<SignedRemoteRequest> {
    const now=(this.trust.now??Date.now)(),e=enrollment(await this.trust.enrollment(),now),p=validateAlphaTasksPackage(pkg),op=validateOperation(operation,input);
    const b:RemoteBinding={ownerId:e.ownerId,installationId:e.installationId,agentId:e.agentId,hostId:e.hostId,enrollmentDigest:enrollmentDigest(e),operationId,
      packageDigest:digest(p),originDigest:digest(p.origin),sourceClosureDigest:p.sourceClosureDigest,runtimeDigest:digest(p.runtime) as Hash};
    const execution={pkg:p,...op,data:validateTaskData(data)};
    const document:RemoteRequest={schema:'myapps.remote-isolation.request/v1',action:'EXECUTE',binding:b,commandDigest:digest({binding:b,execution}),
      issuedAt:now,expiresAt:Math.min(now+30000,e.expiresAt),execution};
    const wire={document,keyId:e.controllerKeyId,signature:signature(document,this.signer),source};
    validateRequest(wire,e,this.trust);return structuredClone(wire);
  }
  async observe(command:SignedRemoteRequest,action:Action='READ'):Promise<RemoteObservation> {
    const now=this.trust.now??Date.now,e=enrollment(await this.trust.enrollment(),now());
    binding(command.document.binding,e);
    const document:RemoteRequest=action==='EXECUTE'?structuredClone(command.document):{...command.document,action,execution:null,issuedAt:now(),expiresAt:Math.min(now()+30000,e.expiresAt)};
    const request={document,keyId:e.controllerKeyId,signature:signature(document,this.signer),source:action==='EXECUTE'?command.source:null};
    validateRequest(request,e,this.trust);
    let timer:ReturnType<typeof setTimeout>|undefined;
    const deadline=new Promise<never>((_resolve,reject)=>{timer=setTimeout(()=>reject(new IsolatedExecutionError('UNKNOWN')),Math.max(1,document.expiresAt-now()));});
    let wire:SignedRemoteObservation;
    try {wire=await Promise.race([this.exchange(structuredClone(request)),deadline]);}
    finally {clearTimeout(timer);}
    keys(wire,['document','keyId','signature']);
    requireValue(wire.keyId===e.executorKeyId,'APP_REMOTE_KEY');authentic(wire.document,wire.signature,this.trust.executorPublicKey);
    const r=wire.document;keys(r,['schema','requestDigest','commandDigest','binding','observedAt','status','result']);
    const current=enrollment(await this.trust.enrollment(),now());
    requireValue(r.schema==='myapps.remote-isolation.observation/v1'&&r.requestDigest===digest(document)&&r.commandDigest===document.commandDigest&&
      canonical(r.binding)===canonical(document.binding)&&Number.isSafeInteger(r.observedAt)&&r.observedAt>=document.issuedAt&&r.observedAt<=now()&&
      now()<document.expiresAt&&digest(current)===digest(e),'APP_REMOTE_RESPONSE');
    requireValue(['COMPLETED','DENIED','UNKNOWN','NOT_FOUND','PENDING_BACKEND','AUTHORITY_FENCED','CLEANUP_CONFIRMED'].includes(r.status),'APP_REMOTE_RESPONSE');
    if(r.status==='COMPLETED')result(r.result!,r.binding,command.document.execution);
    else requireValue(r.result===null,'APP_REMOTE_RESPONSE');
    return structuredClone(r);
  }
  async execute(pkg:AlphaTasksPackage,source:SourceClosure,operation:unknown,input:unknown,data:TaskData,operationId:string):Promise<IsolatedResult> {
    try {
      const command=await this.prepare(pkg,source,operation,input,data,operationId),r=await this.observe(command,'EXECUTE');
      if(r.status==='COMPLETED')return r.result!;
      throw new IsolatedExecutionError(r.status==='DENIED'?'CONFIRMED':'UNKNOWN');
    } catch(error) {
      if(error instanceof IsolatedExecutionError)throw error;
      // Neither transport failure nor malformed/foreign evidence establishes absence of an effect.
      throw new IsolatedExecutionError('UNKNOWN');
    }
  }
}
