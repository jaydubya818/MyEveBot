import {readFileSync} from 'node:fs';
import {generateKeyPairSync,randomUUID} from 'node:crypto';
import {it,expect} from 'vitest';
import {retainedFactoryCheckpoint,assertFencedFactoryAccounting} from './factory-checkpoint.ts';
import {canonical,digest,sha256,signResult} from './factory-producer-protocol.ts';
import type {WorkStore} from './store.ts';
function fixture(){
 const golden=JSON.parse(readFileSync(new URL('../../../../docs/verification/2026-09-27-q37-integration/myfactory/gate-c/durable/producer-golden.json',import.meta.url),'utf8'));
 const manifest=JSON.parse(Buffer.from(golden.result.encoded,'base64url').toString());
 const pair=generateKeyPairSync('ed25519'),key={...golden.expected.keys[0],publicKey:pair.publicKey.export({type:'spki',format:'pem'}).toString()};
 manifest.status='CANCELLED';manifest.evidence=[];manifest.artifacts=manifest.artifacts.filter((a:any)=>a.kind!=='check-log');
 manifest.evidenceDigest=digest([]);manifest.artifactDigest=digest(manifest.artifacts);
 const artifacts=golden.result.artifacts.filter((a:any)=>manifest.artifacts.some((b:any)=>a.id===b.id));
 const result=signResult(manifest,artifacts,pair.privateKey),workId=randomUUID();
 const binding={...golden.expected,workId,workVersion:1,workGeneration:1,operationId:manifest.operationId,sourceDigest:manifest.execution.sourceDigest,configurationDigest:manifest.execution.configurationDigest,requestDigest:manifest.execution.requestDigest,inputCommit:manifest.execution.inputCommit,attemptNumber:manifest.execution.attemptNumber};delete binding.keys;
 const receipt={id:randomUUID(),request_id:binding.requestId,envelope:canonical(result),envelope_digest:sha256(canonical(result)),provenance:{key,manifestDigest:result.manifestDigest}};
 const store={principal:{scopeKind:'personal',scopeId:'owner',actorId:'owner'},get:async(id:string)=>{if(id!==workId)throw Error('not found');return {id};},database:{query:async(sql:string)=>sql.includes('r.provenance#>>')?[{id:receipt.id,request_id:binding.requestId}]:sql.includes('q.id,q.binding')?[{id:binding.requestId,binding}]:[receipt]}};
 return {store:store as unknown as WorkStore,workId,receipt,result,binding};
}
it('rechecks signed cancelled checkpoint bytes without granting custody or success',async()=>{
 const f=fixture(),view=await retainedFactoryCheckpoint(f.store,f.workId);
 expect(view?.trust).toBe('ADVISORY_ONLY');expect(view?.independentlyVerified).toBe(false);expect(view?.authorityGranted).toBe(false);
 await expect(retainedFactoryCheckpoint(f.store,randomUUID())).rejects.toThrow('not found');
});
it('rejects substituted checkpoint artifacts even when the stored envelope digest matches',async()=>{
 const f=fixture();f.result.artifacts[0].base64=Buffer.from('substituted').toString('base64');
 f.receipt.envelope=canonical(f.result);f.receipt.envelope_digest=sha256(f.receipt.envelope);
 await expect(retainedFactoryCheckpoint(f.store,f.workId)).rejects.toThrow();
});
it.each(['inputCommit','requestDigest','attemptNumber','sourceDigest','configurationDigest','operationId'] as const)('rejects a valid signed checkpoint with mismatched stored %s',async field=>{
 const f=fixture();
 (f.binding as any)[field]=field==='attemptNumber'?f.binding.attemptNumber+1:'f'.repeat(field==='inputCommit'?40:64);
 await expect(retainedFactoryCheckpoint(f.store,f.workId)).rejects.toThrow('Factory attestation binding mismatch');
});
it('rejects a retained provenance digest that differs from the verified envelope',async()=>{
 const f=fixture();f.receipt.provenance.manifestDigest='f'.repeat(64);
 await expect(retainedFactoryCheckpoint(f.store,f.workId)).rejects.toThrow('Checkpoint provenance digest changed');
});

it('retains cancelled-generation liabilities even when current Work has no current writer',async()=>{
 const spend=JSON.parse(readFileSync(new URL('../../test/fixtures/sofie-settled-cancelled-ledger.json',import.meta.url),'utf8'));
 const op=spend.operations[0];const row={binding:{workId:spend.workId,workGeneration:spend.workGeneration,requestId:spend.requestId,workOrderId:spend.workOrderId,runId:op.runId,factoryVersion:op.factoryVersion},dispatch_identity:op.dispatchIdentity,dispatch_state:'TERMINAL',fenced_at:new Date().toISOString(),deadline:spend.deadline,spend};
 const store={principal:{scopeKind:'personal',scopeId:'owner',actorId:'owner'},get:async()=>({id:spend.workId,generation:spend.workGeneration+1,maxCostUsd:spend.ceilingMicrousd/1e6}),database:{query:async()=>[row]}} as unknown as WorkStore;
 expect(await assertFencedFactoryAccounting(store,spend.workId)).toHaveLength(1);
 spend.status='UNKNOWN';await expect(assertFencedFactoryAccounting(store,spend.workId)).rejects.toThrow();
});
