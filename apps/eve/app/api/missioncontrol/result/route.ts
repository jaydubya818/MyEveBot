import { capabilityWorkDatabase } from '../../../../lib/capability-control/admission.ts';
import { MissionControlBindings } from '../../../../lib/missioncontrol/permit-store.ts';
import { installedMissionControlConfig } from '../../../../lib/missioncontrol/installed-client.ts';
import { authenticateResultRequest,readbackSignature } from '../../../../lib/missioncontrol/result-protocol.ts';
import { missionControlResultReadback } from '../../../../lib/missioncontrol/result-readback.ts';
import { boundedJson } from '../../../../lib/relay/client.ts';
import { WorkStore } from '../../../../lib/engineering/store.ts';
import { createExternalAlphaWorkController } from '../../../../lib/external-alpha/work-action.ts';

export const runtime='nodejs';
export async function POST(request:Request) {
  const headers={'cache-control':'private, no-store','x-content-type-options':'nosniff'};
  try {
    const ownerId=process.env.MYEVE_OWNER_ID;
    if(!ownerId||process.env.MYEVE_MISSIONCONTROL_MODE!=='APPROVED_NONPRODUCTION')
      return Response.json({error:'MissionControl readback is unavailable.'},{status:503,headers});
    const packet=await boundedJson(new Response(request.body),4096),database=capabilityWorkDatabase();
    const enrollment=await new MissionControlBindings(database,ownerId).enrollment();
    const config=installedMissionControlConfig(enrollment,ownerId),input=authenticateResultRequest(packet,enrollment,config.secret);
    const prior=await missionControlResultReadback(database,input);
    const workStore=new WorkStore({scopeKind:'personal',scopeId:ownerId,actorId:ownerId},database);
    // Only the retained, exact Work request is read. Fresh evidence does not
    // mint authority or settle accounting; unavailable evidence stays pending.
    await createExternalAlphaWorkController(workStore).refreshReadback(prior.work).catch(()=>null);
    const document=await missionControlResultReadback(database,input);
    return Response.json({document,signature:readbackSignature(document,'mc-result-readback/v1',config.secret)},{headers});
  }catch{
    return Response.json({error:'The authenticated Result readback is unavailable.'},{status:403,headers});
  }
}
