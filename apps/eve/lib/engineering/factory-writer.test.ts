import {createHash} from 'node:crypto';
import {describe,expect,it,vi} from 'vitest';
import {fixture} from '../../test/engineering-fixtures.ts';
import {assertFactoryCandidateIdentity} from './github.ts';
import {FactoryWriterStore,type FactoryExecutionIdentity,type FactoryWriter} from './factory-writer.ts';
import type {WorkStore} from './store.ts';

function factoryCandidate() {
 const f=fixture(),candidate=structuredClone(f.candidate);
 candidate.producer='MYFACTORY';
 candidate.factoryProvenance={receiptId:'receipt',requestId:'request',factoryId:'factory',factoryVersion:'d'.repeat(64),workOrderId:'order',remoteRunId:'remote',attemptNumber:1,writerGeneration:2};
 candidate.rawCommit=`tree ${candidate.tree}\nparent ${candidate.baseSha}\nauthor Factory Producer <factory@example.invalid> 1700000000 +0000\ncommitter Factory Producer <factory@example.invalid> 1700000000 +0000\n\nOriginal producer message\n`;
 candidate.sha=createHash('sha1').update(`commit ${Buffer.byteLength(candidate.rawCommit)}\0`).update(candidate.rawCommit).digest('hex');
 return {...f,candidate,base:{sha:candidate.baseSha,files:{"quantity.mjs":"console.log(0);"}}};
}
describe('Factory custody identity',()=>{
 it('verifies the exact producer commit without rewriting its author or message',()=>{
  const f=factoryCandidate(),before=structuredClone(f.candidate);
  expect(()=>assertFactoryCandidateIdentity(f.contract,f.base,f.candidate)).not.toThrow();
  expect(f.candidate).toEqual(before);
 });
 it.each(['sha','tree','patch','artifactHash','baseSha','parentSha','workId','repository'] as const)('rejects changed %s',key=>{
  const f=factoryCandidate();f.candidate[key]='tampered';
  expect(()=>assertFactoryCandidateIdentity(f.contract,f.base,f.candidate)).toThrow();
 });
 it('rejects a base outside the admitted contract even when the commit matches that base',()=>{
  const f=factoryCandidate();f.contract.baseSha='b'.repeat(40);
  expect(()=>assertFactoryCandidateIdentity(f.contract,f.base,f.candidate)).toThrow();
 });
 it('rejects modified source bytes and multiple parents',()=>{
  const f=factoryCandidate();f.candidate.files[Object.keys(f.candidate.files)[0]]+='tampered';
  expect(()=>assertFactoryCandidateIdentity(f.contract,f.base,f.candidate)).toThrow();
  const g=factoryCandidate();g.candidate.rawCommit=g.candidate.rawCommit!.replace('\nauthor ',`\nparent ${'b'.repeat(40)}\nauthor `);
  g.candidate.sha=createHash('sha1').update(`commit ${Buffer.byteLength(g.candidate.rawCommit)}\0`).update(g.candidate.rawCommit).digest('hex');
  expect(()=>assertFactoryCandidateIdentity(g.contract,g.base,g.candidate)).toThrow();
 });
 it('does not accept native producer relabeling or missing Factory provenance',()=>{
  const f=factoryCandidate();delete f.candidate.factoryProvenance;
  expect(()=>assertFactoryCandidateIdentity(f.contract,f.base,f.candidate)).toThrow();
  const g=factoryCandidate();delete g.candidate.producer;
  expect(()=>assertFactoryCandidateIdentity(g.contract,g.base,g.candidate)).toThrow();
 });
});
describe('trusted Factory quiescence boundary',()=>{
 it.each(['runId','writerGeneration','dispatchIdentity','workId','workGeneration','factoryId','factoryVersion','requestId','workOrderId','remoteRunId','repository','baseSha','allowedPaths','deadline'] as const)('rejects mismatched %s before durable release',async key=>{
  const query=vi.fn(),store=new FactoryWriterStore({database:{query}} as unknown as WorkStore);
  const identity:FactoryExecutionIdentity={runId:'run',writerGeneration:2,dispatchIdentity:'dispatch',workId:'work',workGeneration:3,factoryId:'factory',factoryVersion:'d'.repeat(64),requestId:'request',workOrderId:'order',remoteRunId:'remote',repository:'fixture/golden',baseSha:'a'.repeat(40),allowedPaths:['file.ts'],deadline:'2099-01-01T00:00:00.000Z'};
  vi.spyOn(store,'identity').mockResolvedValue(identity);
  const observation={...identity,[key]:key==='allowedPaths'?['outside.ts']:typeof identity[key]==='number'?99:'other',state:'COMPLETED' as const,quiescent:true as const,evidenceRef:'trusted-observation'};
  await expect(store.reconcile({} as FactoryWriter,{dispatch:vi.fn(),stop:vi.fn(),observe:async()=>observation})).rejects.toThrow(/another writer or scope/);
  expect(query).not.toHaveBeenCalled();
 });
});
