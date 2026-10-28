import { createHash, generateKeyPairSync, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, it, expect, vi } from 'vitest';
import * as codec from './factory-producer-protocol.ts';
import type { LocalResultManifestV4, ResultManifest, SignedResult } from './factory-producer-protocol.ts';
import { prepareAuthenticatedFactoryInput, prepareAuthenticatedLocalFactoryInputV4 } from './factory-authenticated-result.ts';
import type { FactoryBinding, LocalFactoryBindingV4, FactoryReceipt, FactoryRequest, FactoryReceiptStore, FactoryManifest, ReceiptState } from './factory-receipt-store.ts';
import { admitFactoryResult, resumeFactoryResult, admitLocalFactoryResultV4, resumeLocalFactoryResultV4 } from './factory-result-consumer.ts';

// Public synthetic Git objects and ephemeral signing keys. No filesystem or
// execution is inferred from a returned workspace association. Fixture shape is
// copied from the already public V4 codec vector, not protected holdout tests.
const now=Date.parse('2026-10-28T00:00:00Z');
const objectId=(kind:string,bytes:Buffer)=>createHash('sha1').update(`${kind} ${bytes.length}\0`).update(bytes).digest('hex');
function protocolFixture(){
 const pair=generateKeyPairSync('ed25519');
 const tree=(body:string)=>Buffer.concat([Buffer.from('100644 input.txt\0'),Buffer.from(objectId('blob',Buffer.from(body)),'hex')]);
 const inputTree=tree('before\n'),inputTreeId=objectId('tree',inputTree);
 const base=Buffer.from(`tree ${inputTreeId}\nauthor Synthetic <codec@example.invalid> 1793016000 +0000\ncommitter Synthetic <codec@example.invalid> 1793016000 +0000\n\nSynthetic admitted input\n`);
 const inputCommit=objectId('commit',base),candidateTree=tree('after\n'),candidateTreeId=objectId('tree',candidateTree);
 const commit=Buffer.from(`tree ${candidateTreeId}\nparent ${inputCommit}\nauthor Synthetic <codec@example.invalid> 1793016001 +0000\ncommitter Synthetic <codec@example.invalid> 1793016001 +0000\n\nSynthetic candidate\n`);
 const candidate=objectId('commit',commit),patch=Buffer.from('Synthetic inert patch\n'),log=Buffer.from('Synthetic producer check; not independent verification\n');
 const configuration={model:'openai/gpt-5.4-mini',executor:'codex-cli' as const,executorVersion:'synthetic-codec-only',skillRevision:'synthetic-skill',workerProfile:'mac' as const,verificationImage:'synthetic-verifier',nodeVersion:'v24.18.1',platform:'darwin',architecture:'arm64',commands:['node --test synthetic.test.mjs'],allowedPaths:['input.txt'],timeoutMs:1000};
 const sourceDigest='1'.repeat(64),configurationDigest=codec.digest(configuration),factoryId='synthetic-v4-factory';
 const request={ownerId:'synthetic-owner',workId:'33333333-3333-4333-8333-333333333333',workVersion:1,criteriaVersion:1,profile:{id:'synthetic-local-profile',version:1,configuration}};
 const execution={version:4 as const,factoryId,factoryVersion:codec.digest({sourceDigest,configurationDigest}),sourceDigest,configurationDigest,configuration,requestId:'synthetic-v4-request',requestDigest:codec.digest(request),workOrderId:'11111111-1111-4111-8111-111111111111',runId:'22222222-2222-4222-8222-222222222222',attemptNumber:1,inputCommit,inputTree:inputTreeId,workspace:{kind:'GIT_WORKTREE' as const,path:'/synthetic/owned-worktrees/attempt-one',branch:null},capturedAt:'2026-10-26T10:00:00.000Z'};
 const metadata=[['commit','git-commit',commit],['tree','git-tree',candidateTree],['patch','patch',patch],['check','check-log',log]] as const;
 const artifacts=metadata.map(([id,,bytes])=>({id,base64:bytes.toString('base64')}));
 const artifactMetadata=metadata.map(([id,kind,bytes])=>({id,kind,producer:factoryId,runId:execution.runId,candidateCommit:candidate,sha256:codec.sha256(bytes),size:bytes.length,createdAt:'2026-10-26T10:00:00.200Z'}));
 const evidence=[{id:'synthetic-check',producer:factoryId,runId:execution.runId,candidateCommit:candidate,command:configuration.commands[0],status:'passed' as const,exitCode:0,startedAt:'2026-10-26T10:00:00.100Z',finishedAt:'2026-10-26T10:00:00.200Z',logArtifactId:'check'}];
 const manifest:LocalResultManifestV4={protocol:codec.RESULT_PROTOCOL,keyId:'synthetic-key',producer:factoryId,operationId:codec.digest([codec.RESULT_PROTOCOL,factoryId,execution.requestId,execution.workOrderId,execution.runId]),execution,status:'COMPLETED',candidate:{commit:candidate,tree:candidateTreeId,base:inputCommit,patchDigest:codec.sha256(patch),commitArtifactId:'commit',treeArtifactId:'tree',patchArtifactId:'patch'},evidence,artifacts:artifactMetadata,evidenceDigest:codec.digest(evidence),artifactDigest:codec.digest(artifactMetadata),completedAt:'2026-10-26T10:00:00.300Z',issuedAt:'2026-10-26T10:00:00.400Z'};
 const {version,workspace,capturedAt,...expected}=structuredClone(execution);
 const key={factoryId,keyId:manifest.keyId,publicKey:pair.publicKey.export({type:'spki',format:'pem'}).toString(),activeFrom:'2020-01-01T00:00:00Z',notAfter:'2099-01-01T00:00:00Z'};
 return {manifest,artifacts,expected,privateKey:pair.privateKey,options:{expected,keys:[key],now},request};
}

function consumerFixture(kind: 'legacy'|'v4' = 'v4') {
 const vector=protocolFixture();
 const golden=JSON.parse(readFileSync(new URL('../../../../docs/verification/2026-09-27-q37-integration/myfactory/gate-c/durable/producer-golden.json',import.meta.url),'utf8'));
 const manifest=kind==='v4'?vector.manifest:JSON.parse(Buffer.from(golden.result.encoded,'base64url').toString()) as ResultManifest;
 const pair=generateKeyPairSync('ed25519'),key={...vector.options.keys[0],factoryId:manifest.producer,keyId:manifest.keyId,
  publicKey:pair.publicKey.export({type:'spki',format:'pem'}).toString()};
 const artifacts=kind==='v4'?vector.artifacts:golden.result.artifacts;
 const result=kind==='v4'?codec.signLocalResultV4(manifest as LocalResultManifestV4,artifacts,pair.privateKey):codec.signResult(manifest as ResultManifest,artifacts,pair.privateKey);
 const e=manifest.execution;
 const common={workId:randomUUID(),workVersion:1,workGeneration:1,criteriaVersion:1,agentId:'synthetic-v4-consumer',
  factoryId:e.factoryId,factoryVersion:e.factoryVersion,requestId:e.requestId,requestDigest:e.requestDigest,
  sourceDigest:e.sourceDigest,configurationDigest:e.configurationDigest,workOrderId:e.workOrderId,runId:e.runId,attemptNumber:e.attemptNumber,inputCommit:e.inputCommit};
 const binding=kind==='v4'?prepareAuthenticatedLocalFactoryInputV4({...common,localSnapshotVersion:4,inputTree:vector.expected.inputTree,configuration:vector.expected.configuration}):prepareAuthenticatedFactoryInput(common);
 const requestId=randomUUID(),receiptId=randomUUID(),envelope=codec.canonical(result);
 const data:{request:FactoryRequest<FactoryBinding|LocalFactoryBindingV4>;receipt:FactoryReceipt<FactoryManifest>;admission:Record<string,unknown>|null}={
  request:{id:requestId,binding,current:true,cancelled:false,eligible:true},
  receipt:{id:receiptId,request_id:requestId,envelope,envelope_digest:codec.sha256(envelope),received_at:manifest.issuedAt,state:'RECEIVED',reason:null,history:[{state:'RECEIVED'}],provenance:null},admission:null,
 };
 // Tests recovery decisions only. The actual Work-serialized SQL admission
 // remains independently covered by its existing disposable PostgreSQL suite.
 const methods={
  request:vi.fn(async()=>structuredClone(data.request)),get:vi.fn(async()=>structuredClone(data.receipt)),
  receive:vi.fn(async(_requestId:string,value:unknown)=>{
   data.receipt.envelope=codec.canonical(value);data.receipt.envelope_digest=codec.sha256(data.receipt.envelope);
   return structuredClone(data.receipt);
  }),
  transition:vi.fn(async(_row:FactoryReceipt<FactoryManifest>,state:ReceiptState,extra:{provenance?:FactoryReceipt<FactoryManifest>['provenance'];reason?:string;keyCurrent?:boolean}={})=>{
   data.receipt.state=state;data.receipt.history.push({state});
   if(extra.provenance)data.receipt.provenance=structuredClone(extra.provenance);
   if(extra.reason)data.receipt.reason=extra.reason;
   if(state==='ADMITTED'&&extra.keyCurrent&&data.request.eligible)data.admission={receipt_id:receiptId,manifest_digest:data.receipt.provenance!.manifestDigest};
   return structuredClone(data.receipt);
  }),admission:vi.fn(async()=>structuredClone(data.admission)),
 };
 const legacyStore=methods as unknown as FactoryReceiptStore;
 const v4Store=methods as unknown as FactoryReceiptStore<LocalResultManifestV4,LocalFactoryBindingV4>;
 const options={keys:vi.fn(async():Promise<codec.ResultKey[]>=>[key])};
 const resume=()=>kind==='v4'?resumeLocalFactoryResultV4(v4Store,requestId,receiptId,options):resumeFactoryResult(legacyStore,requestId,receiptId,options);
 const admit=()=>kind==='v4'?admitLocalFactoryResultV4(v4Store,requestId,result,options):admitFactoryResult(legacyStore,requestId,result,options);
 const rawSign=(change:(m:any)=>void)=>{
  const m=structuredClone(manifest);change(m);const encoded=Buffer.from(codec.canonical(m)).toString('base64url');
  // Reuse a real signer on raw hostile bytes to exercise receiver validation.
  return {...result,encoded,manifestDigest:codec.sha256(Buffer.from(encoded,'base64url')),
   signature:signRaw(encoded,pair.privateKey)};
 };
 return {kind,data,methods,legacyStore,v4Store,options,key,manifest,result,requestId,receiptId,resume,admit,rawSign};
}

import { signProtocolPayload as signRawPayload } from './factory-producer-signature.ts';
function signRaw(encoded:string,key:Parameters<typeof signRawPayload>[2]) { return signRawPayload(codec.RESULT_PROTOCOL,encoded,key); }

describe('inactive explicit local V4 receipt consumer',()=>{
 it('authenticates exact V4 custody without independent verification or Ready authority',async()=>{
  const f=consumerFixture();expect(await f.admit()).toMatchObject({status:'ADMITTED',factoryProvenance:'VERIFIED',eligibleForCurrentAdmission:true,
   candidate:f.manifest.candidate,factoryGrantedAuthority:0,independentVerification:'NOT_RUN',readiness:'NOT_READY'});
  expect(f.methods.transition.mock.calls.map(c=>c[1])).toEqual(['AUTHENTICATED','ATTESTED','INTEGRITY_VERIFIED','ADMITTED']);
  expect(f.options.keys).toHaveBeenCalledTimes(3);
 });
 it.each(['RECEIVED','AUTHENTICATED','ATTESTED','INTEGRITY_VERIFIED','ADMITTED'] as const)('resumes the same receipt after interruption at %s',async stage=>{
  const f=consumerFixture(),options={...f.options,afterStage:async(state:ReceiptState)=>{if(state===stage)throw Error('SYNTHETIC_INTERRUPTION');}};
  await expect(admitLocalFactoryResultV4(f.v4Store,f.requestId,f.result,options)).rejects.toThrow('SYNTHETIC_INTERRUPTION');
  expect(f.data.receipt.state).toBe(stage);expect(await f.resume()).toMatchObject({receiptId:f.receiptId,eligibleForCurrentAdmission:true});
  expect(f.methods.receive).toHaveBeenCalledTimes(1);
 });
 it.each((['legacy','v4'] as const).flatMap(kind=>(['RECEIVED','AUTHENTICATED','ATTESTED','INTEGRITY_VERIFIED'] as const).map(stage=>[kind,stage] as const)))('wrong wrapper on %s custody at %s performs no writes or keys reads; correct wrapper recovers',async(kind,stage)=>{
  const f=consumerFixture(kind);
  if(stage!=='RECEIVED') {
   const options={...f.options,afterStage:async(state:ReceiptState)=>{if(state===stage)throw Error('SYNTHETIC_PENDING');}};
   await expect(kind==='v4'?resumeLocalFactoryResultV4(f.v4Store,f.requestId,f.receiptId,options):resumeFactoryResult(f.legacyStore,f.requestId,f.receiptId,options)).rejects.toThrow('SYNTHETIC_PENDING');
  }
  const before=structuredClone(f.data);Object.values(f.methods).forEach(method=>method.mockClear());f.options.keys.mockClear();
  const wrongResume=()=>kind==='v4'?resumeFactoryResult(f.legacyStore,f.requestId,f.receiptId,f.options):resumeLocalFactoryResultV4(f.v4Store,f.requestId,f.receiptId,f.options);
  const wrongAdmit=()=>kind==='v4'?admitFactoryResult(f.legacyStore,f.requestId,f.result,f.options):admitLocalFactoryResultV4(f.v4Store,f.requestId,f.result,f.options);
  await expect(wrongResume()).rejects.toThrow();await expect(wrongAdmit()).rejects.toThrow();
  expect(f.data).toEqual(before);expect(f.options.keys).not.toHaveBeenCalled();expect(f.methods.receive).not.toHaveBeenCalled();
  expect(f.methods.get).not.toHaveBeenCalled();expect(f.methods.transition).not.toHaveBeenCalled();expect(f.methods.admission).not.toHaveBeenCalled();
  expect(await f.resume()).toMatchObject({receiptId:f.receiptId,eligibleForCurrentAdmission:true});expect(f.methods.receive).not.toHaveBeenCalled();
 });
 it.each(['localSnapshotVersion','inputTree','configuration','operationId','configurationDigest'] as const)('invalid retained %s is refused without mutating custody',async field=>{
  const f=consumerFixture();Object.assign(f.data.request.binding,{[field]:null});const before=structuredClone(f.data);
  await expect(f.resume()).rejects.toThrow();await expect(f.admit()).rejects.toThrow();expect(f.data).toEqual(before);
  expect(f.options.keys).not.toHaveBeenCalled();expect(f.methods.receive).not.toHaveBeenCalled();expect(f.methods.transition).not.toHaveBeenCalled();
 });
 it.each(['id','request_id','envelope_digest'] as const)('retains corrupted delivery %s without a keys read or rewrite',async field=>{
  const f=consumerFixture();f.data.receipt[field]='0'.repeat(64);await expect(f.resume()).rejects.toThrow(/integrity/);
  expect(f.options.keys).not.toHaveBeenCalled();expect(f.methods.transition).not.toHaveBeenCalled();
 });
 it.each(['manifestDigest','keyFingerprint','keyId','protocol','manifest'] as const)('refuses changed retained provenance %s',async field=>{
  const f=consumerFixture();await f.admit();const p=f.data.receipt.provenance!;
  if(field==='manifest')p.manifest.issuedAt='2026-10-26T10:00:00.401Z';else p[field]='substituted';
  f.methods.transition.mockClear();await expect(f.resume()).rejects.toThrow(/provenance/);expect(f.methods.transition).not.toHaveBeenCalled();
 });
 it.each([1,2,3,5])('V4 custody rejects a signed version %s payload',async version=>{
  const f=consumerFixture(),result=f.rawSign(m=>m.execution.version=version);
  expect(await admitLocalFactoryResultV4(f.v4Store,f.requestId,result,f.options)).toMatchObject({status:'REJECTED',eligibleForCurrentAdmission:false});
 });
 it.each(['inputTree','verification','configuration','workspace'] as const)('rejects signed invalid %s instead of inferring trusted expectations',async field=>{
  const f=consumerFixture(),result=f.rawSign(m=>{if(field==='verification')m.verification=null;else m.execution[field]=null;});
  expect(await admitLocalFactoryResultV4(f.v4Store,f.requestId,result,f.options)).toMatchObject({status:'REJECTED',factoryProvenance:'UNVERIFIED',eligibleForCurrentAdmission:false});
 });
 it('legacy receipt APIs still reject a valid authenticated V4 payload on a legacy request',async()=>{
  const f=consumerFixture();const {localSnapshotVersion,inputTree,configuration,...legacy}=f.data.request.binding as LocalFactoryBindingV4;
  f.data.request.binding=legacy;
  expect(await admitFactoryResult(f.legacyStore,f.requestId,f.result,f.options)).toMatchObject({status:'REJECTED',eligibleForCurrentAdmission:false});
 });
 it.each(['inputTree','profile','cloud'] as const)('rejects signed %s substitution against independent request expectations',async field=>{
  const f=consumerFixture(),result=f.rawSign(m=>{
   if(field==='inputTree')m.execution.inputTree='2'.repeat(40);
   if(field==='profile') {
    m.execution.configuration.commands=['node synthetic-other-command.mjs'];
    m.execution.configurationDigest=codec.digest(m.execution.configuration);
    m.execution.factoryVersion=codec.digest({sourceDigest:m.execution.sourceDigest,configurationDigest:m.execution.configurationDigest});
   }
   if(field==='cloud')m.execution.configuration.cloud={provider:'synthetic-cloud'};
  });
  expect(await admitLocalFactoryResultV4(f.v4Store,f.requestId,result,f.options)).toMatchObject({status:'REJECTED',eligibleForCurrentAdmission:false});
 });
 it('refuses a substituted artifact byte after signature authentication',async()=>{
  const f=consumerFixture(),result=structuredClone(f.result);result.artifacts[0].base64=Buffer.from('tampered').toString('base64');
  expect(await admitLocalFactoryResultV4(f.v4Store,f.requestId,result,f.options)).toMatchObject({status:'REJECTED',eligibleForCurrentAdmission:false});
 });
 it.each(['retiredAt','revokedAt','notAfter'] as const)('preserves historical provenance without admission under current %s',async field=>{
  const f=consumerFixture();f.options.keys.mockResolvedValue([{...f.key,[field]:'2026-10-27T00:00:00Z'}]);
  expect(await f.resume()).toMatchObject({factoryProvenance:'VERIFIED',eligibleForCurrentAdmission:false,readiness:'NOT_READY'});
 });
 it('a key retirement between stages fences current admission',async()=>{
  const f=consumerFixture();f.options.keys.mockResolvedValueOnce([f.key]).mockResolvedValueOnce([f.key]).mockResolvedValue([{...f.key,retiredAt:'2026-10-27T00:00:00Z'}]);
  expect(await f.resume()).toMatchObject({factoryProvenance:'VERIFIED',eligibleForCurrentAdmission:false});
 });
 it('trust outage preserves the pending receipt for retry without resubmission',async()=>{
  const f=consumerFixture(),before=structuredClone(f.data);f.options.keys.mockRejectedValueOnce(Error('SYNTHETIC_TRUST_OUTAGE'));
  await expect(f.resume()).rejects.toThrow('SYNTHETIC_TRUST_OUTAGE');expect(f.data).toEqual(before);expect(f.methods.transition).not.toHaveBeenCalled();
  expect(await f.resume()).toMatchObject({eligibleForCurrentAdmission:true});expect(f.methods.receive).not.toHaveBeenCalled();
 });
 it('losing current Work eligibility cannot authorize retained verified bytes',async()=>{
  const f=consumerFixture();await f.admit();f.data.request.eligible=false;
  expect(await f.resume()).toMatchObject({factoryProvenance:'VERIFIED',eligibleForCurrentAdmission:false});
 });
});
