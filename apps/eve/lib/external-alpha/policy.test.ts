import {describe,it,expect} from 'vitest';
import {externalAlphaPolicy,externalAlphaLimits,externalAlphaPolicySchema} from './policy.ts';
import {digest} from '../engineering/contract.ts';
const owner='10000000-0000-4000-8000-000000000001';
function policy(){return {version:1,kind:'TWO_EXTERNAL_OWNERS_V1',cohortId:'20000000-0000-4000-8000-000000000001',slot:'1',ownerId:owner,projectId:'prj_testOne',clientId:'external-alpha-'+'a'.repeat(32),repository:'example/myeve-alpha-workspace-01',baseSha:'a'.repeat(40),treeSha:'b'.repeat(40),workspacePolicy:'ISOLATED_WORKSPACE_V1',dayBoundary:'UTC_MIDNIGHT',model:'openai/gpt-5.4-mini',provider:'vercel-ai-gateway/openai',sourceDigest:'c'.repeat(64),factoryVersion:'d'.repeat(64),limits:{...externalAlphaLimits},publication:false,automaticRepair:false,fallback:false};}
function env(p=policy()):NodeJS.ProcessEnv{return {NODE_ENV:'production',VERCEL:'1',VERCEL_ENV:'production',VERCEL_PROJECT_ID:p.projectId,EVE_PROJECT_NAME:'myeve-alpha-tester-1',MYEVE_OWNER_ID:p.ownerId,MYEVE_EXTERNAL_ALPHA_POLICY:JSON.stringify(p),MYEVE_EXTERNAL_ALPHA_POLICY_SHA256:digest(p)};}
describe('external alpha installation policy',()=>{
 it('accepts only the complete owner/project production binding',()=>{expect(externalAlphaPolicy(env())).toEqual(policy());});
 it('does not fall through to unbudgeted defaults when policy is removed',()=>{
  const e=env();delete e.MYEVE_EXTERNAL_ALPHA_POLICY;expect(()=>externalAlphaPolicy(e)).toThrow('POLICY_REQUIRED');
  expect(externalAlphaPolicy({NODE_ENV:'production',EVE_PROJECT_NAME:'unrelated-existing-installation'})).toBeNull();
 });
 it.each(['VERCEL_ENV','VERCEL_PROJECT_ID','MYEVE_OWNER_ID','MYEVE_EXTERNAL_ALPHA_POLICY_SHA256'])('denies mismatched %s',key=>{
  expect(()=>externalAlphaPolicy({...env(),[key]:'wrong'})).toThrow();
 });
 it.each(['MYEVE_ALPHA_OWNER_BINDING','MYEVE_PRODUCTION_CANARY_CONFIG','MYEVE_CLOUD_QUALIFICATION_CONFIG'])('rejects inherited authority %s',key=>{
  expect(()=>externalAlphaPolicy({...env(),[key]:'{}'})).toThrow('INSTALLATION_BINDING');
 });
 it('rejects wider limits, fallback, publication and the other workspace',()=>{
  for(const change of [{repository:'example/myeve-alpha-workspace-02'},{limits:{...externalAlphaLimits,workOperations:6}},{fallback:true},{publication:true},{provider:'unapproved'}]){
   expect(externalAlphaPolicySchema.safeParse({...policy(),...change}).success).toBe(false);
  }
 });
});
