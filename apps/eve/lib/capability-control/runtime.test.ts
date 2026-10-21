import {describe,it,expect} from 'vitest';
import {generateKeyPairSync} from 'node:crypto';
import {externalAlphaLimits} from '../external-alpha/policy.ts';
import {digest} from '../engineering/contract.ts';
import {capabilityConfiguration} from './runtime.ts';
const signingKey=generateKeyPairSync('ed25519').privateKey.export({type:'pkcs8',format:'pem'}).toString();
const owner='10000000-0000-4000-8000-000000000001';
function policy(){return {version:1,kind:'TWO_EXTERNAL_OWNERS_V1',cohortId:'20000000-0000-4000-8000-000000000001',slot:'1',ownerId:owner,projectId:'prj_testOne',clientId:'external-alpha-'+'a'.repeat(32),repository:'example/myeve-alpha-workspace-01',baseSha:'a'.repeat(40),treeSha:'b'.repeat(40),workspacePolicy:'ISOLATED_WORKSPACE_V1',dayBoundary:'UTC_MIDNIGHT',model:'openai/gpt-5.4-mini',provider:'vercel-ai-gateway/openai',sourceDigest:'c'.repeat(64),factoryVersion:'d'.repeat(64),limits:{...externalAlphaLimits},publication:false,automaticRepair:false,fallback:false};}
function env(p=policy()):NodeJS.ProcessEnv{return {NODE_ENV:'production',VERCEL:'1',VERCEL_ENV:'production',VERCEL_PROJECT_ID:p.projectId,EVE_PROJECT_NAME:'myeve-alpha-tester-1',MYEVE_OWNER_ID:p.ownerId,MYEVE_EXTERNAL_ALPHA_POLICY:JSON.stringify(p),MYEVE_EXTERNAL_ALPHA_POLICY_SHA256:digest(p),MYEVE_EXTERNAL_ALPHA_AUTHORITY_SIGNING_KEY:signingKey};}

function hosted(){
 const e:NodeJS.ProcessEnv={...env(),MYEVE_CAPABILITY_CONTROL_ENABLED:'true',MYEVE_MISSIONCONTROL_MODE:'APPROVED_NONPRODUCTION',
  MYEVE_CAPABILITY_INSTALLATION_ID:'isolated',MYEVE_CAPABILITY_ENVIRONMENT:'qualification',MYEVE_CAPABILITY_ORIGIN:'https://eve.example.test',
  DATABASE_URL:'postgresql://127.0.0.1/app',MYEVE_CAPABILITY_DATABASE_URL:'postgresql://127.0.0.1/app',
  MYEVE_CAPABILITY_RECOVERY_EPOCH:'epoch',MYEVE_CAPABILITY_RECOVERY_WITNESS_DATABASE_URL:'postgresql://witness@127.0.0.1/witness',
  MYEVE_CAPABILITY_RECOVERY_WITNESS_ENROLLMENT_ID:'enrollment',MYEVE_CAPABILITY_RECOVERY_WITNESS_QUALIFICATION_DIGEST:'a'.repeat(64)};
 const p=policy();
 e.MYEVE_CAPABILITY_RECOVERY_WITNESS_INSTALLATION_DIGEST=digest({schema:'myeve-hosted-capability-installation/v1',installationId:e.MYEVE_CAPABILITY_INSTALLATION_ID,
  origin:e.MYEVE_CAPABILITY_ORIGIN,ownerId:p.ownerId,projectId:p.projectId,policyDigest:digest(p),sourceDigest:p.sourceDigest,factoryVersion:p.factoryVersion,mode:e.MYEVE_MISSIONCONTROL_MODE});
 return e;
}
describe('bounded hosted capability configuration',()=>{
 it('accepts only the canonical isolated tuple configuration, without claiming witness enrollment',()=>{expect(capabilityConfiguration(hosted())).toMatchObject({id:'isolated',environment:'qualification',origin:'https://eve.example.test'});});
 it.each(['MYEVE_CAPABILITY_CONTROL_ENABLED','MYEVE_MISSIONCONTROL_MODE','MYEVE_OWNER_ID','VERCEL_PROJECT_ID','MYEVE_EXTERNAL_ALPHA_POLICY_SHA256',
  'MYEVE_CAPABILITY_RECOVERY_WITNESS_INSTALLATION_DIGEST','MYEVE_CAPABILITY_RECOVERY_WITNESS_QUALIFICATION_DIGEST','MYEVE_CAPABILITY_RECOVERY_WITNESS_ENROLLMENT_ID'])('denies missing %s',key=>{const e=hosted();delete e[key];expect(()=>capabilityConfiguration(e)).toThrow();});
 it.each([{VERCEL_ENV:'preview'},{MYEVE_CAPABILITY_ENVIRONMENT:'development'},{MYEVE_CAPABILITY_ORIGIN:'http://localhost'},
  {MYEVE_CAPABILITY_ORIGIN:'https://foreign.example.test'},{MYEVE_CAPABILITY_INSTALLATION_ID:'foreign'},
  {MYEVE_CAPABILITY_RECOVERY_WITNESS_DATABASE_URL:'postgresql://127.0.0.1/app'},
  {MYEVE_CAPABILITY_RECOVERY_WITNESS_DIRECTORY:'/tmp/witness'},{MYEVE_CAPABILITY_RECOVERY_WITNESS_DATABASE_URL:'postgresql://foreign.example.test/witness'}])('denies unqualified configuration %o',patch=>{expect(()=>capabilityConfiguration({...hosted(),...patch})).toThrow();});
 it('does not admit generic hosted production or preview',()=>{for(const VERCEL_ENV of ['production','preview'])expect(()=>capabilityConfiguration({...hosted(),VERCEL_ENV,MYEVE_EXTERNAL_ALPHA_POLICY:undefined,EVE_PROJECT_NAME:'generic'})).toThrow();});
 it('binds source and FactoryVersion even when the canonical policy digest is updated',()=>{for(const key of ['sourceDigest','factoryVersion']){const e=hosted(),p={...policy(),[key]:'f'.repeat(64)};e.MYEVE_EXTERNAL_ALPHA_POLICY=JSON.stringify(p);e.MYEVE_EXTERNAL_ALPHA_POLICY_SHA256=digest(p);expect(()=>capabilityConfiguration(e)).toThrow();}});
});
