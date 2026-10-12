import { randomBytes, randomUUID } from 'node:crypto';
import type { WorkStore } from '../engineering/store.ts';
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
  const client=new InstalledMissionControlClient(installedMissionControlConfig(enrollment,ownerId,env),send);
  const relay=new InstalledRelayLeaseClient(installedRelayLeaseConfig(enrollment,env),send);
  const request={commandId:randomUUID(),challenge:randomBytes(32).toString('hex')};
  const tuple={id:work.id,version:work.version,generation:work.generation,tupleSha256:alphaTasksTupleSha256};
  const approved=await client.readApproved(tuple,{commandId:randomUUID(),admissionCommandId:request.commandId,challenge:request.challenge});
  const verified=verifyExecutionPermit(approved.permit,enrollment,{ownerId,workId:work.id,workVersion:work.version,
    workGeneration:work.generation,tupleSha256:alphaTasksTupleSha256,maxCostMicrousd:Math.round(work.maxCostUsd*1e6),
    maxDurationSeconds:work.maxDurationSeconds});
  if(verified.document.admission.factoryVersion!==policy.factoryVersion)throw Error('MISSIONCONTROL_EXECUTION_FACTORY_CHANGED');
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
  return bindings.accept(verified.envelope,receipt,request,pair,work.id,policy.repository);
}
