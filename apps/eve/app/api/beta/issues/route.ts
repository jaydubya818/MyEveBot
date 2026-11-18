import {installedMissionControlEligibility} from '../../../../lib/missioncontrol/installed-eligibility.ts';
import { z } from 'zod';
import { authenticateWebPrincipal,requireSameOrigin } from '../../../../lib/web-auth.ts';
import { betaIntegration } from '../../../../lib/beta-integration/runtime.ts';
import { BetaFeedback } from '../../../../lib/beta-feedback.ts';
import { boundedJson } from '../../../../lib/relay/client.ts';
import { WorkError } from '../../../../lib/engineering/types.ts';
import { hostedProfileFromEnv } from '../../../../lib/qualification/hosted-profile.ts';

const headers={'cache-control':'no-store'};
/**
 * Reports are stored in this installation's own database. A hosted private-beta installation is enrolled through its hosted profile
 * and has no legacy installed-MissionControl client configuration, so its own owner is eligible by that profile; every other
 * installation keeps the installed-MissionControl enrollment check. A failed check is "not set up", never an exception.
 */
async function feedbackEligible(ownerId:string):Promise<boolean>{
  try{const hosted=hostedProfileFromEnv();if(hosted&&hosted.ownerId===ownerId)return true;}catch{/* malformed profile: fall through to the enrollment check */}
  try{return !!await installedMissionControlEligibility(ownerId);}catch{return false;}
}
async function handle(request:Request) {
  if(process.env.MYEVE_MISSIONCONTROL_MODE!=='APPROVED_NONPRODUCTION')return Response.json({error:'Beta feedback is not enabled.'},{status:503,headers});
  try{
    const principal=await authenticateWebPrincipal(request,{...process.env,NODE_ENV:'production'});
    if(!principal)return Response.json({error:'Sign in to view or send feedback.'},{status:401,headers});
    if(principal.id!==process.env.MYEVE_OWNER_ID||requireSameOrigin(request))return Response.json({error:'Use your own workspace to send feedback.'},{status:403,headers});
    if(!await feedbackEligible(principal.id))return Response.json({error:'Beta feedback setup is unavailable.'},{status:503,headers});
    const feedback=new BetaFeedback(betaIntegration().pool,principal.id);
    if(request.method==='GET')return Response.json(await feedback.list(new URL(request.url).searchParams.get('before')??undefined),{headers});
    const report=await feedback.save(await boundedJson(new Response(request.body),16000));
    return Response.json({report},{status:201,headers});
  }catch(error){
    if(!(error instanceof WorkError)&&!(error instanceof z.ZodError))console.error('beta_feedback_failed',{method:request.method,name:error instanceof Error?error.name:'unknown',message:(error instanceof Error?error.message:String(error)).replace(/[^\x20-\x7e]/g,' ').slice(0,300)});
    return Response.json({error:error instanceof WorkError?error.message:error instanceof z.ZodError?'Check the report fields and try again.':request.method==='GET'?'Your reports could not be loaded.':'Could not confirm the saved report. Your report ID can safely be retried.'},
    {status:error instanceof WorkError?error.status:error instanceof z.ZodError?400:503,headers});}
}
export const GET=handle;
export const POST=handle;
