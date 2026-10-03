import {describe,it,expect,vi} from 'vitest';
import {productionInstallation,productionInstallationStatus,productionInstallationSecurityStatus} from './production-installation.ts';
import {cloudRuntimeEnabled} from './cloud-runtime-guard.ts';
const config={version:1,ownerScope:'owner',projectId:'prj_4hfceCN8l6wN1gUyYOzZLQ7aJapK',sourceDigest:'c'.repeat(64),origin:'https://myfactory-cloud-production.vercel.app'};
const env={VERCEL:'1',VERCEL_ENV:'production',VERCEL_PROJECT_ID:'prj_L6faw25wnFGUZtrLKBIccg8gIDLR',MYEVE_OWNER_ID:'owner',MYEVE_CLOUD_PRODUCTION_INSTALLATION:JSON.stringify(config),MYEVE_FACTORY_PRODUCTION_APPLICATION_TOKEN:'a'.repeat(64)};
const headers=async()=>({authorization:'Bearer independent-application-auth'});
const body={service:'myfactory',environment:'production',projectId:config.projectId,sourceDigest:config.sourceDigest,alive:true,platformReady:true,ready:false,executionAdmission:'DISABLED',admission:'DISABLED',dependencies:{database:'AVAILABLE',artifacts:'AVAILABLE',provider:'AVAILABLE'},executionQualification:'AWAITING_PRODUCTION_EXECUTION_CONTRACT',publication:'DISABLED'};
describe('production installation observation grants no Work authority',()=>{
 it('does not enable the deterministic conversation or execution runtime',()=>{expect(productionInstallation(env).config).toEqual(config);expect(cloudRuntimeEnabled(env)).toBe(false);});
 it.each([{MYEVE_OWNER_ID:'partner'},{VERCEL_ENV:'preview'},{MYEVE_CLOUD_DETERMINISTIC_ENABLED:'true'},{MYEVE_CLOUD_QUALIFICATION_CONFIG:'{}'},{MYEVE_FACTORY_PRODUCTION_APPLICATION_TOKEN:'bad'}])('rejects wrong scope and qualification configuration %j',patch=>{expect(()=>productionInstallation({...env,...patch})).toThrow();});
 it('reads readiness only and never treats infrastructure availability as Work admission',async()=>{
  const fetcher=vi.fn<typeof fetch>(async()=>Response.json(body));
  const result=await productionInstallationStatus(env,fetcher,headers);
  expect(result).toMatchObject({platform:'AVAILABLE',admission:'DISABLED',execution:'AWAITING_QUALIFICATION_AND_AUTHORIZATION'});
  expect(fetcher).toHaveBeenCalledTimes(1);expect(fetcher.mock.calls[0][0].toString()).toBe(config.origin+'/api/readiness');
  expect(JSON.stringify(result)).not.toContain(env.MYEVE_FACTORY_PRODUCTION_APPLICATION_TOKEN);
 });
 it.each([{sourceDigest:'d'.repeat(64)},{ready:true},{admission:'ENABLED'},{environment:'staging'},{platformReady:false}])('rejects unbound or overstated readiness %j',async patch=>{
  await expect(productionInstallationStatus(env,async()=>Response.json({...body,...patch}),headers)).rejects.toThrow();
 });
 it('does not follow redirects carrying workload identity',async()=>{
  const fetcher=vi.fn<typeof fetch>(async()=>Response.json({}, {status:302}));
  await expect(productionInstallationStatus(env,fetcher,headers)).rejects.toThrow();
  expect(fetcher.mock.calls[0][1]).toMatchObject({redirect:'error',cache:'no-store'});
 });
});

describe('bounded production security observation',()=>{
 it('keeps workload identity server-side and proves independent auth/Work denial',async()=>{
  const fetcher=vi.fn<typeof fetch>(async(url,options)=>{
   const auth=(options?.headers as Record<string,string>).authorization;
   if(options?.method==='POST'){expect(new URL(String(url)).pathname).toBe('/api/connect/v2/dispatches');expect(options.body).toBe('{"work":null}');return Response.json({error:'PRODUCTION_WORK_NOT_AUTHORIZED'},{status:403});}
   if(!auth||auth.includes('invalid'))return Response.json({error:'UNAUTHORIZED'},{status:401});
   return Response.json(body);
  });
  const report=await productionInstallationSecurityStatus(env,fetcher,async()=>({authorization:'Bearer private-auth','x-vercel-trusted-oidc-idp-token':'private-oidc'}));
  expect(report.status).toBe('PASS');expect(fetcher).toHaveBeenCalledTimes(4);
  expect(JSON.stringify(report)).not.toMatch(/private-auth|private-oidc/);
  for(const [url,options] of fetcher.mock.calls){expect(new URL(String(url)).origin).toBe(config.origin);expect(options).toMatchObject({redirect:'error',cache:'no-store'});}
 });
 it('does not mistake infrastructure HTML denial for application denial',async()=>{
  const fetcher=vi.fn<typeof fetch>(async(_url,options)=>options?.method==='POST'?Response.json({error:'PRODUCTION_WORK_NOT_AUTHORIZED'},{status:403}):(options?.headers as Record<string,string>).authorization==='Bearer independent-application-auth'?Response.json(body):new Response('<html>Protected deployment</html>',{status:401}));
  const report=await productionInstallationSecurityStatus(env,fetcher,headers);expect(report.status).toBe('FAIL');
 });
 it('never sends a request when production binding fails',async()=>{
  const fetcher=vi.fn<typeof fetch>();await expect(productionInstallationSecurityStatus({...env,VERCEL_ENV:'preview'},fetcher,headers)).rejects.toThrow();expect(fetcher).not.toHaveBeenCalled();
 });
});
