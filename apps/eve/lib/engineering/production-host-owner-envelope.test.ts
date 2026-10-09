import {describe,expect,it,vi} from 'vitest';
import {digest} from './contract.ts';
import {assertProductionApproval} from './production-approval.ts';
import {assertAlphaOwnerApproval} from './alpha-owner-binding.ts';
import {fixture} from '../../test/fixtures/alpha-owner.ts';
import {validatePaidOperatorPreflight} from '../../scripts/production-canary-grant.ts';
import {materializeValidationGrant} from '../../scripts/production-validation-materializer.ts';

// Public, disposable fixtures only. No production files, DBs or provider calls.
function installationFixture() {
 const f=fixture(),now=Date.now();
 const installation:{projectId:string;databaseResourceId:string;custodyStoreId:string;ownerScope?:unknown}={
  projectId:f.binding.factoryProjectId,databaseResourceId:'disposable-db',custodyStoreId:'disposable-store',ownerScope:'disposable-host',
 };
 const release={myeveCanonicalSha:'d'.repeat(40),factoryCanonicalSha:'e'.repeat(40),myeveMigrationSha256:'f'.repeat(64),factoryMigrationSha256:'0'.repeat(64)};
 const envelope={...f.envelope,approval:{...f.envelope.approval,installation,release,environmentBinding:{},criteria:[],canonicalSpendPlan:{},historicalGrants:[]}};
 const preflight={status:'PASS',envelopeSha256:digest(envelope),workId:f.workId,configurationHash:envelope.approval.configurationHash,...release,
  observedAt:new Date(now).toISOString(),generalWork:'DISABLED',readOnlyBefore:'ENABLED',reusableGrants:0,paidOperations:0,publicationEffects:0,
  operatorWriteWindowApproved:true,paidOperationScope:'EXACT_OWNER_CLIENT',ownerBinding:f.binding,hostOwnerScope:'disposable-host',
  myeveAlphaMigration:'0084_three_owner_cloud_accounting.sql',myeveAlphaMigrationSha256:release.myeveMigrationSha256,
  factoryAlphaMigration:'010-three-owner-authority',factoryAlphaMigrationSha256:release.factoryMigrationSha256};
 return {envelope,preflight,now};
}

describe('production alpha envelope host-owner contract regression',()=>{
 it('qualifies distinct host and execution scopes without granting host privileges',()=>{
  const {envelope,preflight,now}=installationFixture(),hash=digest(envelope);
  expect(assertProductionApproval(envelope,hash,now)).toEqual(envelope.approval);
  expect(validatePaidOperatorPreflight(envelope,hash,preflight,now)).toEqual(envelope.approval);
  expect(envelope.approval.installation.ownerScope).not.toBe(envelope.approval.manifestTemplate.ownerScope);
  for(const slot of ['B','C'] as const)expect(()=>assertAlphaOwnerApproval(envelope,fixture(slot).binding as never)).toThrow();
  expect(()=>assertAlphaOwnerApproval(envelope,{...envelope.approval.ownerBinding,ownerScope:'disposable-host'} as never)).toThrow();
 });
 it.each(['missing','null','empty','execution-owner'] as const)('rejects %s host scope before any materializer query or audit write',async invalid=>{
  const {envelope,preflight,now}=installationFixture();
  if(invalid==='missing')delete envelope.approval.installation.ownerScope;
  else envelope.approval.installation.ownerScope=invalid==='null'?null:invalid==='empty'?'':envelope.approval.ownerBinding.ownerScope;
  const hash=digest(envelope),query=vi.fn(async()=>{throw Error('NO_DATABASE_ALLOWED')}),audit=vi.fn(async()=>{});
  expect(()=>validatePaidOperatorPreflight(envelope,hash,{...preflight,envelopeSha256:hash},now)).toThrow('ALPHA_OPERATOR_PREFLIGHT_REQUIRED');
  await expect(materializeValidationGrant({query},{query},envelope.approval as never,audit,{}, {envelope,sha256:hash})).rejects.toThrow('ALPHA_HOST_INSTALLATION_BOUNDARY');
  expect(query).not.toHaveBeenCalled();expect(audit).not.toHaveBeenCalled();
 });
 it('requires fresh explicit write approval even for a well-formed corrected proposal',()=>{
  const {envelope,preflight,now}=installationFixture();
  expect(()=>validatePaidOperatorPreflight(envelope,digest(envelope),{...preflight,operatorWriteWindowApproved:false},now)).toThrow('CURRENT_PAID_OPERATOR_PREFLIGHT_REQUIRED');
 });
});
