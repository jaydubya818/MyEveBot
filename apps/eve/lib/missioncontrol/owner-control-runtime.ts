import {randomUUID} from 'node:crypto';
import type {FactoryWorkDriver} from '../engineering/factory-work-driver.ts';
import type {WorkStore} from '../engineering/store.ts';
import {workSpendV2Schema,validateSpendBinding} from '../engineering/factory-spend.ts';
import {readJourneyAccounting} from '../engineering/journey-accounting.ts';
import {MissionControlBindings} from './permit-store.ts';
import {ownerFactoryOrigin,hasMissionControlEnrollment} from './owner-factory-binding.ts';
import {InstalledMissionControlClient,installedMissionControlConfig} from './installed-client.ts';
import {controlDeliverySchema} from './control-runtime.ts';

type ControlClient=Pick<InstalledMissionControlClient,'readControl'|'acknowledgeControl'>;
/** Uses the original owner Factory writer. ACK never settles UNKNOWN or creates a stop verdict. */
export async function applyOwnerFactoryControl(store:WorkStore,driver:Pick<FactoryWorkDriver,'store'|'stopRun'>,value:unknown,client:ControlClient) {
  const input=controlDeliverySchema.parse(value),d=input.control.document,ownerId=store.principal.scopeId;
  if(store.principal.scopeKind!=='personal'||store.principal.actorId!==ownerId||d.ownerId!==ownerId
    ||driver.store.principal.scopeId!==ownerId)throw Error('MISSIONCONTROL_CONTROL_OWNER');
  const bindings=new MissionControlBindings(store.database,ownerId);
  const ack=await bindings.fence(d.permitId,input.control,input.controlDigest);
  let cleanup:'PENDING_BACKEND'|'CONFIRMED'='PENDING_BACKEND';
  try {
    const [run]=await store.database.query(`SELECT r.*,d.factory_observation FROM engineering_route_runs r
      JOIN engineering_routing_decisions d ON d.id=r.decision_id WHERE r.scope_id=$1 AND r.scope_kind='personal'
      AND r.work_id=$2 AND r.work_version=$3 AND r.work_generation=$4 AND r.missioncontrol_binding->>'permitId'=$5`,
      [ownerId,d.work.id,d.work.version,d.work.generation,d.permitId]);
    // Absence of a writer does not prove a remotely prepared resource was removed.
    if(run){
      if(d.operation==='revoke')await driver.stopRun(d.work.id,run.id);
      const [current]=await store.database.query(`SELECT r.*,d.factory_observation,d.admission_authority_snapshot,EXISTS(SELECT 1 FROM engineering_direct_verification_jobs j
          WHERE j.scope_id=r.scope_id AND j.scope_kind=r.scope_kind AND j.work_id=r.work_id
          AND j.route_run_id=r.id AND j.status IN('QUEUED','RUNNING','RECOVERY_REQUIRED')) AS verification_pending FROM engineering_route_runs r
        JOIN engineering_routing_decisions d ON d.id=r.decision_id WHERE r.id=$1 AND r.scope_id=$2`,[run.id,ownerId]);
      const observation=current?.factory_observation,spend=workSpendV2Schema.safeParse(observation?.value?.spend);
      const identity=observation?.value?.identity,original=current?.missioncontrol_binding?.factoryBinding;
      const accounting=await readJourneyAccounting(store,d.work.id);
      if(spend.success)validateSpendBinding(spend.data,{workId:d.work.id,workGeneration:d.work.generation,requestId:original?.requestId,
        workOrderId:original?.workOrderId,deadline:current.admission_authority_snapshot?.contract?.deadline,
        dispatchIdentity:current.dispatch_identity,remoteRunId:original?.runId,factoryVersion:original?.factoryVersion});
      if(!current?.verification_pending&&current?.dispatch_state==='TERMINAL'&&current.quiescence&&current.fenced_at
        &&accounting.coverage==='COMPLETE'&&accounting.unknownExposureMicrousd===0&&accounting.reservedMicrousd===0
        &&identity?.runId===current.id&&identity?.workId===d.work.id&&identity?.workGeneration===d.work.generation
        &&identity?.factoryId===original?.factoryId&&identity?.factoryVersion===original?.factoryVersion
        &&identity?.requestId===original?.requestId&&identity?.remoteRunId===original?.runId&&identity?.workOrderId===original?.workOrderId
        &&identity?.dispatchIdentity===current.dispatch_identity&&identity?.writerGeneration===Number(current.writer_generation)
        &&['COMPLETED','FAILED','CANCELLED','NOT_DISPATCHED'].includes(observation.value.state)&&observation.value.quiescent===true&&Date.parse(observation.backendObservedAt)<=Date.now()&&Date.parse(observation.backendObservedAt)>Date.now()-30000
        &&spend.success&&spend.data.status==='KNOWN'&&spend.data.accountingComplete
        &&spend.data.retainedMicrousd===0&&spend.data.unknownExposureMicrousd===0)cleanup='CONFIRMED';
    }
  }catch{ /* Fence survives; failed transport or unknown accounting remains pending. */ }
  const result={...ack,cleanup};
  const response=await client.acknowledgeControl(result,randomUUID());
  await bindings.retainControlAcknowledgment(result,response);
  return result;
}

/** Worker entry: before any further owner Work step, consume the exact original permit's control.
 * A failed read prevents a fresh effect; stop/reconcile remains callable independently. */
export async function pollOwnerFactoryWorkControl(store:WorkStore,driver:Pick<FactoryWorkDriver,'store'|'stopRun'>,workId:string,
  env:NodeJS.ProcessEnv=process.env,providedClient?:ControlClient) {
  const ownerId=store.principal.scopeId;
  if(!store.database.atomic){
    if(!await hasMissionControlEnrollment(store.database,ownerId))return null;
    throw Error('MISSIONCONTROL_TRANSACTION_REQUIRED');
  }
  const permits=await store.database.atomic(async database=>{
    await database.query("SELECT set_config('myeve.missioncontrol_owner',$1,true)",[ownerId]);
    if(!await ownerFactoryOrigin(database,ownerId,workId))return null;
    return database.query(`WITH writers AS (SELECT p.permit_id,r.writer_generation,
      row_number() OVER(ORDER BY r.writer_generation DESC) AS position,attempt.attempted_at,p.created_at
      FROM missioncontrol_execution_permits p
      JOIN engineering_route_runs r ON r.scope_id=p.owner_id AND r.work_id=p.work_id
       AND r.missioncontrol_binding->>'permitId'=p.permit_id
      LEFT JOIN missioncontrol_control_attempts attempt ON attempt.owner_id=p.owner_id AND attempt.permit_id=p.permit_id
      WHERE p.owner_id=$1 AND p.work_id=$2), candidates AS (
      SELECT * FROM writers w WHERE position=1 OR EXISTS(SELECT 1 FROM missioncontrol_permit_controls c
        WHERE c.owner_id=$1 AND c.permit_id=w.permit_id
        AND c.sequence=(SELECT max(latest.sequence) FROM missioncontrol_permit_controls latest
          WHERE latest.owner_id=c.owner_id AND latest.permit_id=c.permit_id)
        AND NOT EXISTS(SELECT 1 FROM missioncontrol_control_acknowledgments a WHERE a.owner_id=c.owner_id
          AND a.permit_id=c.permit_id AND a.sequence=c.sequence AND a.control_digest=c.control_digest AND a.cleanup='CONFIRMED')))
      SELECT permit_id,position FROM candidates ORDER BY position=1 DESC,COALESCE(attempted_at,created_at),permit_id LIMIT 100`,[ownerId,workId]);
  });
  if(!permits||!permits.length)return null;
  const bindings=new MissionControlBindings(store.database,ownerId),enrollment=await bindings.enrollment();
  const client=providedClient??new InstalledMissionControlClient(installedMissionControlConfig(enrollment,ownerId,env,'control'));
  let currentResult=null,currentFailure:unknown;
  for(const permit of permits){
    try{
      const permitId=String(permit.permit_id);
      await bindings.recordControlAttempt(permitId);
      const value=await client.readControl(permitId,randomUUID());
      if(value&&typeof value==='object'&&'status' in value&&value.status==='NO_CONTROL'&&Object.keys(value).length===1)continue;
      const result=await applyOwnerFactoryControl(store,driver,value,client);
      if(Number(permit.position)===1)currentResult=result;
    }catch(error){
      // Retry old cleanup fairly without blocking delivery to other old writers.
      // The current writer must still pass its own read before any fresh effect.
      if(Number(permit.position)===1)currentFailure=error;
    }
  }
  if(currentFailure)throw currentFailure;
  return currentResult;
}
