import {describe,it,expect,vi} from 'vitest';
import {qualifyCloudAccess,sofieCloudProject} from './cloud-access-qualification.ts';
const env={VERCEL_PROJECT_ID:sofieCloudProject,VERCEL_ENV:'preview',SOFIE_CLOUD_QUALIFICATION_TOKEN:'o'.repeat(64),FACTORY_SOFIE_STAGING_TOKEN:'t'.repeat(64),FACTORY_STAGING_PROTECTION_BYPASS:'b'.repeat(64),FACTORY_STAGING_ORIGIN:'https://myfactory-cloud-staging-test-jaydubya818.vercel.app'};
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
  const send=vi.fn(async(_url:unknown,init?:RequestInit)=>{calls.push(init!);const n=calls.length;return n===1?new Response('',{status:302}):Response.json(n===3?{admission:'DISABLED',qualificationOnly:true}:{error:n===5?'WORK_AUTHORITY_DENIED':'UNAUTHORIZED'},{status:n===3?200:n===5?403:401});}) as typeof fetch;
  const response=await qualifyCloudAccess(request(),env,send),text=await response.text();
  expect(response.status).toBe(200);expect(JSON.parse(text).passed).toBe(true);expect(calls).toHaveLength(5);
  expect(new Headers(calls[0].headers).has('x-vercel-protection-bypass')).toBe(false);
  expect(new Headers(calls[1].headers).has('authorization')).toBe(false);
  expect(calls.every(c=>c.redirect==='manual')).toBe(true);
  for(const key of ['SOFIE_CLOUD_QUALIFICATION_TOKEN','FACTORY_SOFIE_STAGING_TOKEN','FACTORY_STAGING_PROTECTION_BYPASS'] as const)expect(text).not.toContain(env[key]);
 });
 it('does not label service errors or leaked credential responses as PASS',async()=>{
  const fail=await qualifyCloudAccess(request(),env,async()=>Response.json({error:'CLOUD_WORK_UNAVAILABLE'},{status:503}));expect(fail.status).toBe(409);
  const leak=await qualifyCloudAccess(request(),env,async()=>new Response(env.FACTORY_STAGING_PROTECTION_BYPASS));expect(leak.status).toBe(503);expect(await leak.text()).not.toContain(env.FACTORY_STAGING_PROTECTION_BYPASS);
 });
});
