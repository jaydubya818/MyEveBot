import {describe,it,expect,vi} from 'vitest';
import {productionInstallation,productionInstallationStatus} from './production-installation.ts';
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
