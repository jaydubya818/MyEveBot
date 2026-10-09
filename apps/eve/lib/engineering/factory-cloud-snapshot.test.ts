import {describe,it,expect} from 'vitest';
import vector from './fixtures/cloud-snapshot-v2.json';
import {verifyResult,validateManifest,digest} from './factory-producer-protocol.ts';

describe('Factory-generated cloud snapshot V2 interoperability',()=>{
 it('authenticates the exact signed Factory vector with immutable cloud policy and source pins',()=>{
  const {manifest}=verifyResult(vector.signed,vector.expected);
  expect(manifest.execution.version).toBe(2);expect(manifest.execution.inputTree).toMatch(/^[a-f0-9]{40}$/);
  expect(manifest.execution.configuration.cloud?.evidenceClass).toBe('DETERMINISTIC');
  expect(manifest.status).toBe('FAILED');expect(manifest.candidate).toBeNull();
 });
 it('rejects source/image mutation and prevents local qualification being relabeled cloud',()=>{
  const original=verifyResult(vector.signed,vector.expected).manifest;
  const image=structuredClone(original);image.execution.configuration.cloud!.workerImage='vercel/sandbox/node:24';expect(()=>validateManifest(image)).toThrow(/Immutable/);
  const legacy=structuredClone(original);legacy.execution.version=1;expect(()=>validateManifest(legacy)).toThrow();
  const changed=structuredClone(original);changed.execution.inputTree='f'.repeat(40);
  const encoded=Buffer.from(JSON.stringify(changed)).toString('base64url');
  expect(()=>verifyResult({...vector.signed,encoded,manifestDigest:digest(changed)},vector.expected)).toThrow();
 });
});
