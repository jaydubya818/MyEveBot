import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { verifyEvidence,verifySignedEvidence,evidenceReference,evidenceSha,FactoryEvidenceClient,EvidenceWaiting } from '../lib/engineering/factory-evidence.ts';
import { factoryExecutionConfigurationHash } from '../lib/engineering/factory-work-driver.ts';
const b={ownerScope:'owner-a',repository:'fixture/golden',workId:randomUUID(),workGeneration:1,requestId:randomUUID(),workOrderId:randomUUID(),runId:randomUUID(),candidateCommit:'a'.repeat(40),factoryVersion:'b'.repeat(64)};
function fixture(kind='DiffEvidence',bytes=Buffer.from('signed patch')){
 const {workOrderId,runId,candidateCommit,factoryVersion,...scope}=b;
 const ref={workOrderId,runId,candidateCommit,factoryVersion,id:randomUUID(),kind,mediaType:kind==='DiffEvidence'?'text/x-diff':'application/json',sha256:evidenceSha(bytes),size:bytes.length,collectedAt:new Date().toISOString(),source:'producer'};
 const proofReference=evidenceReference(ref);
 return{response:{scope,ref,proofReference,base64:bytes.toString('base64')},request:{...b,evidenceKind:kind,expectedDigest:ref.sha256,evidenceReference:proofReference}};
}
const check={command:'node --test',status:'passed',exitCode:0,candidateCommit:b.candidateCommit};
const patch=fixture();
const manifest={execution:b,candidate:{commit:b.candidateCommit,patchArtifactId:'patch',patchDigest:patch.response.ref.sha256},artifacts:[{id:'patch',kind:'patch',sha256:patch.response.ref.sha256,size:patch.response.ref.size}],evidence:[check]};
test('accepted transport bytes independently match signed patch and test records',()=>{
 for(const f of [patch,fixture('TestEvidence',Buffer.from(JSON.stringify([check])))])verifySignedEvidence(verifyEvidence(f.response,f.request),manifest);
});
for(const key of ['ownerScope','repository','workId','workGeneration','requestId'])test('scope mismatch denied: '+key,()=>{
 const f=fixture();f.response.scope[key]=key==='workGeneration'?2:'other';assert.throws(()=>verifyEvidence(f.response,f.request));
});
for(const key of ['workOrderId','runId','candidateCommit','factoryVersion','kind','sha256','size'])test('metadata mismatch denied: '+key,()=>{
 const f=fixture();f.response.ref[key]=key==='size'?f.response.ref.size+1:key==='kind'?'TestEvidence':key==='candidateCommit'?'c'.repeat(40):key.includes('Id')?randomUUID():'c'.repeat(64);assert.throws(()=>verifyEvidence(f.response,f.request));
});
test('self-consistent but unrelated evidence is denied by admitted signed Result',()=>{
 for(const f of [fixture('DiffEvidence',Buffer.from('not the signed patch')),fixture('TestEvidence',Buffer.from(JSON.stringify([{...check,exitCode:1,status:'failed'}])))]){
  const e=verifyEvidence(f.response,f.request);assert.throws(()=>verifySignedEvidence(e,manifest));
 }
});
test('noncanonical encoding, oversized and storage-path response are denied',()=>{
 for(const change of [v=>v.base64+='\n',v=>v.ref.size=4194305,v=>v.ref.relativePath='/private/storage']){const f=fixture();change(f.response);assert.throws(()=>verifyEvidence(f.response,f.request));}
});
const config={origin:'http://127.0.0.1:1234',token:'a'.repeat(64),factoryVersion:b.factoryVersion,qualification:{scopeId:b.ownerScope},evidence:{ownerScope:b.ownerScope,token:'c'.repeat(64),expiresAt:new Date(Date.now()+60000).toISOString()}};
test('Proof credential renewal preserves execution hash, scope changes do not',()=>{
 const c={connection:config},renewed=structuredClone(c);renewed.connection.evidence.token='d'.repeat(64);renewed.connection.evidence.expiresAt=new Date(Date.now()+120000).toISOString();
 assert.equal(factoryExecutionConfigurationHash(c),factoryExecutionConfigurationHash(renewed));
 renewed.connection.evidence.ownerScope='owner-b';assert.notEqual(factoryExecutionConfigurationHash(c),factoryExecutionConfigurationHash(renewed));
});
test('transport outage waits, integrity failure and execution credential reuse fail closed',async()=>{
 await assert.rejects(new FactoryEvidenceClient(config,async()=>new Response('{}',{status:503})).collect(b),EvidenceWaiting);
 await assert.rejects(new FactoryEvidenceClient(config,async()=>Response.json({code:'evidence_unavailable'},{status:409})).collect(b),e=>!(e instanceof EvidenceWaiting));
 let calls=0;await assert.rejects(new FactoryEvidenceClient({...config,evidence:{...config.evidence,token:config.token}},async()=>{calls++;return Response.json({});}).collect(b));assert.equal(calls,0);
});
