import {describe,it,expect} from 'vitest';
import vector from './fixtures/cloud-verification-v1.json';
import {verifyResult,type ResultManifest} from './factory-producer-protocol.ts';
import {cloudProtectedEvidence,FactoryCloudProtectedVerifier} from './factory-cloud-verifier.ts';
import {digest,type RepositoryProfile} from './contract.ts';
import type {DirectVerificationContract} from './direct-development.ts';
import type {Candidate} from './execution.ts';
import type {FactoryReceiptStore} from './factory-receipt-store.ts';

function fixture(){
 const manifest=verifyResult(vector.signed,vector.expected).manifest,v=manifest.verification!;
 const profile={image:v.image,checks:v.checks.map(check=>({id:check.id}))} as RepositoryProfile;
 const contract={workId:v.workId,baseSha:manifest.execution.inputCommit,criteriaVersion:1,profileHash:digest(profile),profile} satisfies DirectVerificationContract;
 const candidate={id:'receipt',workId:v.workId,producer:'MYFACTORY',sha:v.candidateCommit,tree:v.candidateTree,baseSha:contract.baseSha,attemptId:v.runId,factoryProvenance:{receiptId:'receipt',factoryVersion:manifest.execution.factoryVersion,remoteRunId:v.runId}} as Candidate;
 const expected={workGeneration:v.workGeneration,profileHash:contract.profileHash,factoryVersion:manifest.execution.factoryVersion};
 return{manifest,contract,candidate,expected};
}
describe('independent CLOUD verifier in canonical protected Evidence',()=>{
 it('consumes the exact Factory-signed cross-repository vector',()=>{
  const f=fixture(),evidence=cloudProtectedEvidence(f.manifest,f.contract,f.candidate,f.expected);
  expect(evidence).toHaveLength(10);expect(evidence.every(e=>e.result==='PASS')).toBe(true);
  expect(evidence.every(e=>e.artifactHash===digest(e.artifact)&&e.producer==='protected-supervisor')).toBe(true);
 });
 it('producer completion cannot replace an independent result, owner binding or matching profile',()=>{
  const changes=[(f:ReturnType<typeof fixture>)=>delete f.manifest.verification,
   (f:ReturnType<typeof fixture>)=>f.manifest.verification!.workId='other',
   (f:ReturnType<typeof fixture>)=>f.manifest.verification!.workGeneration++,
   (f:ReturnType<typeof fixture>)=>f.manifest.verification!.cleanupConfirmed=false as true,
   (f:ReturnType<typeof fixture>)=>f.manifest.verification!.providerSessionId=f.manifest.verification!.producerSessionId,
   (f:ReturnType<typeof fixture>)=>f.candidate.sha='a'.repeat(40),
   (f:ReturnType<typeof fixture>)=>f.expected.factoryVersion='f'.repeat(64),
   (f:ReturnType<typeof fixture>)=>f.contract.profile.checks.reverse()];
  for(const change of changes){const f=fixture();change(f);expect(()=>cloudProtectedEvidence(f.manifest,f.contract,f.candidate,f.expected)).toThrow();}
 });
 it('failed/unknown verification projects failed/unknown protected evidence',()=>{
  const f=fixture();f.manifest.verification!.outcome='FAIL';f.manifest.verification!.checks[0].result='FAIL';
  expect(cloudProtectedEvidence(f.manifest,f.contract,f.candidate,f.expected)[0].result).toBe('FAIL');
  f.manifest.verification!.outcome='UNKNOWN';f.manifest.verification!.checks=[];
  expect(cloudProtectedEvidence(f.manifest,f.contract,f.candidate,f.expected).every(e=>e.result==='UNKNOWN')).toBe(true);
 });
 it('rechecks current Gate C authority and signatures without a provider or local executor',async()=>{
  const f=fixture(),e=f.manifest.execution;
  const binding={...vector.expected,workId:f.contract.workId,workGeneration:1,criteriaVersion:1,sourceDigest:e.sourceDigest,configurationDigest:e.configurationDigest,requestDigest:e.requestDigest,attemptNumber:e.attemptNumber,inputCommit:e.inputCommit,operationId:f.manifest.operationId};
  let eligible=true,state='ADMITTED',envelope=JSON.stringify(vector.signed),keys=vector.expected.keys;
  const store={request:async()=>({eligible,binding}),admission:async()=>({receipt_id:'receipt'}),get:async()=>({state,envelope})} as unknown as FactoryReceiptStore;
  const verifier=new FactoryCloudProtectedVerifier(store,'request',async()=>keys,f.expected);
  expect(await verifier.verify(f.contract,f.candidate)).toHaveLength(10);
  eligible=false;await expect(verifier.verify(f.contract,f.candidate)).rejects.toThrow('CURRENT_RECEIPT');eligible=true;
  state='STALE';await expect(verifier.verify(f.contract,f.candidate)).rejects.toThrow('CURRENT_RECEIPT');state='ADMITTED';
  keys=[];await expect(verifier.verify(f.contract,f.candidate)).rejects.toThrow();keys=vector.expected.keys;
  envelope=JSON.stringify({...vector.signed,signature:'a'.repeat(86)});await expect(verifier.verify(f.contract,f.candidate)).rejects.toThrow();
 });
});
