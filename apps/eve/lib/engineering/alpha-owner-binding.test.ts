import {afterEach,describe,it,expect,vi} from 'vitest';
import {digest} from './contract.ts';
import {alphaOwnerBinding,assertAlphaOwnerApproval} from './alpha-owner-binding.ts';
import {productionInstallation} from './production-installation.ts';
import {factoryRequestHeaders} from './factory-request-headers.ts';
import {selectedAlphaWork,selectedEngineeringWorkEnabled} from './alpha-selected-work.ts';
import {engineeringWorkEnabled} from './deployment-mode.ts';
import {productionCloudConfiguration} from './production-runtime-guard.ts';
import {fixture,slots} from '../../test/fixtures/alpha-owner.ts';
afterEach(()=>vi.unstubAllEnvs());
describe('fixed three-owner selected Work boundary',()=>{
 it.each(slots)('binds slot %s without enabling general Work or implicit grant',slot=>{
  const f=fixture(slot);expect(alphaOwnerBinding(f.env)).toEqual(f.binding);expect(engineeringWorkEnabled(f.env)).toBe(false);expect(selectedEngineeringWorkEnabled(undefined,false,f.env)).toBe(false);
  expect(selectedAlphaWork(f.workId,f.env)?.binding).toEqual(f.binding);
  expect(()=>selectedAlphaWork(f.workId,{...f.env,MYEVE_PRODUCTION_CANARY_AUTHORIZATION_SHA256:undefined})).toThrow();
  expect(productionInstallation(f.env).connection.token).toBe(f.env.MYEVE_FACTORY_ALPHA_APPLICATION_TOKEN);
  for(const other of slots.filter(s=>s!==slot)){
   const g=fixture(other);expect(()=>selectedAlphaWork(g.workId,f.env)).toThrow();expect(()=>alphaOwnerBinding({...f.env,MYEVE_OWNER_ID:g.binding.ownerScope})).toThrow();expect(()=>assertAlphaOwnerApproval(g.envelope,f.binding as never)).toThrow();
  }
 });
 it.each([{VERCEL_ENV:'preview'},{VERCEL_ENV:'development'},{VERCEL:'0'},{VERCEL_PROJECT_ID:'prj_foreign'},{MYEVE_OWNER_ID:'personal-owner'},{MYEVE_ALPHA_OWNER_ROSTER_SHA256:'f'.repeat(64)}])('rejects substituted runtime %j',patch=>expect(()=>alphaOwnerBinding({...fixture().env,...patch})).toThrow());
 it('forbids copied personal application credentials and app/Proof equality',()=>{
  const {env}=fixture();for(const patch of [{MYEVE_FACTORY_PRODUCTION_APPLICATION_TOKEN:'3'.repeat(64)},{FACTORY_PROOF_TOKEN:env.MYEVE_FACTORY_ALPHA_APPLICATION_TOKEN}])expect(()=>productionInstallation({...env,...patch})).toThrow();
 });
 it('requires current exact approval at selected-turn admission while retaining expired configuration for cleanup',()=>{
  const f=fixture(),envelope={...f.envelope,expiresAt:new Date(0).toISOString()},config={...f.config,authorizationEnvelope:envelope,authorizationSha256:digest(envelope)},env={...f.env,MYEVE_PRODUCTION_CANARY_CONFIG:JSON.stringify(config),MYEVE_PRODUCTION_CANARY_AUTHORIZATION_SHA256:config.authorizationSha256};
  expect(productionCloudConfiguration(env).work.id).toBe(f.workId);expect(()=>selectedAlphaWork(f.workId,env)).toThrow();expect(selectedAlphaWork(f.workId,env,false)?.binding).toEqual(f.binding);
 });
 it.each(slots)('uses only %s server-side short-lived workload identity for both protection and application verification',async slot=>{
  const f=fixture(slot),connection=productionInstallation(f.env).connection,claims={project_id:f.binding.sourceProjectId,owner_id:'team_p8z8exJRTGfOPk1GC9vUOpv3',environment:'production',exp:Math.floor(Date.now()/1000)+60};
  const token='header.'+Buffer.from(JSON.stringify(claims)).toString('base64url')+'.signature';const headers=await factoryRequestHeaders(connection,async()=>token,f.env);
  expect(headers['x-myfactory-source-oidc']).toBe(token);expect(headers['x-vercel-trusted-oidc-idp-token']).toBe(token);expect(headers.authorization).toBe('Bearer '+f.env.MYEVE_FACTORY_ALPHA_APPLICATION_TOKEN);
  for(const other of slots.filter(s=>s!==slot)){const bad='header.'+Buffer.from(JSON.stringify({...claims,project_id:fixture(other).binding.sourceProjectId})).toString('base64url')+'.signature';await expect(factoryRequestHeaders(connection,async()=>bad,f.env)).rejects.toThrow();}
 });
});
