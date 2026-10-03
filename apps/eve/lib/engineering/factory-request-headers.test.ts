import {describe,it,expect,vi} from 'vitest';
import {factoryRequestHeaders,sofieCloudProject,factoryOidcHeader,sofieProductionProject} from './factory-request-headers.ts';
const config={origin:'https://myfactory-cloud-staging-test-jaydubya818.vercel.app',token:'a'.repeat(64),transport:'CLOUD' as const,protocol:'MYFACTORY_EXECUTION_V2' as const,projectId:'prj_IRXTY6HOzS2q9wRPdabsJnmddzl4'};
const env={VERCEL:'1',VERCEL_PROJECT_ID:sofieCloudProject,VERCEL_ENV:'preview'};
const claims={project_id:sofieCloudProject,owner_id:'team_p8z8exJRTGfOPk1GC9vUOpv3',environment:'preview',exp:Math.floor(Date.now()/1000)+300};
const token=(overrides={})=>'e30.'+Buffer.from(JSON.stringify({...claims,...overrides})).toString('base64url')+'.synthetic';
describe('Factory request-scoped OIDC custody',()=>{
 it('resolves fresh identity on each request without retaining it in configuration',async()=>{
  const first=token({jti:'one'}),second=token({jti:'two'}),read=vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second);
  expect((await factoryRequestHeaders(config,read,env))[factoryOidcHeader]).toBe(first);
  expect((await factoryRequestHeaders(config,read,env))[factoryOidcHeader]).toBe(second);
  expect(JSON.stringify(config)).not.toContain(first);
 });
 it.each([{VERCEL:'0'},{VERCEL_PROJECT_ID:'other'},{VERCEL_ENV:'production'},{VERCEL_ENV:'development'},{VERCEL_TARGET_ENV:'production'}])('rejects runtime outside approved scope before reading a token: %j',async change=>{
  const read=vi.fn();await expect(factoryRequestHeaders(config,read,{...env,...change})).rejects.toThrow('FACTORY_TRUSTED_PREVIEW_IDENTITY_REQUIRED');expect(read).not.toHaveBeenCalled();
 });
 it.each([{project_id:'other'},{owner_id:'other'},{environment:'production'},{environment:'development'},{exp:0}])('rejects out-of-scope/expired identity: %j',async change=>{
  await expect(factoryRequestHeaders(config,async()=>token(change),env)).rejects.toThrow('FACTORY_TRUSTED_PREVIEW_IDENTITY_REQUIRED');
 });
 it('redacts provider errors and never redirects identity to another origin',async()=>{
  await expect(factoryRequestHeaders(config,async()=>{throw Error(token());},env)).rejects.toThrow(/^FACTORY_TRUSTED_PREVIEW_IDENTITY_REQUIRED$/);
  const read=vi.fn();await expect(factoryRequestHeaders({...config,origin:'https://other.invalid'},read,env)).rejects.toThrow();expect(read).not.toHaveBeenCalled();
 });
 it('keeps existing local application authentication and never asks for OIDC',async()=>{
  const read=vi.fn();expect(await factoryRequestHeaders({origin:'http://127.0.0.1:4100',token:'local-app'},read,{})).toEqual({authorization:'Bearer local-app'});expect(read).not.toHaveBeenCalled();
 });
});

describe('exact production workload identity',()=>{
 const production={...config,origin:'https://myfactory-cloud-production.vercel.app',projectId:'prj_4hfceCN8l6wN1gUyYOzZLQ7aJapK'};
 const productionEnv={VERCEL:'1',VERCEL_PROJECT_ID:sofieProductionProject,VERCEL_ENV:'production'};
 const productionToken=()=>token({project_id:sofieProductionProject,environment:'production'});
 it('allows only the exact production pair and still sends independent application authentication',async()=>{
  expect(await factoryRequestHeaders(production,async()=>productionToken(),productionEnv)).toEqual({authorization:'Bearer '+config.token,[factoryOidcHeader]:productionToken()});
 });
 it.each([{project_id:sofieCloudProject},{environment:'preview'},{owner_id:'another-team'},{exp:0}])('rejects mismatched production claim %j',async change=>{
  await expect(factoryRequestHeaders(production,async()=>token({project_id:sofieProductionProject,environment:'production',...change}),productionEnv)).rejects.toThrow('FACTORY_TRUSTED_PRODUCTION_IDENTITY_REQUIRED');
 });
 it('cannot send production identity to staging or staging identity to production',async()=>{
  const read=vi.fn();await expect(factoryRequestHeaders(config,read,productionEnv)).rejects.toThrow();expect(read).not.toHaveBeenCalled();
  await expect(factoryRequestHeaders(production,read,env)).rejects.toThrow();expect(read).not.toHaveBeenCalled();
 });
});
