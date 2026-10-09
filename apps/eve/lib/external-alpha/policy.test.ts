import {describe,it,expect} from 'vitest';
import {externalAlphaPolicy,externalAlphaLimits,externalAlphaPolicySchema,externalAlphaProjectSlot,externalAlphaInstallation,assertExternalAlphaSigningKey,assertExternalAlphaRuntimeBinding,EXTERNAL_ALPHA_SIGNING_KEY_ENV} from './policy.ts';
import {digest} from '../engineering/contract.ts';
import {generateKeyPairSync} from 'node:crypto';
const signingKey=generateKeyPairSync('ed25519').privateKey.export({type:'pkcs8',format:'pem'}).toString();
const owner='10000000-0000-4000-8000-000000000001';
function policy(){return {version:1,kind:'TWO_EXTERNAL_OWNERS_V1',cohortId:'20000000-0000-4000-8000-000000000001',slot:'1',ownerId:owner,projectId:'prj_testOne',clientId:'external-alpha-'+'a'.repeat(32),repository:'example/myeve-alpha-workspace-01',baseSha:'a'.repeat(40),treeSha:'b'.repeat(40),workspacePolicy:'ISOLATED_WORKSPACE_V1',dayBoundary:'UTC_MIDNIGHT',model:'openai/gpt-5.4-mini',provider:'vercel-ai-gateway/openai',sourceDigest:'c'.repeat(64),factoryVersion:'d'.repeat(64),limits:{...externalAlphaLimits},publication:false,automaticRepair:false,fallback:false};}
function env(p=policy()):NodeJS.ProcessEnv{return {NODE_ENV:'production',VERCEL:'1',VERCEL_ENV:'production',VERCEL_PROJECT_ID:p.projectId,EVE_PROJECT_NAME:'myeve-alpha-tester-1',MYEVE_OWNER_ID:p.ownerId,MYEVE_EXTERNAL_ALPHA_POLICY:JSON.stringify(p),MYEVE_EXTERNAL_ALPHA_POLICY_SHA256:digest(p),MYEVE_EXTERNAL_ALPHA_AUTHORITY_SIGNING_KEY:signingKey};}
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
describe('runtime policy-field enforcement',()=>{
 it('derives the slot from the immutable project name and refuses a mismatch',()=>{
  expect(externalAlphaProjectSlot(env())).toBe('1');
  expect(externalAlphaProjectSlot({EVE_PROJECT_NAME:'myeve-alpha-tester-2'} as unknown as NodeJS.ProcessEnv)).toBe('2');
  for(const name of ['myeve-alpha-tester-3','myeve-alpha-tester-1x','myeve-alpha-tester','x-myeve-alpha-tester-1',''])
   expect(externalAlphaProjectSlot({EVE_PROJECT_NAME:name} as unknown as NodeJS.ProcessEnv)).toBeNull();
  // Slot 2 project carrying the slot 1 policy.
  expect(()=>externalAlphaPolicy({...env(),EVE_PROJECT_NAME:'myeve-alpha-tester-2'})).toThrow('EXTERNAL_ALPHA_INSTALLATION_SLOT');
  // A tester-family name that is not a valid slot is still an installation, never a plain deployment.
  expect(()=>externalAlphaPolicy({...env(),EVE_PROJECT_NAME:'myeve-alpha-tester-9'})).toThrow('EXTERNAL_ALPHA_INSTALLATION_SLOT');
  const missing=env();delete missing.EVE_PROJECT_NAME;
  expect(()=>externalAlphaPolicy(missing)).toThrow('EXTERNAL_ALPHA_INSTALLATION_SLOT');
 });
 it('slot 2 policy needs the slot 2 project and the slot 2 workspace',()=>{
  const p2={...policy(),slot:'2',repository:'example/myeve-alpha-workspace-02'};
  const e2={...env(p2),EVE_PROJECT_NAME:'myeve-alpha-tester-2'};
  expect(externalAlphaPolicy(e2)?.slot).toBe('2');
  expect(()=>externalAlphaPolicy({...e2,EVE_PROJECT_NAME:'myeve-alpha-tester-1'})).toThrow('EXTERNAL_ALPHA_INSTALLATION_SLOT');
 });
 it('the repository suffix must match the slot (schema and runtime)',()=>{
  expect(externalAlphaPolicySchema.safeParse({...policy(),repository:'example/myeve-alpha-workspace-02'}).success).toBe(false);
  expect(externalAlphaPolicySchema.safeParse({...policy(),slot:'2'}).success).toBe(false);
  // Same suffix digit but a different workspace stem is refused by the runtime check.
  const other=policy();other.repository='example/elsewhere-01';
  expect(externalAlphaPolicySchema.safeParse(other).success).toBe(false);
  expect(()=>externalAlphaPolicy(env(other))).toThrow();
  expect(()=>assertExternalAlphaRuntimeBinding(other as never,env(other))).toThrow('EXTERNAL_ALPHA_INSTALLATION_REPOSITORY');
 });
 it('fails closed without a usable signing key and never echoes it',()=>{
  const secret=signingKey;
  for(const bad of [undefined,'','   ','not a pem',generateKeyPairSync('rsa',{modulusLength:2048}).privateKey.export({type:'pkcs8',format:'pem'}).toString(),generateKeyPairSync('ed25519').publicKey.export({type:'spki',format:'pem'}).toString()]){
   const e=env();if(bad===undefined)delete e.MYEVE_EXTERNAL_ALPHA_AUTHORITY_SIGNING_KEY;else e.MYEVE_EXTERNAL_ALPHA_AUTHORITY_SIGNING_KEY=bad;
   expect(()=>externalAlphaPolicy(e)).toThrow('EXTERNAL_ALPHA_SIGNING_KEY_REQUIRED');
   expect(()=>assertExternalAlphaSigningKey(e)).toThrow(/^EXTERNAL_ALPHA_SIGNING_KEY_REQUIRED$/);
  }
  try{assertExternalAlphaSigningKey({...env(),MYEVE_EXTERNAL_ALPHA_AUTHORITY_SIGNING_KEY:'broken '+secret.slice(0,40)});}catch(error){expect(String((error as Error).message)).not.toContain(secret.slice(20,60));}
  expect(EXTERNAL_ALPHA_SIGNING_KEY_ENV).toBe('MYEVE_EXTERNAL_ALPHA_AUTHORITY_SIGNING_KEY');
  expect(externalAlphaPolicy(env())).toEqual(policy());
 });
 it('accepts an escaped-newline PEM as provisioned through environment tooling',()=>{
  const e=env();e.MYEVE_EXTERNAL_ALPHA_AUTHORITY_SIGNING_KEY=signingKey.trim().replaceAll('\n','\\n');
  expect(()=>assertExternalAlphaSigningKey(e)).not.toThrow();
 });
 it('treats the tester family and the policy variable as an installation, anything else as not',()=>{
  expect(externalAlphaInstallation({EVE_PROJECT_NAME:'myeve-alpha-tester-1'} as unknown as NodeJS.ProcessEnv)).toBe(true);
  expect(externalAlphaInstallation({MYEVE_EXTERNAL_ALPHA_POLICY:'{}'} as unknown as NodeJS.ProcessEnv)).toBe(true);
  expect(externalAlphaInstallation({EVE_PROJECT_NAME:'myeve'} as unknown as NodeJS.ProcessEnv)).toBe(false);
 });
});
