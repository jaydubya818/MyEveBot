import {installedMissionControlEligibility} from '../../../../lib/missioncontrol/installed-eligibility.ts';
import { z } from 'zod';
import { authenticateWebPrincipal,requireSameOrigin } from '../../../../lib/web-auth.ts';
import { betaIntegration } from '../../../../lib/beta-integration/runtime.ts';
import { BetaFeedback } from '../../../../lib/beta-feedback.ts';
import { boundedJson } from '../../../../lib/relay/client.ts';
import { WorkError } from '../../../../lib/engineering/types.ts';

const headers={'cache-control':'no-store'};
async function handle(request:Request) {
  if(process.env.MYEVE_MISSIONCONTROL_MODE!=='APPROVED_NONPRODUCTION')return Response.json({error:'Beta feedback is not enabled.'},{status:503,headers});
  try{
    const principal=await authenticateWebPrincipal(request,{...process.env,NODE_ENV:'production'});
    if(!principal)return Response.json({error:'Sign in to view or send feedback.'},{status:401,headers});
    if(principal.id!==process.env.MYEVE_OWNER_ID||requireSameOrigin(request))return Response.json({error:'Use your own workspace to send feedback.'},{status:403,headers});
    if(!await installedMissionControlEligibility(principal.id))return Response.json({error:'Beta feedback setup is unavailable.'},{status:503,headers});
    const feedback=new BetaFeedback(betaIntegration().pool,principal.id);
    if(request.method==='GET')return Response.json(await feedback.list(new URL(request.url).searchParams.get('before')??undefined),{headers});
    const report=await feedback.save(await boundedJson(new Response(request.body),16000));
    return Response.json({report},{status:201,headers});
  }catch(error){return Response.json({error:error instanceof WorkError?error.message:error instanceof z.ZodError?'Check the report fields and try again.':'Could not confirm the saved report. Your report ID can safely be retried.'},
    {status:error instanceof WorkError?error.status:error instanceof z.ZodError?400:503,headers});}
}
export const GET=handle;
export const POST=handle;
