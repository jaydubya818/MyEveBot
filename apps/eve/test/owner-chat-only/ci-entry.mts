/** Supplied metadata only. This module observes and executes nothing. Matching
 * caller records cannot authorize a probe, an operator spec or publication. */
import {types} from 'node:util';
import {createHash} from 'node:crypto';

type Data=Record<string,unknown>;
type Failure='NONE'|'OPERATION_FAILED'|'DEADLINE'|'CLEANUP_UNKNOWN'|'IDENTITY_UNKNOWN';
type Code='MATCHED_SUPPLIED_METADATA'|'CONTRACT_INVALID'|'SOURCE_MISMATCH'|'STALE_OBSERVATION'
 |'SERVICE_MISMATCH'|'TOOL_OR_SCOPE_MISMATCH'|'CLUSTER_MISMATCH'|'FILE_WITNESS_INVALID'
 |'DEADLINE_OR_RESOURCE_LIMIT'|'LATE_SETUP_OR_REGISTRATION'|'OPERATION_NOT_SETTLED'
 |'IDENTITY_UNKNOWN'|'FIRST_FAILURE_RETAINED'|'SNAPSHOT_ORDER_INVALID'
 |'PUBLIC_PROJECTION_INVALID'|'CODE_PROVENANCE_UNREVIEWED';
export const metadataLimits=Object.freeze({observationAgeMs:300000,operationMs:900000,
 cleanupMs:420000,settlementMs:180000,totalMs:1500000,groupsPerSlot:3,totalGroups:5,
 databaseNames:3,commandLogBytes:16*1024*1024,publicFileBytes:65536,publicAggregateBytes:131072});
function result(code:Code,firstFailure:Failure='NONE'){
 return Object.freeze({version:1,scope:'SUPPLIED_METADATA_ONLY',
  status:code==='MATCHED_SUPPLIED_METADATA'?'MATCHED_SUPPLIED_METADATA':'UNKNOWN_HOLD',
  code,firstFailure,executionAuthorized:false,runtimeQualified:false,artifactPublicationAuthorized:false});
}
function record(value:unknown,keys:readonly string[]):Data|null{
 if(!value||typeof value!=='object'||types.isProxy(value))return null;
 const prototype=Object.getPrototypeOf(value);
 if(prototype!==Object.prototype&&prototype!==null)return null;
 const names=Reflect.ownKeys(value);
 if(names.length!==keys.length||names.some(key=>typeof key!=='string'||!keys.includes(key)))return null;
 const data:Data=Object.create(null);
 for(const key of keys){const descriptor=Object.getOwnPropertyDescriptor(value,key);
  if(!descriptor||!Object.hasOwn(descriptor,'value'))return null;data[key]=descriptor.value;}
 return data;
}
function list(value:unknown,maximum:number):unknown[]|null{
 if(!value||types.isProxy(value)||!Array.isArray(value)||value.length>maximum)return null;
 const names=Reflect.ownKeys(value);
 if(names.length!==value.length+1)return null;
 const data:unknown[]=[];
 for(let index=0;index<value.length;index++){const descriptor=Object.getOwnPropertyDescriptor(value,String(index));
  if(!descriptor||!Object.hasOwn(descriptor,'value'))return null;data.push(descriptor.value);}
 return data;
}
const integer=(value:unknown):value is number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;
const hex=(value:unknown,length:number)=>typeof value==='string'&&value.length===length&&/^[a-f0-9]+$/.test(value);
const digits=(value:unknown,min=1,max=25)=>typeof value==='string'&&value.length>=min&&value.length<=max&&/^[0-9]+$/.test(value);
const image=(value:unknown)=>typeof value==='string'&&/^sha256:[a-f0-9]{64}$/.test(value);
function path(value:unknown):value is string{
 return typeof value==='string'&&value.length>1&&value.length<=4096&&value.startsWith('/')
  &&!value.includes('\0')&&!value.includes('\\')&&value.split('/').slice(1).every(part=>part!==''&&part!=='.'&&part!=='..');
}

const referenceKeys=['profile','sourceCommit','sourceTree','lockSha256','runId','attempt','serviceId',
 'pinnedImageDigest','actualImageId','hostPort','containerPort','systemIdentifier','dataDirectory',
 'role','database','postgresMajor','toolInventorySha256','scopeReviewSha256'];
const observationKeys=['profile','declaredSource','eventSourceOrigin','checkoutCommit','checkoutTree','checkoutClean','lockSha256','runId','attempt',
 'declaredServiceId','inspectedServiceId','pinnedImageDigest','actualImageId','hostPort','containerPort',
 'containerSystemIdentifier','tcpSystemIdentifier','containerDataDirectory','tcpDataDirectory','role',
 'database','postgresMajor','toolInventorySha256','scopeReviewSha256','capturedAtMs','selectorOrigin'];
export function validateCiMetadata(reference:unknown,observation:unknown,nowMs:unknown){
 try{
  const r=record(reference,referenceKeys),o=record(observation,observationKeys);
  if(!r||!o||r.profile!=='CHAT_ONLY_V1'||o.profile!=='CHAT_ONLY_V1'||!integer(nowMs)||!hex(r.sourceCommit,40)||!hex(r.sourceTree,40)||!hex(r.lockSha256,64)
   ||!digits(r.runId,1,20)||!integer(r.attempt)||r.attempt<1||!hex(r.serviceId,64)
   ||!image(r.pinnedImageDigest)||!image(r.actualImageId)||!integer(r.hostPort)||r.hostPort<=1024||r.hostPort>65535
   ||r.containerPort!==5432||!digits(r.systemIdentifier,10,25)||!path(r.dataDirectory)
   ||r.role!=='ux_fixture'||r.database!=='blocker_fixes'||r.postgresMajor!==17
   ||!hex(r.toolInventorySha256,64)||!hex(r.scopeReviewSha256,64))return result('CONTRACT_INVALID');
  if(!integer(o.capturedAtMs)||o.capturedAtMs>nowMs||nowMs-o.capturedAtMs>metadataLimits.observationAgeMs)return result('STALE_OBSERVATION');
  if(o.eventSourceOrigin!=='REVIEWED_EVENT_SOURCE'||o.declaredSource!==r.sourceCommit||o.checkoutCommit!==r.sourceCommit||o.checkoutTree!==r.sourceTree
   ||o.checkoutClean!==true||o.lockSha256!==r.lockSha256)return result('SOURCE_MISMATCH');
  if(o.runId!==r.runId||o.attempt!==r.attempt||o.selectorOrigin!=='DECLARED_CI_SERVICE_CONTEXT'
   ||o.declaredServiceId!==r.serviceId||o.inspectedServiceId!==r.serviceId
   ||o.pinnedImageDigest!==r.pinnedImageDigest||o.actualImageId!==r.actualImageId
   ||o.hostPort!==r.hostPort||o.containerPort!==r.containerPort)return result('SERVICE_MISMATCH');
  if(o.toolInventorySha256!==r.toolInventorySha256||o.scopeReviewSha256!==r.scopeReviewSha256)return result('TOOL_OR_SCOPE_MISMATCH');
  if(o.containerSystemIdentifier!==r.systemIdentifier||o.tcpSystemIdentifier!==r.systemIdentifier
   ||o.containerDataDirectory!==r.dataDirectory||o.tcpDataDirectory!==r.dataDirectory
   ||o.role!==r.role||o.database!==r.database||o.postgresMajor!==r.postgresMajor)return result('CLUSTER_MISMATCH');
  return result('MATCHED_SUPPLIED_METADATA');
 }catch{return result('CONTRACT_INVALID');}
}

const fileKeys=['path','realPath','purpose','kind','ownerUid','mode','links','device','inode','size','sha256','mtimeNs','ctimeNs'];
function file(value:unknown):Data|null{
 const f=record(value,fileKeys);
 if(!f||!path(f.path)||f.path!==f.realPath||f.kind!=='REGULAR'
  ||!['TOOL','PUBLIC_ARTIFACT'].includes(f.purpose as string)||!integer(f.ownerUid)
  ||!integer(f.mode)||f.mode>0o777||(f.mode&0o022)!==0||f.links!==1
  ||!digits(f.device)||!digits(f.inode)||!integer(f.size)||!hex(f.sha256,64)
  ||!digits(f.mtimeNs)||!digits(f.ctimeNs)
  ||(f.purpose==='PUBLIC_ARTIFACT'&&f.mode!==0o400&&f.mode!==0o444))return null;
 return f;
}
export function validateFileWitness(reference:unknown,before:unknown,after:unknown){
 try{
  const r=file(reference),b=file(before),a=file(after);
  if(!r||!b||!a||fileKeys.some(key=>r[key]!==b[key]||r[key]!==a[key]))return result('FILE_WITNESS_INVALID');
  return result('MATCHED_SUPPLIED_METADATA');
 }catch{return result('FILE_WITNESS_INVALID');}
}

const times=['startedAt','setupSettledAt','admissionStoppedAt','lastRegistrationAt','writersSettledAt',
 'modelDrainedAt','processesSettledAt','snapshotAt','poolsClosedAt','clusterRecheckedAt','sessionsAbsentAt',
 'droppedAt','adminsClosedAt','sourceRecheckedAt','joinedAt'];
const counts=['spawnedGroups','registeredGroups','closedGroups','slot1MaxActive','slot2MaxActive','totalMaxActive',
 'pendingSetup','pendingOperations','activeModelHandlers','commandLogBytesMax','unclaimedDatabaseCreates','unknownDatabaseResources'];
function databaseNames(value:unknown):string[]|null{
 const names=list(value,metadataLimits.databaseNames);
 if(!names||names.some(name=>typeof name!=='string'||!/^[a-z_][a-z0-9_]{0,62}$/.test(name))
  ||new Set(names).size!==names.length)return null;
 return names as string[];
}
function suppliedFailure(value:unknown):Failure{
 if(!value||typeof value!=='object'||types.isProxy(value))return 'NONE';
 const field=Object.getOwnPropertyDescriptor(value,'firstFailure');
 const code=field&&Object.hasOwn(field,'value')?field.value:undefined;
 return ['OPERATION_FAILED','DEADLINE','CLEANUP_UNKNOWN','IDENTITY_UNKNOWN'].includes(code)?code as Failure:'NONE';
}
export function validateFinalizationMetadata(value:unknown){
 let failure:Failure='NONE';
 try{
  failure=suppliedFailure(value);
  const d=record(value,[...times,...counts,'firstFailure','registryState','noSpawnProven',
   'identityState','writersClosed','modelClosed','sourceStable','outerOwnerSettled','diagnostics',
   'returnedDatabaseNames','registeredDatabaseNames','droppedDatabaseNames','databaseCleanupMode']);
  if(!d||!times.every(key=>integer(d[key]))||!counts.every(key=>integer(d[key]))
   ||!['noSpawnProven','writersClosed','modelClosed','sourceStable','outerOwnerSettled'].every(key=>typeof d[key]==='boolean')
   ||!['NONE','OPERATION_FAILED','DEADLINE','CLEANUP_UNKNOWN','IDENTITY_UNKNOWN'].includes(d.firstFailure as string))return result('CONTRACT_INVALID',failure);
  const returned=databaseNames(d.returnedDatabaseNames),registered=databaseNames(d.registeredDatabaseNames),dropped=databaseNames(d.droppedDatabaseNames);
  if(!returned||!registered||!dropped||!['NONFORCE','FORCE','UNKNOWN'].includes(d.databaseCleanupMode as string))return result('CONTRACT_INVALID',failure);
  if(failure!=='NONE')return result('FIRST_FAILURE_RETAINED',failure);
  const n=(key:string)=>d[key] as number;
  if(n('admissionStoppedAt')-n('startedAt')>metadataLimits.operationMs
   ||n('adminsClosedAt')-n('admissionStoppedAt')>metadataLimits.cleanupMs
   ||n('joinedAt')-n('adminsClosedAt')>metadataLimits.settlementMs
   ||n('joinedAt')-n('startedAt')>metadataLimits.totalMs
   ||n('slot1MaxActive')>3||n('slot2MaxActive')>3||n('totalMaxActive')>5
   ||n('totalMaxActive')>n('slot1MaxActive')+n('slot2MaxActive')
   ||n('spawnedGroups')>128||n('commandLogBytesMax')>metadataLimits.commandLogBytes||d.diagnostics!=='OFF')return result('DEADLINE_OR_RESOURCE_LIMIT');
  if(n('setupSettledAt')>n('admissionStoppedAt')||n('lastRegistrationAt')>n('setupSettledAt')
   ||n('lastRegistrationAt')>n('admissionStoppedAt'))return result('LATE_SETUP_OR_REGISTRATION');
  if(n('pendingSetup')!==0||n('pendingOperations')!==0||n('activeModelHandlers')!==0
   ||d.writersClosed!==true||d.modelClosed!==true||d.outerOwnerSettled!==true)return result('OPERATION_NOT_SETTLED');
  if(d.identityState!=='MATCHED'||d.sourceStable!==true
   ||n('spawnedGroups')!==n('registeredGroups')||n('registeredGroups')!==n('closedGroups')
   ||n('totalMaxActive')<Math.max(n('slot1MaxActive'),n('slot2MaxActive'))||n('totalMaxActive')>n('spawnedGroups')
   ||(n('spawnedGroups')>0&&(d.registryState!=='PRESENT'||d.noSpawnProven!==false||n('totalMaxActive')===0))
   ||(n('spawnedGroups')===0&&(d.registryState!=='ABSENT_NO_SPAWN'||d.noSpawnProven!==true)))return result('IDENTITY_UNKNOWN');
  if(n('unclaimedDatabaseCreates')!==0||n('unknownDatabaseResources')!==0||d.databaseCleanupMode!=='NONFORCE'
   ||returned.length!==registered.length||registered.length!==dropped.length
   ||returned.some(name=>!registered.includes(name))||dropped.some(name=>!registered.includes(name)))return result('IDENTITY_UNKNOWN');
  const ordered=['startedAt','setupSettledAt','admissionStoppedAt','writersSettledAt','snapshotAt',
   'poolsClosedAt','clusterRecheckedAt','sessionsAbsentAt','droppedAt','adminsClosedAt','sourceRecheckedAt','joinedAt'];
  if(ordered.some((key,index)=>index>0&&n(key)<n(ordered[index-1]))
   ||n('lastRegistrationAt')<n('startedAt')||n('modelDrainedAt')<n('admissionStoppedAt')
   ||n('processesSettledAt')<n('admissionStoppedAt')
   ||n('snapshotAt')<n('modelDrainedAt')||n('snapshotAt')<n('processesSettledAt'))return result('SNAPSHOT_ORDER_INVALID');
  return result('MATCHED_SUPPLIED_METADATA');
 }catch{return result('CONTRACT_INVALID',failure);}
}

const publicNames=['chat-only-v1-result.json','source-identity.json','assertion-results.json'];
const publicReferenceKeys=['sourceCommit','sourceTree','lockSha256','codeSha256','codeReviewSha256','codeOrigin','publicDirectory',
 'ownerUid','writersSettledAt','finalizedAt'];
/** Validate supplied candidate public bytes and identity metadata only. Never
 * reads files, publishes, redacts arbitrary logs, or attests their provenance. */
export function validatePublicProjection(reference:unknown,suppliedFiles:unknown){
 try{
  const r=record(reference,publicReferenceKeys),files=list(suppliedFiles,3);
  if(!r||!files||files.length!==3||!hex(r.sourceCommit,40)||!hex(r.sourceTree,40)
   ||!hex(r.lockSha256,64)||!hex(r.codeSha256,64)||!hex(r.codeReviewSha256,64)
   ||!path(r.publicDirectory)||!integer(r.ownerUid)||!integer(r.writersSettledAt)||!integer(r.finalizedAt)
   ||r.finalizedAt<r.writersSettledAt)return result('PUBLIC_PROJECTION_INVALID');
  if(r.codeOrigin!=='REVIEWED_RUNTIME_INDEPENDENT_TRANSFORM')return result('CODE_PROVENANCE_UNREVIEWED');
  const seen=new Set();let total=0;
  for(const value of files){
   const f=record(value,['name','reference','before','after','utf8Body']);
   if(!f||typeof f.name!=='string'||!publicNames.includes(f.name)||seen.has(f.name)
    ||typeof f.utf8Body!=='string'||f.utf8Body.length>metadataLimits.publicFileBytes)return result('PUBLIC_PROJECTION_INVALID');
   seen.add(f.name);
   const size=Buffer.byteLength(f.utf8Body);total+=size;
   if(size>metadataLimits.publicFileBytes||total>metadataLimits.publicAggregateBytes)return result('PUBLIC_PROJECTION_INVALID');
   const identity=file(f.reference);
   if(!identity||identity.path!==r.publicDirectory+'/'+f.name||identity.purpose!=='PUBLIC_ARTIFACT'||identity.ownerUid!==r.ownerUid||identity.size!==size
    ||identity.sha256!==createHash('sha256').update(f.utf8Body).digest('hex')
    ||validateFileWitness(f.reference,f.before,f.after).status!=='MATCHED_SUPPLIED_METADATA')return result('PUBLIC_PROJECTION_INVALID');
   const common=['version','profile','scope'];
   const extra=f.name==='source-identity.json'?['sourceCommit','sourceTree','lockSha256','codeSha256','codeReviewSha256','runtimeIndependent']
    :f.name==='assertion-results.json'?['source','service','cluster','tool','finalization']
    :['slot1SyntheticCalls','slot2SyntheticCalls','workEffects','executionAuthorized','runtimeQualified','artifactPublicationAuthorized'];
   const body=record(JSON.parse(f.utf8Body),[...common,...extra]);
   if(!body||body.version!==1||body.profile!=='CHAT_ONLY_V1'||body.scope!=='SUPPLIED_METADATA_ONLY')return result('PUBLIC_PROJECTION_INVALID');
   // Fixed serialization also excludes duplicate keys and hidden discarded text.
   const canonical=JSON.stringify(body);
   if(f.utf8Body!==canonical&&f.utf8Body!==canonical+'\n')return result('PUBLIC_PROJECTION_INVALID');
   if(f.name==='source-identity.json'){
    if(['sourceCommit','sourceTree','lockSha256','codeSha256','codeReviewSha256'].some(key=>body[key]!==r[key])
     ||body.runtimeIndependent!==true)return result('CODE_PROVENANCE_UNREVIEWED');
   }else if(f.name==='assertion-results.json'){
    if(extra.some(key=>!['SUPPLIED_MATCH','UNKNOWN_HOLD'].includes(body[key] as string)))return result('PUBLIC_PROJECTION_INVALID');
   }else if(!integer(body.slot1SyntheticCalls)||body.slot1SyntheticCalls>3||!integer(body.slot2SyntheticCalls)
    ||body.slot2SyntheticCalls>3||body.workEffects!==0||body.executionAuthorized!==false
    ||body.runtimeQualified!==false||body.artifactPublicationAuthorized!==false)return result('PUBLIC_PROJECTION_INVALID');
  }
  return result('MATCHED_SUPPLIED_METADATA');
 }catch{return result('PUBLIC_PROJECTION_INVALID');}
}
