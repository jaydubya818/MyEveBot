import {describe,it,expect} from 'vitest';
import {digest} from './contract.ts';
import {validatePaidOperatorPreflight} from '../../scripts/production-canary-grant.ts';
const now=Date.now(),sourceDigest='a'.repeat(64),configurationDigest='b'.repeat(64);
const envelope={version:1,expiresAt:new Date(now+600000).toISOString(),approval:{workVersion:2,configurationHash:'c'.repeat(64),manifestTemplate:{version:1,clientId:'sofie-production',environment:'CLOUD_PRODUCTION',publication:false,sourceDigest,configurationDigest,factoryVersion:digest({sourceDigest,configurationDigest}),request:{protocol:'MYFACTORY_EXECUTION_V2',workId:'disposable-work',workGeneration:2,requestId:null,deadline:null}},release:{myeveCanonicalSha:'d'.repeat(40),factoryCanonicalSha:'e'.repeat(40),myeveMigrationSha256:'f'.repeat(64),factoryMigrationSha256:'0'.repeat(64)}}};
const hash=digest(envelope),preflight={status:'PASS',envelopeSha256:hash,workId:'disposable-work',configurationHash:envelope.approval.configurationHash,...envelope.approval.release,observedAt:new Date(now).toISOString(),generalWork:'DISABLED',readOnlyBefore:'ENABLED',reusableGrants:0,paidOperations:0,publicationEffects:0,operatorWriteWindowApproved:true};
describe('explicit paid operator preflight; no connection or authority effects',()=>{
 it('accepts only the approved immutable envelope and current exact installation receipt',()=>expect(validatePaidOperatorPreflight(envelope,hash,preflight,now)).toEqual(envelope.approval));
 it.each(['configurationHash','myeveCanonicalSha','factoryCanonicalSha','myeveMigrationSha256','factoryMigrationSha256','workId','envelopeSha256','status','readOnlyBefore','generalWork'])('rejects changed %s',key=>expect(()=>validatePaidOperatorPreflight(envelope,hash,{...preflight,[key]:'changed'},now)).toThrow());
 it.each(['reusableGrants','paidOperations','publicationEffects'])('requires zero %s',key=>expect(()=>validatePaidOperatorPreflight(envelope,hash,{...preflight,[key]:1},now)).toThrow());
 it('rejects expired/future preflight and missing explicit write-window approval',()=>{
  for(const patch of [{observedAt:new Date(now-120001).toISOString()},{observedAt:new Date(now+1).toISOString()},{operatorWriteWindowApproved:false}])expect(()=>validatePaidOperatorPreflight(envelope,hash,{...preflight,...patch},now)).toThrow();
 });
});
