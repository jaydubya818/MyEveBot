import {issueBackendOrderedPermit} from '../../../../packages/capability-enforcement/src/ordering-source.ts';
import {admissionActionDigest,verifyPolicyMessage,type PolicyKey,type SignedPolicyMessage} from '../../../../packages/capability-enforcement/src/ordering-wire.ts';
import {verifyExecutionPermit,type OwnerEnrollment} from '../missioncontrol/execution-permit.ts';
import {assertOwnerFactoryConfiguration,ownerFactoryOrigin} from '../missioncontrol/owner-factory-binding.ts';
import type {MissionControlAdmissionProof} from '../missioncontrol/admit-execution.ts';
import type {FactoryRuntime} from './factory-routing.ts';
import {WorkStore} from './store.ts';
import {digest} from './factory-producer-protocol.ts';
import {factoryPreparationForGeneration} from './factory-preparation-terminal.ts';

/** The exact native body the capability action authorizes. Cloud V2 sends the projected, source-pinned body. The qualified LOCAL V4 loopback sends the
 * persisted prepare request itself (its base commit and exact repository path are part of the authorized action), pinned to the configured repository path
 * and the qualified local profile. */
export function factoryNativeBody(connection:FactoryRuntime['connection'],request:Record<string,any>):Record<string,any>{
 if('source' in connection){
  const {title,description,kind,acceptanceCriteria,checkCommands,allowedPaths}=request.input;
  return {protocol:connection.protocol,requestId:request.requestId,workId:request.workId,workGeneration:request.workGeneration,
   repository:request.repository,deadline:request.deadline,maxSpendUsd:request.maxSpendUsd,source:connection.source,
   input:{title,description,kind,acceptanceCriteria,checkCommands,allowedPaths}};
 }
 if(!('repositoryPath' in connection)||request.input?.repositoryPath!==connection.repositoryPath||request.input.workerProfile!=='mac')throw Error('FACTORY_SOURCE_PREPARATION');
 return request;
}

/** A Factory destination is distinct from the MissionControl destination. The
 * signed permit adds a necessary policy condition; native admission retains
 * execution authority, accounting, qualification and writer checks. */
export async function issueFactorySourcePermit(store:WorkStore,config:FactoryRuntime,enrollment:OwnerEnrollment,
 backendId:string,signer:PolicyKey,challenge:SignedPolicyMessage,nativeRequest:Record<string,any>,proof:MissionControlAdmissionProof|null){
 const ownerId=store.principal.scopeId,connection=config.connection;
 if(!store.database.atomic||store.principal.scopeKind!=='personal'||store.principal.actorId!==ownerId
  ||ownerId!==enrollment.ownerId||!proof||!backendId||!('source' in connection||'repositoryPath' in connection))throw Error('FACTORY_SOURCE_BINDING');
 return store.database.atomic(async database=>{
  await database.query("SELECT set_config('myeve.missioncontrol_owner',$1,true),set_config('myeve.capability_owner',$1,true),set_config('myeve.capability_installation',$2,true)",[ownerId,enrollment.installationId]);
  const work=await new WorkStore(store.principal,database).get(nativeRequest.workId);
  const generationPreparation=await factoryPreparationForGeneration(new WorkStore(store.principal,database),work.id,work.generation);
  if(generationPreparation?.factory_preparation?.terminal)throw Error('FACTORY_SOURCE_PREPARATION');
  const tuple=assertOwnerFactoryConfiguration(work,enrollment,config);
  const origin=await ownerFactoryOrigin(database,ownerId,work.id);
  if(!origin||origin.work_version!==work.version||origin.work_generation!==work.generation||origin.document.tupleSha256!==tuple)throw Error('FACTORY_SOURCE_BINDING');
  const approved=verifyExecutionPermit(proof.permit,enrollment,{ownerId,workId:work.id,workVersion:work.version,
   workGeneration:work.generation,tupleSha256:tuple,maxCostMicrousd:Math.round(work.maxCostUsd*1e6),maxDurationSeconds:work.maxDurationSeconds});
  if(approved.document.admission.factoryVersion!==config.connection.factoryVersion)throw Error('FACTORY_SOURCE_VERSION');
  const [decision]=await database.query(`SELECT factory_preparation FROM engineering_routing_decisions
    WHERE scope_id=$1 AND scope_kind='personal' AND work_id=$2 AND work_version=$3 AND selected_route='MYFACTORY'`,[ownerId,work.id,work.version]);
  const p=decision?.factory_preparation,request=p?.request;
  if(!request||p.terminal||request.workGeneration!==work.generation||request.requestId!==nativeRequest.requestId)throw Error('FACTORY_SOURCE_PREPARATION');
  const expected=factoryNativeBody(connection,request);
  if(digest(expected)!==digest(nativeRequest))throw Error('FACTORY_SOURCE_PREPARATION');
  const [installation]=await database.query('SELECT organization_id FROM capability_control.installations WHERE id=$1 AND active',[enrollment.installationId]);
  const [destination]=await database.query(`SELECT * FROM capability_control.policy_destinations
    WHERE installation_id=$1 AND owner_id=$2 AND backend_id=$3`,[enrollment.installationId,ownerId,backendId]);
  if(!installation||!destination)throw Error('FACTORY_SOURCE_DESTINATION');
  const message=await verifyPolicyMessage(challenge,{keyId:destination.key_id,jwk:destination.public_jwk});
  const action=await admissionActionDigest({workId:work.id,missionId:approved.document.missionId,generation:work.generation,
   nativeSnapshot:{factoryId:config.connection.factoryId,factoryVersion:config.connection.factoryVersion,sourceDigest:connection.sourceDigest,
    configurationDigest:config.connection.configurationDigest,backendId,incarnation:destination.incarnation,enrollmentVersion:destination.enrollment_version},args:expected});
  if(message.kind!=='CHALLENGE'||message.capabilityId!=='myfactory'||message.agentId!==config.engineering.agentId
   ||message.workId!==work.id||message.workGeneration!==work.generation||message.missionId!==approved.document.missionId
   ||message.actionDigest!==action||message.budgetMicros!==Math.ceil(request.maxSpendUsd*1e6)||message.expiresAt>approved.document.expiresAt)throw Error('FACTORY_SOURCE_CHALLENGE');
  return issueBackendOrderedPermit({query:async(sql:string,values?:unknown[])=>({rows:await database.query(sql,values)})},challenge,
   {ownerId,organizationId:installation.organization_id,installationId:enrollment.installationId,agentId:config.engineering.agentId,environment:'qualification'},backendId,signer);
 });
}
