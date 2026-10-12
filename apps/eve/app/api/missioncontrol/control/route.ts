import { capabilityWorkDatabase } from '../../../../lib/capability-control/admission.ts';
import { WorkStore } from '../../../../lib/engineering/store.ts';
import { createExternalAlphaWorkController } from '../../../../lib/external-alpha/work-action.ts';
import { MissionControlBindings } from '../../../../lib/missioncontrol/permit-store.ts';
import { InstalledMissionControlClient,installedMissionControlConfig } from '../../../../lib/missioncontrol/installed-client.ts';
import { deliverMissionControlControl } from '../../../../lib/missioncontrol/owner-reconciliation.ts';
import { boundedJson } from '../../../../lib/relay/client.ts';

export const runtime='nodejs';
export async function POST(request:Request) {
  const headers={'cache-control':'private, no-store','x-content-type-options':'nosniff'};
  try {
    const ownerId=process.env.MYEVE_OWNER_ID;
    if(!ownerId||process.env.MYEVE_MISSIONCONTROL_MODE!=='APPROVED_NONPRODUCTION')
      return Response.json({error:'MissionControl control delivery is unavailable.'},{status:503,headers});
    const input=await boundedJson(new Response(request.body),8192),database=capabilityWorkDatabase();
    const enrollment=await new MissionControlBindings(database,ownerId).enrollment();
    const config=installedMissionControlConfig(enrollment,ownerId,process.env,'control');
    const store=new WorkStore({scopeKind:'personal',scopeId:ownerId,actorId:ownerId},database);
    await deliverMissionControlControl(store,input,new InstalledMissionControlClient(config),
      {alphaController:()=>createExternalAlphaWorkController(store)});
    // Only the authenticated callback to MissionControl conveys the ACK.
    return Response.json({received:true},{headers});
  }catch{
    return Response.json({error:'The signed control could not be acknowledged.'},{status:403,headers});
  }
}
