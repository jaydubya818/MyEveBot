import {describe,it,expect} from 'vitest';
import {validateOperatorPreflight} from '../../scripts/production-validation-grant.ts';
import {digest} from './contract.ts';

describe('explicit grant operator preflight before connections',()=>{
 const now=Date.parse('2026-10-05T08:00:00.000Z');
 const envelope={work:{id:'fixture'},installation:{myeveCanonicalSha:'myeve',factoryCanonicalSha:'factory'},migration:{sha256:'migration'},materializer:{configurationHash:'configuration'}};
 const valid={status:'PASS',workId:'fixture',envelopeSha256:digest(envelope),observedAt:new Date(now).toISOString(),myeveCanonicalSha:'myeve',factoryCanonicalSha:'factory',migrationSha256:'migration',configurationHash:'configuration',readOnlyBefore:'ENABLED',generalWork:'DISABLED',reusableGrants:0,paidOperations:0,publicationEffects:0,operatorWriteWindowApproved:true};
 it.each([undefined,null,'not-a-date','',new Date(now+1).toISOString(),new Date(now-120001).toISOString()])('rejects missing, malformed, future or stale timestamp %s',observedAt=>{
  expect(()=>validateOperatorPreflight(envelope,{...valid,observedAt},now)).toThrow('CURRENT_OPERATOR_PREFLIGHT_REQUIRED');
 });
 it('accepts the closed freshness interval only',()=>{
  for(const age of [0,120000])expect(()=>validateOperatorPreflight(envelope,{...valid,observedAt:new Date(now-age).toISOString()},now)).not.toThrow();
 });
 it.each([{workId:'different'},{envelopeSha256:'different'},{myeveCanonicalSha:'different'},{factoryCanonicalSha:'different'},{migrationSha256:'different'},{configurationHash:'different'},{readOnlyBefore:'DISABLED'},{generalWork:'ENABLED'},{reusableGrants:1},{paidOperations:1},{publicationEffects:1},{operatorWriteWindowApproved:false}])('denies changed installation/authority precondition %j',change=>{
  expect(()=>validateOperatorPreflight(envelope,{...valid,...change},now)).toThrow('CURRENT_OPERATOR_PREFLIGHT_REQUIRED');
 });
});
