import { z } from 'zod';
import { id,digest,enterpriseInput } from './contracts.ts';
import type { WorkStore } from '../engineering/store.ts';
import { externalAlphaPolicy } from '../external-alpha/policy.ts';
import { assertCanonicalAlphaWork,alphaTasksTupleSha256 } from '../external-alpha/work-tuple.ts';
import { MissionControlBindings } from './permit-store.ts';
import { InstalledMissionControlClient,installedMissionControlConfig } from './installed-client.ts';

export const prepareExecutionInput=z.object({operation:z.literal('enterprise.prepare_execution'),proposalId:id,workOrderId:id,
  expectedWorkOrderRevisionId:id,expectedPlanDigest:digest,idempotencyKey:z.string().regex(/^[A-Za-z0-9._:-]{1,160}$/),
  workId:z.string().uuid(),expectedWorkVersion:z.number().int().positive(),expectedWorkGeneration:z.number().int().positive()}).strict();
export const missionControlToolInput=z.union([enterpriseInput,prepareExecutionInput]);
export type MissionControlToolInput=z.infer<typeof missionControlToolInput>;

/** Prepares an inspectable approval request; it cannot reserve or execute Work. */
export async function prepareMissionControlExecution(store:WorkStore,value:unknown,commandId:string,
  env:NodeJS.ProcessEnv=process.env,send:typeof fetch=fetch) {
  const input=prepareExecutionInput.parse(value),ownerId=store.principal.scopeId,policy=externalAlphaPolicy(env);
  if(!policy||policy.ownerId!==ownerId||store.principal.scopeKind!=='personal'||store.principal.actorId!==ownerId)
    throw Error('MISSIONCONTROL_PREPARE_OWNER');
  const bindings=new MissionControlBindings(store.database,ownerId),enrollment=await bindings.enrollment();
  const client=new InstalledMissionControlClient(installedMissionControlConfig(enrollment,ownerId,env),send);
  const work=await store.get(input.workId);
  assertCanonicalAlphaWork(work,{ownerId,repository:policy.repository});
  if(work.version!==input.expectedWorkVersion||work.generation!==input.expectedWorkGeneration||enrollment.factoryVersion!==policy.factoryVersion)
    throw Error('MISSIONCONTROL_PREPARE_WORK_CHANGED');
  return client.prepare({proposalId:input.proposalId,workOrderId:input.workOrderId,expectedWorkOrderRevisionId:input.expectedWorkOrderRevisionId,
    expectedPlanDigest:input.expectedPlanDigest,idempotencyKey:input.idempotencyKey,
    work:{id:work.id,version:work.version,generation:work.generation,tupleSha256:alphaTasksTupleSha256},
    admission:{factoryVersion:enrollment.factoryVersion,executionContractSha256:enrollment.executionContractSha256,
      capabilityPolicySha256:enrollment.capabilityPolicySha256,maxCostMicrousd:Math.round(work.maxCostUsd*1e6),maxDurationSeconds:work.maxDurationSeconds}},commandId);
}
