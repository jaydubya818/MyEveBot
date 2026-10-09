import {describe,it,expect} from 'vitest';
import {cloudCustodyFiles} from './factory-cloud-custody.ts';
import {treeObjects,assertFactoryCandidateIdentity} from './github.ts';
import type {ExecutionSnapshot} from './factory-producer-protocol.ts';
import {createHash} from 'node:crypto';
import {digest} from './contract.ts';
import type {Candidate} from './execution.ts';

describe('cloud custody projection without a local Git process',()=>{
 const source={sha:'a'.repeat(40),files:{'nested/file.mjs':'before\n'}};
 const snapshot={version:2,inputCommit:source.sha,inputTree:treeObjects(source.files).sha,configuration:{workerProfile:'container',cloud:{evidenceClass:'DETERMINISTIC'}}} as ExecutionSnapshot;
 it('preserves bytes and checks exact signed candidate identity',()=>{
  const files=cloudCustodyFiles(source,{'nested/file.mjs':'after\n'},snapshot),tree=treeObjects(files).sha;
  const patch=JSON.stringify([{path:'nested/file.mjs',before:'before\n',after:'after\n'}]);
  const rawCommit=`tree ${tree}\nparent ${source.sha}\nauthor Factory <factory@invalid> 1700000000 +0000\ncommitter Factory <factory@invalid> 1700000000 +0000\n\nCandidate\n`;
  const sha=createHash('sha1').update(`commit ${Buffer.byteLength(rawCommit)}\0`).update(rawCommit).digest('hex');
  const candidate={producer:'MYFACTORY',factoryProvenance:{receiptId:'receipt'},workId:'work',repository:'fixture/project',baseSha:source.sha,parentSha:source.sha,files,tree,patch,changedPaths:['nested/file.mjs'],rawCommit,sha,artifactHash:digest({files,patch})} as Candidate;
  const contract={workId:'work',repository:'fixture/project',baseSha:source.sha,profile:{allowedPaths:['nested/file.mjs']}};
  expect(()=>assertFactoryCandidateIdentity(contract,source,candidate)).not.toThrow();
  candidate.files['nested/file.mjs']='tampered';expect(()=>assertFactoryCandidateIdentity(contract,source,candidate)).toThrow();
 });
 it('requires the exact full source tree, version and bounded regular text',()=>{
  expect(()=>cloudCustodyFiles(source,source.files,{...snapshot,inputTree:'b'.repeat(40)})).toThrow();
  expect(()=>cloudCustodyFiles(source,source.files,{...snapshot,version:1})).toThrow();
  for(const files of [undefined,{'../escape':'x'},{'nested':'file','nested/file':'collision'},{'file':'\0'},Object.assign(Object.create(null),source.files)])expect(()=>cloudCustodyFiles(source,files,snapshot)).toThrow();
 });
});
