import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { WorkStore } from '../engineering/store.ts';
import type { ExternalAlphaWorkController } from '../external-alpha/work-controller.ts';
import { readExternalAlphaWork } from '../external-alpha/work-readback.ts';
import { MissionControlBindings } from './permit-store.ts';
import { InstalledMissionControlClient,installedMissionControlConfig } from './installed-client.ts';
import { permitControlEnvelopeSchema } from './execution-permit.ts';

export const controlDeliverySchema=z.object({status:z.literal('CONTROL'),control:permitControlEnvelopeSchema,
  controlDigest:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
const controlReadSchema=z.union([z.object({status:z.literal('NO_CONTROL')}).strict(),controlDeliverySchema]);
type ControlClient=Pick<InstalledMissionControlClient,'readControl'|'acknowledgeControl'>;

/** A control only reduces authority. Retain the fence before any network ACK.
 * Failed cleanup keeps its original reservation and reports pending, never success. */
export async function applyMissionControlControl(store:WorkStore,controller:ExternalAlphaWorkController,
  value:unknown,client:ControlClient) {
  const input=controlDeliverySchema.parse(value),document=input.control.document;
  if(store.principal.scopeKind!=='personal'||store.principal.actorId!==store.principal.scopeId
    ||store.principal.scopeId!==document.ownerId||controller.authority.policy.ownerId!==document.ownerId)
    throw Error('MISSIONCONTROL_CONTROL_OWNER');
  const bindings=new MissionControlBindings(store.database,document.ownerId);
  const acknowledgment=await bindings.fence(document.permitId,input.control,input.controlDigest);
  let cleanup:'PENDING_BACKEND'|'CONFIRMED'='PENDING_BACKEND';
  try {
    const work=await store.get(document.work.id),authority=await controller.authority.forWork(work.id);
    if(authority&&(authority.workVersion!==document.work.version||authority.workGeneration!==document.work.generation))
      throw Error('MISSIONCONTROL_CONTROL_WORK_CHANGED');
    if(document.operation==='revoke')await controller.stop(work.id,{work});
    const current=await controller.authority.forWork(work.id);
    const readback=await readExternalAlphaWork(store,work);
    if(!current||(current.state==='CANCELLED'&&!current.receipt)
      ||(['COMPLETED','CANCELLED'].includes(current.state)&&readback?.accounting.unknownMicrousd===0
        &&(readback.factoryOutcome||(readback.result?.cleanupConfirmed&&readback.result.settlementState==='SETTLED'))))
      cleanup='CONFIRMED';
  }catch{
    // The receiving fence remains committed when the resource is unavailable.
  }
  const result={...acknowledgment,cleanup};
  const response=await client.acknowledgeControl(result,randomUUID());
  await bindings.retainControlAcknowledgment(result,response);
  return result;
}

export async function pollMissionControlControls(store:WorkStore,controller:ExternalAlphaWorkController,
  env:NodeJS.ProcessEnv=process.env,providedClient?:ControlClient) {
  const bindings=new MissionControlBindings(store.database,store.principal.scopeId),enrollment=await bindings.enrollment();
  const client=providedClient??new InstalledMissionControlClient(installedMissionControlConfig(enrollment,store.principal.scopeId,env,'control'));
  const permits=await bindings.controlCandidates();
  const outcomes=[],failures:string[]=[],failureCodes:{permitId:string;code:string}[]=[];
  for(const permitId of permits){
    try{
      // Persist before I/O so a failed or interrupted attempt cannot monopolize
      // the bounded page. UNKNOWN remains eligible and is never settled here.
      await bindings.recordControlAttempt(permitId);
      const input=controlReadSchema.parse(await client.readControl(permitId,randomUUID()));
      if(input.status==='CONTROL')outcomes.push(await applyMissionControlControl(store,controller,input,client));
    }catch(error){
      failures.push(permitId);
      const code=error instanceof z.ZodError?'CONTROL_RESPONSE_INVALID':error instanceof Error
        && ['MISSIONCONTROL_BINDING_DENIED','MISSIONCONTROL_CONTROL_OWNER','MISSIONCONTROL_CONTROL_WORK_CHANGED'].includes(error.message)
        ?error.message:'CONTROL_DELIVERY_UNAVAILABLE';
      failureCodes.push({permitId,code});
    }
  }
  return {checked:permits.length,pageFull:permits.length===100,outcomes,failures,failureCodes};
}
