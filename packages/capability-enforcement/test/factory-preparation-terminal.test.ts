import {test} from 'node:test';
import assert from 'node:assert/strict';
import {signFactoryPreparationTerminal,verifyFactoryPreparationTerminal,parseFactoryPreparationTerminal,type FactoryPreparationTerminal,type TerminalBinding} from '../src/factory-preparation-terminal.ts';
import {signPolicyMessage,verifyPolicyMessage,type PolicyKey} from '../src/ordering-wire.ts';
import {signLifecycleReceipt,verifyLifecycleReceipt} from '../src/lifecycle-wire.ts';

const h='a'.repeat(64),now=1000;
const binding:TerminalBinding={ownerId:'owner',organizationId:'org',installationId:'install',agentId:'agent',clientId:'client',
  backendId:'factory',incarnation:'incarnation',enrollmentVersion:1,requestId:'request',workId:'work',generation:1,missionId:'mission',
  factoryId:'factory',factoryVersion:h,sourceDigest:h,configurationDigest:h,nativeRequestDigest:h};
const receipt:FactoryPreparationTerminal={schema:'factory-capability-preparation-terminal/v1',...binding,planId:h,planDigest:h,
  receiverSequence:2,receiverHeadDigest:h,outcome:'DEFINITELY_NOT_ADMITTED',reasonCode:'POLICY_CHANGED',nativeOutcomeDigest:h,issuedAt:now,expiresAt:now+30000};
async function key():Promise<PolicyKey>{const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);return {keyId:'original',jwk:await crypto.subtle.exportKey('jwk',pair.privateKey)};}
test('strict terminal verifies exact binding and bounded supporting validity',async()=>{
 const signer=await key(),envelope=await signFactoryPreparationTerminal(receipt,signer);
 assert.deepEqual(await verifyFactoryPreparationTerminal(envelope,signer,binding,now),receipt);
 for(const field of Object.keys(binding))await assert.rejects(verifyFactoryPreparationTerminal(envelope,signer,{...binding,[field]:field==='generation'||field==='enrollmentVersion'?2:'foreign'},now),/BINDING/);
 await assert.rejects(verifyFactoryPreparationTerminal(envelope,signer,{} as TerminalBinding,now),/BINDING/);
 await assert.rejects(verifyFactoryPreparationTerminal(envelope,signer,binding,now-1),/STALE/);
 await assert.rejects(verifyFactoryPreparationTerminal(envelope,signer,binding,receipt.expiresAt),/STALE/);
 await assert.rejects(verifyFactoryPreparationTerminal({...envelope,signature:'bad'},signer,binding,now));
});
test('strict terminal rejects missing/extra fields, overlong validity and fabricated settlement',()=>{
 for(const field of Object.keys(receipt)){const value={...receipt} as Record<string,unknown>;delete value[field];assert.throws(()=>parseFactoryPreparationTerminal(value));}
 assert.throws(()=>parseFactoryPreparationTerminal({...receipt,accounting:'SETTLED'}));
 assert.throws(()=>parseFactoryPreparationTerminal({...receipt,outcome:'ADMITTED'}));
 assert.throws(()=>parseFactoryPreparationTerminal({...receipt,expiresAt:receipt.expiresAt+1}));
 assert.throws(()=>parseFactoryPreparationTerminal({...receipt,outcome:'ADMISSION_UNCERTAIN',reasonCode:'POLICY_CHANGED'}));
});
test('shared enrolled key does not permit cross-protocol receipt substitution in either direction',async()=>{
 const signer=await key(),terminal=await signFactoryPreparationTerminal(receipt,signer);
 await assert.rejects(verifyPolicyMessage(terminal,signer));
 await assert.rejects(verifyLifecycleReceipt(terminal,signer,now));
 const identity={authority:'myeve' as const,ownerId:binding.ownerId,organizationId:binding.organizationId,installationId:binding.installationId,
 backendId:binding.backendId,incarnation:binding.incarnation,enrollmentVersion:1,version:1,policyId:'policy'};
 const fence=await signPolicyMessage({...identity,kind:'FENCE',capabilityId:'myfactory',operation:'disable'},signer);
 await assert.rejects(verifyFactoryPreparationTerminal(fence,signer,binding,now));
 const lifecycle=await signLifecycleReceipt({...identity,schema:'capability-control.lifecycle.v1',kind:'CONTROL_ACK',capabilityId:'myfactory',operation:'revoke',
 sequence:1,state:'PENDING_BACKEND',observedAt:now,evidenceDigest:h,inventoryDigest:h,inventoryComplete:false},signer);
 await assert.rejects(verifyFactoryPreparationTerminal(lifecycle,signer,binding,now));
});
