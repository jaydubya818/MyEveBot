import {createHash,generateKeyPairSync,randomUUID} from 'node:crypto';
import {describe,it,expect,vi} from 'vitest';
import * as codec from './factory-producer-protocol.ts';
import type {LocalResultManifestV4} from './factory-producer-protocol.ts';
import {prepareAuthenticatedLocalFactoryInputV4} from './factory-authenticated-result.ts';
import {FactoryWriterStore,type FactoryWriter} from './factory-writer.ts';
import {WorkStore,type WorkDatabase} from './store.ts';
import type {RepositoryProfile} from './contract.ts';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const now=Date.now();
const objectId=(kind:string,bytes:Buffer)=>createHash('sha1').update(`${kind} ${bytes.length}\0`).update(bytes).digest('hex');
function protocolFixture(gitData?:{base:Buffer;inputTree:Buffer;commit:Buffer;candidateTree:Buffer;patch:Buffer}){
 const pair=generateKeyPairSync('ed25519');
 const tree=(body:string)=>Buffer.concat([Buffer.from('100644 input.txt\0'),Buffer.from(objectId('blob',Buffer.from(body)),'hex')]);
 const inputTree=gitData?.inputTree??tree('before\n'),inputTreeId=objectId('tree',inputTree);
 const base=gitData?.base??Buffer.from(`tree ${inputTreeId}\nauthor Synthetic <codec@example.invalid> 1793016000 +0000\ncommitter Synthetic <codec@example.invalid> 1793016000 +0000\n\nSynthetic admitted input\n`);
 const inputCommit=objectId('commit',base),candidateTree=gitData?.candidateTree??tree('after\n'),candidateTreeId=objectId('tree',candidateTree);
 const commit=gitData?.commit??Buffer.from(`tree ${candidateTreeId}\nparent ${inputCommit}\nauthor Synthetic <codec@example.invalid> 1793016001 +0000\ncommitter Synthetic <codec@example.invalid> 1793016001 +0000\n\nSynthetic candidate\n`);
 const candidate=objectId('commit',commit),patch=gitData?.patch??Buffer.from('diff --git a/input.txt b/input.txt\n--- a/input.txt\n+++ b/input.txt\n@@ -1 +1 @@\n-before\n+after\n'),log=Buffer.from('Synthetic producer check; not independent verification\n');
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

function fixture(kind:'legacy'|'v4'='v4',gitData?:Parameters<typeof protocolFixture>[0],sourceFiles?:Record<string,string>) {
 const v=protocolFixture(gitData),e=v.expected;
 const binding=prepareAuthenticatedLocalFactoryInputV4({...e,localSnapshotVersion:4,workId:randomUUID(),workVersion:1,workGeneration:1,criteriaVersion:1,agentId:'synthetic-agent'});
 const request={id:randomUUID(),binding,current:true,cancelled:false,eligible:true};
 const run:FactoryWriter={id:randomUUID(),work_id:binding.workId,work_version:1,work_generation:1,writer_generation:1,
  factory_request_id:request.id,dispatch_identity:randomUUID(),dispatch_state:'TERMINAL',status:'COMPLETED',stop_reason:null,fenced_at:new Date().toISOString(),factory_candidate:null};
 const source={sha:binding.inputCommit,files:sourceFiles??{'input.txt':'before\n'}};
 const profile:RepositoryProfile={id:'public-synthetic',version:1,repository:'fixture/repository',privateQualification:true,baseBranch:'main',allowedPaths:['input.txt'],
  checks:[{id:'synthetic-never-executed',program:'input.txt',input:'',expectedOutput:'',expectedExitCode:0,criterionIds:[randomUUID()]}],requiredCI:['public'],reviewerLogins:['synthetic-reviewer'],
  policyVersion:1,executor:'claude-code',image:'synthetic@sha256:'+'a'.repeat(64),maxRuns:1,maxModelRequests:1,maxOutputTokens:256};
 const sign=(m:LocalResultManifestV4,a:{id:string;base64:string}[])=>{
  if(kind==='v4')return codec.signLocalResultV4(m,a,v.privateKey);
  const {workspace,inputTree,version,...execution}=m.execution;
  return codec.signResult({...m,execution:{...execution,version:1}},a,v.privateKey);
 };
 if(kind==='legacy')for(const field of ['localSnapshotVersion','inputTree','configuration'])delete (binding as any)[field];
 let result=sign(v.manifest,v.artifacts);
 const receipt:any={id:randomUUID(),request_id:request.id,envelope:codec.canonical(result),envelope_digest:codec.sha256(codec.canonical(result)),state:'RECEIVED',provenance:null,history:[],received_at:v.manifest.issuedAt};
 const state:{admission:null|{receipt_id:string;manifest_digest:string};handoffs:any[]}={admission:null,handoffs:[]};
 const query=vi.fn(async(sql:string,params:any[]=[])=>{
  if(sql.startsWith('SELECT q.id'))return [structuredClone(request)];
  if(sql.startsWith('SELECT * FROM engineering_factory_receipts'))return params[1]===receipt.id?[structuredClone(receipt)]:[];
  if(sql.startsWith('SELECT receipt_id'))return state.admission?[structuredClone(state.admission)]:[];
  if(sql.startsWith('SELECT engineering_factory_receipt')){
   const p=JSON.parse(params[0]);if(p.action!=='transition')throw Error('No receive/register allowed');
   receipt.state=p.state;if(p.provenance)receipt.provenance=p.provenance;
   if(p.state==='ADMITTED'&&p.keyCurrent&&request.eligible)state.admission={receipt_id:receipt.id,manifest_digest:receipt.provenance.manifestDigest};
   return [{value:structuredClone(receipt)}];
  }
  if(sql.startsWith('SELECT engineering_writer_handoff')){const p=JSON.parse(params[0]);state.handoffs.push(p);return [{value:{factory_candidate:p.custody}}]}
  throw Error('Unexpected synthetic query '+sql);
 });
 const work=new WorkStore({scopeId:'synthetic-owner',scopeKind:'personal',actorId:'synthetic-owner'},{query} as WorkDatabase),writers=new FactoryWriterStore(work);
 const inspect=vi.spyOn(writers,'inspect').mockImplementation(async()=>structuredClone(run));
 vi.spyOn(writers,'identity').mockImplementation(async()=>({runId:run.id,writerGeneration:1,dispatchIdentity:run.dispatch_identity,workId:run.work_id,workGeneration:1,
  factoryId:e.factoryId,factoryVersion:e.factoryVersion,requestId:e.requestId,workOrderId:e.workOrderId,remoteRunId:e.runId,repository:'fixture/repository',baseSha:binding.inputCommit,allowedPaths:['input.txt'],deadline:'2099-01-01T00:00:00Z'}));
 const options={keys:vi.fn(async()=>v.options.keys)};
 const take=(supplied=structuredClone(run))=>kind==='v4'?writers.takeLocalCustodyV4(supplied,receipt.id,source,profile,options):writers.takeCustody(supplied,receipt.id,source,profile,options);
 const resign=(change:(m:LocalResultManifestV4,artifacts:{id:string;base64:string}[])=>void)=>{
  const m=structuredClone(v.manifest),a=structuredClone(v.artifacts);change(m,a);
  m.artifacts=m.artifacts.map(meta=>{const bytes=Buffer.from(a.find(x=>x.id===meta.id)!.base64,'base64');return {...meta,size:bytes.length,sha256:codec.sha256(bytes)}});
  m.candidate!.patchDigest=m.artifacts.find(x=>x.id==='patch')!.sha256;m.artifactDigest=codec.digest(m.artifacts);
  result=sign(m,a);receipt.envelope=codec.canonical(result);receipt.envelope_digest=codec.sha256(receipt.envelope);
 };
 return {v,run,request,source,profile,receipt,state,query,writers,inspect,options,take,resign};
}

describe('inactive explicit V4 candidate custody',()=>{
 it.each(['legacy','v4'] as const)('retains genuinely tracked ignored and empty source files during %s data custody',async kind=>{
  const dir=mkdtempSync(join(tmpdir(),'factory-tracked-ignore-'));
  const git=(...args:string[])=>execFileSync('git',['-c','core.hooksPath=/dev/null','-C',dir,...args],{env:{...process.env,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null'},timeout:10000,maxBuffer:2*1024*1024});
  try{
   git('init','--quiet','--template=','--object-format=sha1');git('config','user.name','Public data custody fixture');git('config','user.email','fixture@example.invalid');
   const files={'.gitignore':'input.txt\n','empty.txt':'','input.txt':'before\n'};
   for(const [path,text] of Object.entries(files))writeFileSync(join(dir,path),text);
   git('add','--force','--all');git('commit','--quiet','-m','Tracked ignored ordinary input');
   const base=git('cat-file','commit','HEAD'),inputTree=git('cat-file','tree','HEAD^{tree}');
   expect(git('ls-files','--stage').toString()).toContain('input.txt');expect(readFileSync(join(dir,'empty.txt')).length).toBe(0);
   writeFileSync(join(dir,'input.txt'),'after\n');git('add','--force','input.txt');git('commit','--quiet','-m','Ordinary text candidate');
   const commit=git('cat-file','commit','HEAD'),candidateTree=git('cat-file','tree','HEAD^{tree}'),patch=git('show','--format=','--binary','--no-ext-diff','--no-textconv','HEAD');
   const f=fixture(kind,{base,inputTree,commit,candidateTree,patch},files),saved=await f.take(),candidate=saved.factory_candidate.candidates[0];
   expect(candidate.files).toEqual({...files,'input.txt':'after\n'});expect(candidate.changedPaths).toEqual(['input.txt']);
   expect(candidate.rawCommit).toBe(commit.toString('utf8'));expect(candidate.sha).toBe(objectId('commit',commit));expect(candidate.tree).toBe(objectId('tree',candidateTree));expect(f.state.handoffs).toHaveLength(1);
  }finally{rmSync(dir,{recursive:true,force:true})}
 });
 it('preserves valid legacy regular-text handoff through the shared preflight',async()=>{
  const f=fixture('legacy'),saved=await f.take();expect(saved.factory_candidate.files).toEqual({'input.txt':'after\n'});
  expect(saved.factory_candidate.candidates[0].sha).toBe(f.v.manifest.candidate!.commit);expect(f.options.keys).toHaveBeenCalledTimes(3);
 });
 it.each(['legacy','v4'] as const)('rejects unsupported %s binary marker before Git processing',async kind=>{
  const f=fixture(kind);f.resign((_m,a)=>{a.find(x=>x.id==='patch')!.base64=Buffer.from('GIT binary patch\n').toString('base64')});
  await expect(f.take()).rejects.toThrow('Regular bounded text patch required');expect(f.state.handoffs).toHaveLength(0);
 });
 it('materializes real Git patch data and preserves raw commit identity without verification authority',async()=>{
  const f=fixture(),saved=await f.take(),c=saved.factory_candidate.candidates[0];
  expect(c.files).toEqual({'input.txt':'after\n'});expect(c.sha).toBe(f.v.manifest.candidate!.commit);
  expect(c.rawCommit).toBe(Buffer.from(f.v.artifacts.find(x=>x.id==='commit')!.base64,'base64').toString());
  expect(c.factoryProvenance.receiptId).toBe(f.receipt.id);expect(f.options.keys).toHaveBeenCalledTimes(6);
  expect(f.state.handoffs).toHaveLength(1);expect(Object.keys(saved)).toEqual(['factory_candidate']);
 });
 it.each(['id','work_id','work_version','work_generation','writer_generation','factory_request_id','dispatch_identity'] as const)('denies stale supplied %s before receipt or key mutation',async field=>{
  const f=fixture(),supplied={...f.run,[field]:typeof f.run[field]==='number'?99:randomUUID()};
  await expect(f.take(supplied)).rejects.toThrow('Exact completed');expect(f.options.keys).not.toHaveBeenCalled();expect(f.state.handoffs).toHaveLength(0);
 });
 it.each(['PREPARED','UNKNOWN','DISPATCHED','STOPPING'] as const)('refuses unresolved %s writer before intake',async state=>{
  const f=fixture();f.run.dispatch_state=state;await expect(f.take()).rejects.toThrow('Exact completed');expect(f.options.keys).not.toHaveBeenCalled();
 });
 it.each(['status','fenced_at','stop_reason'] as const)('refuses terminal %s fence mismatch',async field=>{
  const f=fixture();Object.assign(f.run,{[field]:field==='status'?'CANCELLED':field==='fenced_at'?null:'cancel'});await expect(f.take()).rejects.toThrow();expect(f.options.keys).not.toHaveBeenCalled();
 });
 it('refuses legacy mode without touching pending receipt custody',async()=>{
  const f=fixture();for(const key of ['localSnapshotVersion','configuration','inputTree'])delete (f.request.binding as any)[key];
  const before=structuredClone(f.receipt);await expect(f.take()).rejects.toThrow();expect(f.receipt).toEqual(before);expect(f.options.keys).not.toHaveBeenCalled();
 });
 it.each(['sha','files','tree','work','paths','repository','sha256'] as const)('rejects mismatched trusted %s',async mode=>{
  const f=fixture();if(mode==='sha')f.source.sha='2'.repeat(40);if(mode==='sha256')f.source.sha='2'.repeat(64);
  if(mode==='files')f.source.files['input.txt']='wrong\n';if(mode==='tree')f.request.binding.inputTree='3'.repeat(40);
  if(mode==='work')f.request.binding.workId=randomUUID();if(mode==='paths')f.request.binding.configuration.allowedPaths=['other.txt'];
  if(mode==='repository')f.profile.repository='other/repository';
  await expect(f.take()).rejects.toThrow();expect(f.state.handoffs).toHaveLength(0);expect(f.options.keys).not.toHaveBeenCalled();
 });
 it.each(['unsafe','nul','oversize','surrogate'] as const)('refuses invalid source %s before asynchronous reads',async mode=>{
  const f=fixture();if(mode==='unsafe')(f.source.files as any)['../escape']='bad';if(mode==='nul')f.source.files['input.txt']='\0';
  if(mode==='oversize')f.source.files['input.txt']='a'.repeat(100001);if(mode==='surrogate')f.source.files['input.txt']='\ud800';
  await expect(f.take()).rejects.toThrow();expect(f.inspect).not.toHaveBeenCalled();
 });
 it('snapshots source/profile before the first await',async()=>{
  const f=fixture(),pending=f.take();f.source.files['input.txt']='mutated';f.profile.allowedPaths.length=0;
  const saved=await pending;expect(saved.factory_candidate.sourceFiles).toEqual({'input.txt':'before\n'});expect(saved.factory_candidate.files).toEqual({'input.txt':'after\n'});
 });
 it('denies delivery aliases instead of linking unverified canonical custody',async()=>{
  const f=fixture();await f.take();f.state.handoffs.length=0;f.state.admission!.receipt_id=randomUUID();
  await expect(f.take()).rejects.toThrow('canonical');expect(f.state.handoffs).toHaveLength(0);
 });
 it('rechecks keys after Git materialization',async()=>{
  const f=fixture();let calls=0;f.options.keys.mockImplementation(async()=>++calls<4?f.v.options.keys:[{...f.v.options.keys[0],revokedAt:new Date().toISOString()}]);
  await expect(f.take()).rejects.toThrow('changed');expect(f.state.handoffs).toHaveLength(0);
 });
 it('refuses foreign receipt identity',async()=>{
  const f=fixture();f.receipt.request_id=randomUUID();await expect(f.take()).rejects.toThrow('integrity');expect(f.state.handoffs).toHaveLength(0);
 });
 it.each(['nul','invalid-utf8','binary-marker','patch-size','path-count'] as const)('rejects %s before candidate writes',async mode=>{
  const f=fixture();f.resign((_m,a)=>{
   const patch=a.find(x=>x.id==='patch')!;
   const body=mode==='nul'?Buffer.from('patch\0'):mode==='invalid-utf8'?Buffer.from([255]):mode==='binary-marker'?Buffer.from('GIT binary patch\n'):
    mode==='patch-size'?Buffer.alloc(2*1024*1024+1,97):Buffer.from(Array.from({length:201},(_,i)=>`diff --git a/f${i} b/f${i}\nnew file mode 100644\n--- /dev/null\n+++ b/f${i}\n@@ -0,0 +1 @@\n+x\n`).join(''));
   patch.base64=body.toString('base64');
  });await expect(f.take()).rejects.toThrow(mode==='path-count'?'Factory patch path bound':'Regular bounded text patch required');expect(f.state.handoffs).toHaveLength(0);
 });
 it.each(['copy from input.txt\ncopy to other.txt\n','rename from input.txt\nrename to other.txt\n','new file mode 120000\n','diff --git a/input.txt b/other.txt\n'])('refuses unsupported structural patch header %s',async header=>{
  const f=fixture();f.resign((_m,a)=>{const patch=a.find(x=>x.id==='patch')!;patch.base64=Buffer.from(header+Buffer.from(patch.base64,'base64').toString()).toString('base64')});
  await expect(f.take()).rejects.toThrow('Regular bounded text patch required');expect(f.state.handoffs).toHaveLength(0);
 });
 it.each(['malformed','binary','symlink','overflow','out-of-scope','tree-mismatch'] as const)('refuses authenticated %s patch data without a handoff',async mode=>{
  const f=fixture();f.resign((m,a)=>{
   const patch=a.find(x=>x.id==='patch')!;
   if(mode==='malformed')patch.base64=Buffer.from('not a Git patch').toString('base64');
   if(mode==='binary')patch.base64=Buffer.from('diff --git a/input.txt b/input.txt\nGIT binary patch\nliteral 1\nAc%1Fb\n').toString('base64');
   if(mode==='symlink')patch.base64=Buffer.from('diff --git a/link b/link\nnew file mode 120000\n--- /dev/null\n+++ b/link\n@@ -0,0 +1 @@\n+input.txt\n').toString('base64');
   if(mode==='overflow')patch.base64=Buffer.from('diff --git a/input.txt b/input.txt\n--- a/input.txt\n+++ b/input.txt\n@@ -1 +1 @@\n-before\n+'+'a'.repeat(100001)+'\n').toString('base64');
   if(mode==='out-of-scope')patch.base64=Buffer.from('diff --git a/other.txt b/other.txt\nnew file mode 100644\n--- /dev/null\n+++ b/other.txt\n@@ -0,0 +1 @@\n+extra\n').toString('base64');
   if(mode==='tree-mismatch')patch.base64=Buffer.from('diff --git a/input.txt b/input.txt\n--- a/input.txt\n+++ b/input.txt\n@@ -1 +1 @@\n-before\n+different\n').toString('base64');
  });await expect(f.take()).rejects.toThrow();expect(f.state.handoffs).toHaveLength(0);
 });
});
