import { randomBytes, randomUUID } from 'node:crypto';
import type { WorkStore } from '../engineering/store.ts';
import type { FactoryRuntime } from '../engineering/factory-routing.ts';
import { assertOwnerFactoryConfiguration, ownerFactoryOrigin } from './owner-factory-binding.ts';
import type { Work } from '../engineering/types.ts';
import { assertCanonicalAlphaWork, alphaTasksTupleSha256 } from '../external-alpha/work-tuple.ts';
import { externalAlphaPolicy } from '../external-alpha/policy.ts';
import { admissionActionDigest, parsePolicyMessage } from '../../../../packages/capability-enforcement/src/ordering-wire.ts';
import { verifyExecutionPermit } from './execution-permit.ts';
import { MissionControlBindings } from './permit-store.ts';
import { InstalledMissionControlClient, installedMissionControlConfig } from './installed-client.ts';
import { issueMissionControlSourcePermit } from './capability-source.ts';
import { InstalledRelayLeaseClient, installedRelayLeaseConfig } from './relay-lease-client.ts';

/** Complete fresh admission before the existing controller may reserve money or claim dispatch. */
export async function admitMissionControlExecution(store: WorkStore, work: Work,
  env: NodeJS.ProcessEnv = process.env, send: typeof fetch = fetch) {
  const ownerId=store.principal.scopeId,policy=externalAlphaPolicy(env);
  if(!policy||policy.ownerId!==ownerId||store.principal.scopeKind!=='personal'||store.principal.actorId!==ownerId)
    throw Error('MISSIONCONTROL_EXECUTION_OWNER');
  assertCanonicalAlphaWork(work,{ownerId,repository:policy.repository});
  const bindings=new MissionControlBindings(store.database,ownerId),enrollment=await bindings.enrollment();
  const proof=await requestMissionControlAdmission(store,work,enrollment,alphaTasksTupleSha256,policy.factoryVersion,env,send);
  return bindings.accept(proof.permit,proof.receipt,proof.request,proof.pair,work.id,policy.repository);
}

/** Network proof is acquired before taking database locks. It authorizes nothing
 * until the existing receiving transaction validates and retains it. */
async function requestMissionControlAdmission(store:WorkStore,work:Work,enrollment:Awaited<ReturnType<MissionControlBindings['enrollment']>>,
  tupleSha256:string,factoryVersion:string,env:NodeJS.ProcessEnv,send:typeof fetch) {
  const ownerId=store.principal.scopeId;
  const client=new InstalledMissionControlClient(installedMissionControlConfig(enrollment,ownerId,env),send);
  const relay=new InstalledRelayLeaseClient(installedRelayLeaseConfig(enrollment,env),send);
  const request={commandId:randomUUID(),challenge:randomBytes(32).toString('hex')};
  const tuple={id:work.id,version:work.version,generation:work.generation,tupleSha256};
  const approved=await client.readApproved(tuple,{commandId:randomUUID(),admissionCommandId:request.commandId,challenge:request.challenge});
  const verified=verifyExecutionPermit(approved.permit,enrollment,{ownerId,workId:work.id,workVersion:work.version,
    workGeneration:work.generation,tupleSha256,maxCostMicrousd:Math.round(work.maxCostUsd*1e6),
    maxDurationSeconds:work.maxDurationSeconds});
  if(verified.document.admission.factoryVersion!==factoryVersion)throw Error('MISSIONCONTROL_EXECUTION_FACTORY_CHANGED');
  const challenge=parsePolicyMessage(JSON.parse(approved.capabilityChallenge.message));
  const expectedDigest=await admissionActionDigest({workId:work.id,missionId:verified.document.missionId,generation:work.generation,
    nativeSnapshot:{permitSha256:verified.permitSha256},args:{operation:'enterprise.authorizeAdmission',permitId:verified.document.permitId,
      challenge:request.challenge,commandId:request.commandId}});
  if(challenge.kind!=='CHALLENGE'||challenge.capabilityId!=='enterprise.fleet'||challenge.workId!==work.id
    ||challenge.missionId!==verified.document.missionId||challenge.workGeneration!==work.generation
    ||challenge.actionDigest!==expectedDigest||challenge.budgetMicros!==verified.document.admission.maxCostMicrousd
    ||challenge.expiresAt>verified.document.expiresAt)throw Error('MISSIONCONTROL_EXECUTION_CHALLENGE_DENIED');
  // The canonical source issuer authenticates the receiver's P-256 signature and policy locks.
  const myeve=await issueMissionControlSourcePermit(store.database,enrollment,approved.capabilityChallenge,env);
  const pair={myeve,relay:await relay.issue(myeve)};
  const receipt=await client.authorize(verified.document,verified.permitSha256,pair,request);
  return {permit:verified.envelope,receipt,request,pair,tupleSha256};
}

export type MissionControlAdmissionProof=Awaited<ReturnType<typeof requestMissionControlAdmission>>;
export async function requestOwnerFactoryAdmission(store:WorkStore,work:Work,config:FactoryRuntime,
  env:NodeJS.ProcessEnv=process.env,send:typeof fetch=fetch):Promise<MissionControlAdmissionProof|null> {
  const ownerId=store.principal.scopeId;
  if(!store.database.atomic||store.principal.scopeKind!=='personal'||store.principal.actorId!==ownerId)throw Error('MISSIONCONTROL_EXECUTION_OWNER');
  const origin=await store.database.atomic(async database=>{
    await database.query("SELECT set_config('myeve.missioncontrol_owner',$1,true)",[ownerId]);
    return ownerFactoryOrigin(database,ownerId,work.id);
  });
  if(!origin)return null;
  const enrollment=await new MissionControlBindings(store.database,ownerId).enrollment();
  const tupleSha256=assertOwnerFactoryConfiguration(work,enrollment,config);
  if(origin.work_version!==work.version||origin.work_generation!==work.generation||origin.document.tupleSha256!==tupleSha256)
    throw Error('MISSIONCONTROL_EXECUTION_WORK_CHANGED');
  return requestMissionControlAdmission(store,work,enrollment,tupleSha256,config.connection.factoryVersion,env,send);
}
