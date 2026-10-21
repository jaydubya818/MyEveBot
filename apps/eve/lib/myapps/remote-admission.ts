import type {GoalConnection} from '../goal-work/database.ts';
import type {Principal} from '../../../../packages/myapps/src/store.ts';
import {canonical,digest,validateAlphaTasksPackage,validateOperation,validateTaskData,type AlphaTasksPackage,type TaskData} from '../../../../packages/myapps/src/alpha-tasks/contracts.ts';
import {keys,requireValue,text,isDigest} from '../../../../packages/myapps/src/contracts.ts';
import type {RemoteRequest,RemoteAuthorization,RemoteBinding} from '../../../../packages/myapps/src/alpha-tasks/remote-isolation.ts';
import type {AlphaTasksHost} from './alpha-tasks.ts';

interface Version {workVersion:number;workGeneration:number;policyRevision:number}
export type ReceivingIdentity=Pick<RemoteBinding,'ownerId'|'installationId'|'agentId'|'hostId'|'enrollmentDigest'>;
export interface ExecutionAdmission extends Version {
  schema:'myapps.execution-admission/v1';ownerId:string;actorId:string;kind:'human'|'agent';permission:'apps.manage'|'apps.run';
  appId:string;receiptId:string;requestHash:string;operationId:string;mode:'PREVIEW'|'INVOKE';
  packageVersion:number;packageDigest:string;originDigest:string;sourceClosureDigest:string;runtimeDigest:string;
  operation:string;inputDigest:string;beforeStateDigest:string;executionDigest:string;appRevision:number;dataRevision:number;
  receivingIdentity:ReceivingIdentity|null;
}
export function executionAdmission(input:{principal:Principal;pkg:AlphaTasksPackage;receiptId:string;requestHash:string;operationId:string;
  mode:'PREVIEW'|'INVOKE';operation:unknown;input:unknown;data:TaskData;appRevision:number;dataRevision:number;authorization:Version;
  receivingIdentity:ReceivingIdentity|null}):ExecutionAdmission {
  const p=input.principal,pkg=validateAlphaTasksPackage(input.pkg),op=validateOperation(input.operation,input.input),data=validateTaskData(input.data);
  const a={schema:'myapps.execution-admission/v1' as const,ownerId:p.ownerId,actorId:p.actorId,kind:p.kind,
    permission:input.mode==='PREVIEW'?'apps.manage' as const:'apps.run' as const,appId:pkg.appId,receiptId:input.receiptId,requestHash:input.requestHash,
    operationId:input.operationId,mode:input.mode,packageVersion:pkg.version,packageDigest:digest(pkg),originDigest:digest(pkg.origin),
    sourceClosureDigest:pkg.sourceClosureDigest,runtimeDigest:digest(pkg.runtime),operation:op.operation,inputDigest:digest(op.input),
    beforeStateDigest:digest(data),executionDigest:digest({pkg,...op,data}),appRevision:input.appRevision,dataRevision:input.dataRevision,
    receivingIdentity:structuredClone(input.receivingIdentity),...input.authorization};
  validateAdmission(a);requireValue(pkg.spec.ownerId===p.ownerId&&p.allowedOperations.includes(a.permission)&&
    (!a.receivingIdentity||a.receivingIdentity.installationId===pkg.origin.installationId),'APP_REMOTE_ADMISSION');return a;
}
function validateAdmission(value:unknown):asserts value is ExecutionAdmission {
  keys(value,['schema','ownerId','actorId','kind','permission','appId','receiptId','requestHash','operationId','mode','packageVersion','packageDigest',
    'originDigest','sourceClosureDigest','runtimeDigest','operation','inputDigest','beforeStateDigest','executionDigest','appRevision','dataRevision',
    'workVersion','workGeneration','policyRevision','receivingIdentity']);
  requireValue(value.schema==='myapps.execution-admission/v1'&&['human','agent'].includes(value.kind)&&['PREVIEW','INVOKE'].includes(value.mode)&&
    value.permission===(value.mode==='PREVIEW'?'apps.manage':'apps.run')&&['list','create','update','render'].includes(value.operation),'APP_REMOTE_ADMISSION');
  for(const key of ['ownerId','actorId','appId','receiptId','operationId'])text(value[key],200);
  for(const key of ['requestHash','packageDigest','originDigest','sourceClosureDigest','runtimeDigest','inputDigest','beforeStateDigest','executionDigest'])
    requireValue(isDigest(value[key]),'APP_REMOTE_ADMISSION');
  for(const key of ['packageVersion','workVersion','workGeneration','policyRevision'])requireValue(Number.isSafeInteger(value[key])&&value[key]>0,'APP_REMOTE_ADMISSION');
  for(const key of ['appRevision','dataRevision'])requireValue(Number.isSafeInteger(value[key])&&value[key]>=0,'APP_REMOTE_ADMISSION');
  if(value.receivingIdentity!==null) {
    keys(value.receivingIdentity,['ownerId','installationId','agentId','hostId','enrollmentDigest']);
    for(const key of ['ownerId','installationId','agentId','hostId'])text(value.receivingIdentity[key]);
    requireValue(value.receivingIdentity.ownerId===value.ownerId&&isDigest(value.receivingIdentity.enrollmentDigest),'APP_REMOTE_ADMISSION');
  }
  canonical(value);
}

/** Called only inside AlphaTasksApps' canonical owner-locked transaction with a freshly
 * authenticated principal. No request fields become authentication or permission grants. */
export async function authorizeRemoteAdmission(c:GoalConnection,p:Principal,r:RemoteRequest,host:AlphaTasksHost,now=Date.now):Promise<RemoteAuthorization> {
  requireValue(r.schema==='myapps.remote-isolation.request/v2'&&['EXECUTE','READ','FENCE'].includes(r.action)&&
    Number.isSafeInteger(r.issuedAt)&&Number.isSafeInteger(r.expiresAt)&&r.issuedAt<=now()&&r.expiresAt>now()&&
    r.expiresAt-r.issuedAt<=30000&&r.binding.ownerId===p.ownerId&&isDigest(r.executionDigest)&&
    r.commandDigest===digest({binding:r.binding,executionDigest:r.executionDigest}),'APP_REMOTE_ADMISSION');
  const rows=(await c.query(`SELECT id,app_id,request_hash,response,execution_admission FROM myapps_receipts
    WHERE owner_id=$1 AND execution_admission->>'operationId'=$2 LIMIT 2 FOR UPDATE`,[p.ownerId,r.binding.operationId])).rows;
  requireValue(rows.length===1,'APP_REMOTE_ADMISSION');const row=rows[0],a:unknown=row.execution_admission;validateAdmission(a);
  requireValue(a.ownerId===p.ownerId&&a.appId===row.app_id&&a.receiptId===row.id&&a.requestHash===row.request_hash&&
    a.executionDigest===r.executionDigest&&a.operationId===r.binding.operationId&&a.packageDigest===r.binding.packageDigest&&
    a.originDigest===r.binding.originDigest&&a.sourceClosureDigest===r.binding.sourceClosureDigest&&a.runtimeDigest===r.binding.runtimeDigest,'APP_REMOTE_ADMISSION');
  const identity={ownerId:r.binding.ownerId,installationId:r.binding.installationId,agentId:r.binding.agentId,hostId:r.binding.hostId,enrollmentDigest:r.binding.enrollmentDigest};
  requireValue(a.receivingIdentity&&canonical(a.receivingIdentity)===canonical(identity)&&
    canonical(host.receivingIdentity?.()??null)===canonical(identity),'APP_REMOTE_ADMISSION');
  if(r.action==='EXECUTE') {
    requireValue(a.actorId===p.actorId&&a.kind===p.kind&&p.allowedOperations.includes(a.permission)&&
      row.response.status==='RUNNING'&&row.response.operationId===a.operationId&&r.execution&&digest(r.execution)===a.executionDigest,'APP_REMOTE_ADMISSION');
    const pkg=validateAlphaTasksPackage(r.execution.pkg);
    requireValue(pkg.appId===a.appId&&pkg.version===a.packageVersion&&pkg.spec.ownerId===p.ownerId&&pkg.origin.installationId===r.binding.installationId&&
      digest(pkg)===a.packageDigest&&digest(r.execution.input)===a.inputDigest&&digest(r.execution.data)===a.beforeStateDigest&&r.execution.operation===a.operation,'APP_REMOTE_ADMISSION');
    const state=(await c.query('SELECT state FROM myapps_installations WHERE owner_id=$1 AND app_id=$2 FOR UPDATE',[p.ownerId,a.appId])).rows[0]?.state;
    const candidate=(await c.query('SELECT digest,package,revoked FROM myapps_candidates WHERE owner_id=$1 AND app_id=$2 AND version=$3',
      [p.ownerId,a.appId,a.packageVersion])).rows[0];
    requireValue(state?.ownerId===p.ownerId&&state.appId===a.appId&&state.revision===a.appRevision&&state.dataRevision===a.dataRevision&&
      candidate&&!candidate.revoked&&candidate.digest===a.packageDigest&&digest(candidate.package)===a.packageDigest,'APP_REMOTE_ADMISSION');
    if(a.mode==='INVOKE')requireValue(state.enabled&&state.installedVersion===a.packageVersion&&state.installedDigest===a.packageDigest&&
      digest(validateTaskData(state.data))===a.beforeStateDigest,'APP_REMOTE_ADMISSION');
    else requireValue(a.operation==='list'&&a.inputDigest===digest({})&&a.beforeStateDigest===digest({next:1,tasks:[]}),'APP_REMOTE_ADMISSION');
    host.assertProfile(pkg);
    const current=await host.authorize(c,p,pkg.origin,a.permission);
    requireValue(current.workVersion===a.workVersion&&current.workGeneration===a.workGeneration&&current.policyRevision===a.policyRevision,'APP_REMOTE_ADMISSION');
  } else {
    // Recovery reduces authority or reads exact retained custody; it never grants an execution.
    requireValue(r.execution===null,'APP_REMOTE_ADMISSION');
    const owner=p.kind==='human'&&p.actorId===p.ownerId&&p.allowedOperations.includes('apps.manage');
    const originalReader=r.action==='READ'&&p.actorId===a.actorId&&p.kind===a.kind&&p.allowedOperations.includes('apps.read');
    requireValue(owner||originalReader,'APP_REMOTE_RECOVERY_DENIED');
  }
  requireValue(host.enabled()&&r.expiresAt>now(),'APP_REMOTE_ADMISSION');
  return {commandDigest:r.commandDigest,enrollmentDigest:r.binding.enrollmentDigest,action:r.action,expiresAt:r.expiresAt};
}
