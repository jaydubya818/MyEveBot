import {readFileSync} from 'node:fs';
import {generateKeyPairSync,randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import {describe,it,expect} from 'vitest';
import {prepareAuthenticatedFactoryInput,observeAuthenticatedFactoryResult} from './factory-authenticated-result.ts';
import {canonical,digest,sha256,signResult,type ResultManifest} from './factory-producer-protocol.ts';
import {signProtocolPayload} from './factory-producer-signature.ts';
import {readFactoryAttempt} from './factory-result-channel.ts';
const golden=JSON.parse(readFileSync(new URL('../../../../docs/verification/2026-09-27-q37-integration/myfactory/gate-c/durable/producer-golden.json',import.meta.url),'utf8'));
const manifest:ResultManifest=JSON.parse(Buffer.from(golden.result.encoded,'base64url').toString());
// Golden expectations are pinned before a delivered object is mutated.
const b=prepareAuthenticatedFactoryInput({workId:randomUUID(),workVersion:1,workGeneration:1,criteriaVersion:1,agentId:'fixture-agent',
 factoryId:golden.expected.factoryId,factoryVersion:golden.expected.factoryVersion,requestId:golden.expected.requestId,
 workOrderId:golden.expected.workOrderId,runId:golden.expected.runId,attemptNumber:1,inputCommit:manifest.execution.inputCommit,
 sourceDigest:manifest.execution.sourceDigest,configurationDigest:manifest.execution.configurationDigest,requestDigest:manifest.execution.requestDigest});
const pair=generateKeyPairSync('ed25519'),key={...golden.expected.keys[0],publicKey:pair.publicKey.export({type:'spki',format:'pem'}).toString()};
function signed(change:(m:ResultManifest)=>void) {
 const m=structuredClone(manifest);change(m);const encoded=Buffer.from(canonical(m)).toString('base64url');
 return {...structuredClone(golden.result),encoded,manifestDigest:digest(m),signature:signProtocolPayload('MYFACTORY_RESULT_V1',encoded,pair.privateKey)};
}
describe('qualified MyFactory protocol, no alternate Gate C format',()=>{
 it('accepts the exact saved producer golden result',()=>expect(observeAuthenticatedFactoryResult(golden.result,b,golden.expected.keys).manifest).toEqual(manifest));
 it.each(['factoryId','factoryVersion','requestId','requestDigest','workOrderId','runId','sourceDigest','configurationDigest','inputCommit'] as const)('rejects wrong expected %s',field=>{
  expect(()=>observeAuthenticatedFactoryResult(golden.result,{...b,[field]:'a'.repeat(field==='inputCommit'?40:64)},golden.expected.keys)).toThrow();
 });
 it('rejects wrong attempt number',()=>expect(()=>observeAuthenticatedFactoryResult(golden.result,{...b,attemptNumber:2},golden.expected.keys)).toThrow());
 it('rejects unknown or ambiguous key',()=>{
  expect(()=>observeAuthenticatedFactoryResult(golden.result,b,[])).toThrow(/key/);
  expect(()=>observeAuthenticatedFactoryResult(golden.result,b,[...golden.expected.keys,...golden.expected.keys])).toThrow(/key/);
 });
 it('rejects forged signature before trusting result fields',()=>{
  const r=structuredClone(golden.result);r.signature='a'.repeat(86);expect(()=>observeAuthenticatedFactoryResult(r,b,golden.expected.keys)).toThrow(/signature/);
 });
 it('rejects the earlier competing shape',()=>expect(()=>observeAuthenticatedFactoryResult({version:1,keyVersion:'ed25519-v1',manifest},b,[key])).toThrow(/Malformed/));
 it.each(['ready','authority','approval','writer','budget','publication'])('rejects signed %s injection',field=>{
  expect(()=>observeAuthenticatedFactoryResult(signed(m=>Object.assign(m,{[field]:true})),b,[key])).toThrow();
 });
 it('rejects forged producer with a known signer',()=>expect(()=>observeAuthenticatedFactoryResult(signed(m=>{m.producer='forged';}),b,[key])).toThrow());
 it('rejects substituted manifest digest',()=>expect(()=>observeAuthenticatedFactoryResult({...golden.result,manifestDigest:'0'.repeat(64)},b,golden.expected.keys)).toThrow());
 it.each([0,1,2,3,4])('rejects one changed byte in artifact %s',index=>{
  const r=structuredClone(golden.result),bytes=Buffer.from(r.artifacts[index].base64,'base64');bytes[0]^=1;r.artifacts[index].base64=bytes.toString('base64');
  expect(()=>observeAuthenticatedFactoryResult(r,b,golden.expected.keys)).toThrow(/digest/);
 });
 it('rejects signed evidence substitution and cross-candidate metadata',()=>{
  expect(()=>observeAuthenticatedFactoryResult(signed(m=>{m.evidence[0].candidateCommit='a'.repeat(40);m.evidenceDigest=digest(m.evidence);}),b,[key])).toThrow();
 });
 it('rejects validly signed noncanonical bytes',()=>{
  const encoded=Buffer.from(JSON.stringify(manifest,null,2)).toString('base64url');
  const r={...golden.result,encoded,signature:signProtocolPayload('MYFACTORY_RESULT_V1',encoded,pair.privateKey)};
  expect(()=>observeAuthenticatedFactoryResult(r,b,[key])).toThrow(/Noncanonical/);
 });
 it.each(['revokedAt','retiredAt','notAfter'])('enforces %s and historical semantics',field=>{
  const historical={...golden.expected.keys[0],[field]:new Date(Date.parse(manifest.issuedAt)+1000).toISOString()};
  expect(()=>observeAuthenticatedFactoryResult(golden.result,b,[historical])).toThrow();
  expect(observeAuthenticatedFactoryResult(golden.result,b,[historical],true).keyValidForCurrentUse).toBe(false);
 });
 it('rejects issuance before activation even in historical mode',()=>{
  const late={...golden.expected.keys[0],activeFrom:'2099-01-01T00:00:00Z'};
  expect(()=>observeAuthenticatedFactoryResult(golden.result,b,[late],true)).toThrow();
 });
 it('retains retired key 1 while accepting key 2 on a separately bound attempt',()=>{
  const m=structuredClone(manifest);m.keyId='key-2';m.execution.runId=randomUUID();m.execution.attemptNumber=2;
  m.operationId=digest(['MYFACTORY_RESULT_V1',m.producer,m.execution.requestId,m.execution.workOrderId,m.execution.runId]);
  m.artifacts.forEach(a=>a.runId=m.execution.runId);m.evidence.forEach(e=>e.runId=m.execution.runId);
  m.artifactDigest=digest(m.artifacts);m.evidenceDigest=digest(m.evidence);
  const result=signResult(m,golden.result.artifacts,pair.privateKey),retired={...golden.expected.keys[0],retiredAt:new Date(Date.parse(m.issuedAt)+1000).toISOString()};
  expect(observeAuthenticatedFactoryResult(result,{...b,runId:m.execution.runId,attemptNumber:2,operationId:m.operationId},[retired,{...key,keyId:'key-2'}]).keyValidForCurrentUse).toBe(true);
  expect(observeAuthenticatedFactoryResult(golden.result,b,[retired,{...key,keyId:'key-2'}],true).keyValidForCurrentUse).toBe(false);
 });
});
describe('authenticated exact-attempt artifact channel',()=>{
 it('retrieves and verifies a 256 KiB log via scoped bearer GET, no public URLs',async()=>{
  const m=structuredClone(manifest),artifacts=structuredClone(golden.result.artifacts),bytes=Buffer.alloc(256*1024,65);
  const log=m.artifacts.find(a=>a.kind==='check-log')!,a=artifacts.find((a:{id:string})=>a.id===log.id)!;
  log.size=bytes.length;log.sha256=sha256(bytes);a.base64=bytes.toString('base64');m.artifactDigest=digest(m.artifacts);
  const result=signResult(m,artifacts,pair.privateKey);let requests=0;
  const server=createServer((req,res)=>{requests++;expect(req.method).toBe('GET');expect(req.url).toBe(`/api/connect/v1/work-orders/${b.workOrderId}/runs/${b.runId}/result`);
   if(req.headers.authorization!=='Bearer synthetic-fixture-token'){res.writeHead(401).end();return;}res.setHeader('Content-Type','application/json');res.end(JSON.stringify({state:'COMPLETED',result}));});
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address() as {port:number};
  try {const config={origin:`http://127.0.0.1:${address.port}`,token:'synthetic-fixture-token'};
   const read=await readFactoryAttempt(config,b);expect(observeAuthenticatedFactoryResult(read.result,b,[key]).manifest.artifacts.find(a=>a.id===log.id)?.size).toBe(bytes.length);
   await expect(readFactoryAttempt({...config,token:'wrong'},b)).rejects.toThrow(/401/);expect(requests).toBe(2);
  }finally{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
 });
 it('never follows a result-provided URL and rejects non-local configured origins',async()=>{
  await expect(readFactoryAttempt({origin:'https://example.com/',token:'test'},b)).rejects.toThrow(/loopback/);
 });
 it.each(['RUNNING','STOPPING','UNKNOWN'])('retains %s without inventing a result',async state=>{
  const fake=(async()=>new Response(JSON.stringify({state,result:null}))) as typeof fetch;
  expect((await readFactoryAttempt({origin:'http://127.0.0.1:1234',token:'test'},b,fake)).state).toBe(state);
 });
});
