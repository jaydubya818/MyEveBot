import {randomUUID} from 'node:crypto';
import {WorkStore,type WorkDatabase} from '../engineering/store.ts';
import type {FactoryWorkDriver} from '../engineering/factory-work-driver.ts';
import {capabilityWorkDatabase} from '../capability-control/admission.ts';
import {MissionControlBindings} from './permit-store.ts';
import {InstalledMissionControlClient,installedMissionControlConfig} from './installed-client.ts';
import {applyOwnerFactoryControl} from './owner-control-runtime.ts';
import {applyMissionControlControl,controlDeliverySchema} from './control-runtime.ts';
import type {ExternalAlphaWorkController} from '../external-alpha/work-controller.ts';

type Driver=Pick<FactoryWorkDriver,'store'|'stopRun'>;
type Client=Pick<InstalledMissionControlClient,'readControl'|'acknowledgeControl'>;
/** Constructing a unavailable runtime must not precede retaining a signed fence. */
function recoveryDriver(store:WorkStore):Driver {
  return {store,stopRun:async(id,run,reason)=>{
    const {factoryRuntime}=await import('../engineering/factory-runtime.ts');
    return (await factoryRuntime(store)).stopRun(id,run,reason);
  }};
}

/** Bounded fair retries cover idle and terminal Work, even after permit expiry.
 * No Work submission, dispatch, verification retry or new authority is available here. */
export async function pollOwnerFactoryControls(store:WorkStore,driver:Driver,client:Client) {
  if(store.principal.scopeKind!=='personal'||store.principal.actorId!==store.principal.scopeId
    ||driver.store.principal.scopeId!==store.principal.scopeId)throw Error('MISSIONCONTROL_CONTROL_OWNER');
  const bindings=new MissionControlBindings(store.database,store.principal.scopeId),permits=await bindings.controlCandidates('owner');
  const outcomes=[],failures:string[]=[];
  for(const permitId of permits){
    try {
      await bindings.recordControlAttempt(permitId);
      const value=await client.readControl(permitId,randomUUID());
      if(value&&typeof value==='object'&&'status' in value&&value.status==='NO_CONTROL'&&Object.keys(value).length===1)continue;
      outcomes.push(await applyOwnerFactoryControl(store,driver,value,client));
    }catch{failures.push(permitId);}
  }
  return {checked:permits.length,pageFull:permits.length===100,outcomes,failures};
}

export async function runOwnerFactoryReconciliation(deps:{env?:NodeJS.ProcessEnv;database?:WorkDatabase;driver?:Driver;client?:Client}={}) {
  const env=deps.env??process.env,ownerId=env.MYEVE_OWNER_ID;
  if(!ownerId||env.MYEVE_MISSIONCONTROL_MODE!=='APPROVED_NONPRODUCTION')return {checked:0,inactive:true as const};
  const database=deps.database??capabilityWorkDatabase(),bindings=new MissionControlBindings(database,ownerId),enrollment=await bindings.enrollment();
  const client=deps.client??new InstalledMissionControlClient(installedMissionControlConfig(enrollment,ownerId,env,'control'));
  const store=new WorkStore({scopeKind:'personal',scopeId:ownerId,actorId:ownerId},database);
  return pollOwnerFactoryControls(store,deps.driver??recoveryDriver(store),client);
}

/** The signed callback shares one wire contract. Retained origin determines its backend. */
export async function deliverMissionControlControl(store:WorkStore,value:unknown,client:Client,
  deps:{ownerDriver?:Driver;alphaController:()=>ExternalAlphaWorkController}) {
  const input=controlDeliverySchema.parse(value),d=input.control.document,ownerId=store.principal.scopeId;
  if(!store.database.atomic||store.principal.scopeKind!=='personal'||store.principal.actorId!==ownerId||d.ownerId!==ownerId)
    throw Error('MISSIONCONTROL_CONTROL_OWNER');
  const ownerOrigin=await store.database.atomic(async database=>{
    await database.query("SELECT set_config('myeve.missioncontrol_owner',$1,true)",[ownerId]);
    return (await database.query(`SELECT 1 FROM missioncontrol_owner_work_origins WHERE owner_id=$1 AND work_id=$2
      AND work_version=$3 AND work_generation=$4 AND document->>'tupleSha256'=$5 LIMIT 1`,
      [ownerId,d.work.id,d.work.version,d.work.generation,d.work.tupleSha256])).length>0;
  });
  return ownerOrigin?applyOwnerFactoryControl(store,deps.ownerDriver??recoveryDriver(store),input,client)
    :applyMissionControlControl(store,deps.alphaController(),input,client);
}
