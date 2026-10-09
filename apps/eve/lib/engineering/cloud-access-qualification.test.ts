import {describe,it,expect,vi} from 'vitest';
import {qualifyCloudAccess,sofieCloudProject} from './cloud-access-qualification.ts';
const oidc='eyJhbGciOiJub25lIn0.'+Buffer.from(JSON.stringify({project_id:'prj_XU7fJW735PtsnKoAYtGfzdnsotIB',owner_id:'team_p8z8exJRTGfOPk1GC9vUOpv3',environment:'preview',exp:Math.floor(Date.now()/1000)+300})).toString('base64url')+'.synthetic-test-signature';
vi.mock('@vercel/oidc',()=>({getVercelOidcToken:async()=>oidc}));
const env={VERCEL:'1',VERCEL_PROJECT_ID:sofieCloudProject,VERCEL_ENV:'preview',VERCEL_AUTOMATION_BYPASS_SECRET:'v'.repeat(64),SOFIE_CLOUD_QUALIFICATION_TOKEN:'o'.repeat(64),FACTORY_SOFIE_STAGING_TOKEN:'t'.repeat(64),FACTORY_STAGING_ORIGIN:'https://myfactory-cloud-staging-test-jaydubya818.vercel.app'};
const request=(token=env.SOFIE_CLOUD_QUALIFICATION_TOKEN)=>new Request('https://sofie.invalid/api/cloud-qualification/access',{method:'POST',headers:{authorization:'Bearer '+token}});
describe('cloud access boundary',()=>{
 it('denies wrong operator/project/production before any outbound request',async()=>{
  const send=vi.fn();
  expect((await qualifyCloudAccess(request('wrong'),env,send)).status).toBe(401);
  expect((await qualifyCloudAccess(request(),{...env,VERCEL_ENV:'production'},send)).status).toBe(404);
  expect((await qualifyCloudAccess(request(),{...env,VERCEL_PROJECT_ID:'production'},send)).status).toBe(404);
  expect(send).not.toHaveBeenCalled();
 });
 it('separates provider access from application and Work authority without disclosing secrets',async()=>{
  const calls: RequestInit[]=[];
  const send=vi.fn(async(_url:unknown,init?:RequestInit)=>{calls.push(init!);const n=calls.length;return n===1?new Response('',{status:302,headers:{location:'https://vercel.com/sso-api'}}):Response.json(n===3?{admission:'DISABLED',qualificationOnly:true}:{error:n===5?'WORK_AUTHORITY_DENIED':'UNAUTHORIZED'},{status:n===3?200:n===5?403:401});}) as typeof fetch;
  const response=await qualifyCloudAccess(request(),env,send),text=await response.text();
  expect(response.status).toBe(200);expect(JSON.parse(text).passed).toBe(true);expect(calls).toHaveLength(5);
  expect(new Headers(calls[0].headers).has('x-vercel-trusted-oidc-idp-token')).toBe(false);
  expect(new Headers(calls[1].headers).has('authorization')).toBe(false);
  expect(calls.every(c=>c.redirect==='manual')).toBe(true);
  for(const key of ['SOFIE_CLOUD_QUALIFICATION_TOKEN','FACTORY_SOFIE_STAGING_TOKEN'] as const)expect(text).not.toContain(env[key]);
 });
 it('does not label service errors or leaked credential responses as PASS',async()=>{
  const fail=await qualifyCloudAccess(request(),env,async()=>Response.json({error:'CLOUD_WORK_UNAVAILABLE'},{status:503}));expect(fail.status).toBe(409);
  const leak=await qualifyCloudAccess(request(),env,async()=>new Response(oidc));expect(leak.status).toBe(503);expect(await leak.text()).not.toContain(oidc);
  const runtimeLeak=await qualifyCloudAccess(request(),env,async()=>new Response(env.VERCEL_AUTOMATION_BYPASS_SECRET));expect(runtimeLeak.status).toBe(503);expect(await runtimeLeak.text()).not.toContain(env.VERCEL_AUTOMATION_BYPASS_SECRET);
 });
});
