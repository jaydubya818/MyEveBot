import { cloudCustodyFiles } from './factory-cloud-custody.ts';
import { assertBusinessEffect } from "../business-effects.ts";
import {randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp, mkdir, writeFile, readFile, lstat, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {WorkStore} from './store.ts';
import {WorkError} from './types.ts';
import {FactoryReceiptStore,type LocalFactoryBindingV4} from './factory-receipt-store.ts';
import {resumeFactoryResult,resumeLocalFactoryResultV4,type ConsumerOptions} from './factory-result-consumer.ts';
import {requireLocalFactoryBindingV4} from './factory-authenticated-result.ts';
import {assertFactoryCandidateIdentity,treeObjects,type RepositorySnapshot} from './github.ts';
import {digest,profileSchema,type RepositoryProfile} from './contract.ts';
import type {Candidate} from './execution.ts';
import type {SignedResult,LocalResultManifestV4} from './factory-producer-protocol.ts';

export interface FactoryWriter {
 id:string;work_id:string;work_version:number;work_generation:number;writer_generation:number;
 factory_request_id:string;dispatch_identity:string;dispatch_state:'PREPARED'|'UNKNOWN'|'DISPATCHED'|'STOPPING'|'TERMINAL';
 status:string;stop_reason:string|null;fenced_at:string|null;factory_candidate:Record<string,unknown>|null;
}
export interface FactoryExecutionIdentity {
 runId:string;writerGeneration:number;dispatchIdentity:string;workId:string;workGeneration:number;
 factoryId:string;factoryVersion:string;requestId:string;workOrderId:string;remoteRunId:string;
 repository:string;baseSha:string;allowedPaths:string[];deadline:string;
}
export interface FactoryQuiescence extends FactoryExecutionIdentity {
 state:'COMPLETED'|'FAILED'|'CANCELLED'|'NOT_DISPATCHED';quiescent:true;evidenceRef:string;
}
/** Trusted server adapter. It must fence every mutation with this identity and
 * establish absence of productive processes AND durably reject delayed/replayed
 * dispatch for that identity before returning quiescent:true (including
 * NOT_DISPATCHED). Observing an absent process alone is insufficient.
 * Neither a user/model claim nor the Gate C signed result implements this API. */
export interface FactoryExecutionTransport {
 dispatch(identity:FactoryExecutionIdentity):Promise<void>;
 stop(identity:FactoryExecutionIdentity):Promise<void>;
 observe(identity:FactoryExecutionIdentity):Promise<FactoryQuiescence|null>;
}

/** Coordinates only the canonical route Run. Admission remains RouteAdmissionService.
 * A dispatch claim is committed as UNKNOWN before I/O. Recovery never resends it. */
export class FactoryWriterStore {
 constructor(readonly work:WorkStore) {}
 private async call(run:Pick<FactoryWriter,'id'|'work_id'|'writer_generation'>,action:string,extra:Record<string,unknown>={}) {
  const [row]=await this.work.database.query('SELECT engineering_writer_handoff($1::jsonb) value',
   [JSON.stringify({...extra,...this.work.principal,workId:run.work_id,runId:run.id,writerGeneration:Number(run.writer_generation),action})]);
  if(!row?.value)throw new WorkError('factory_handoff','Writer transition was not retained.');
  return row.value;
 }
 async inspect(workId:string,runId:string):Promise<FactoryWriter> {
  await this.work.get(workId);
  const [row]=await this.work.database.query('SELECT * FROM engineering_route_runs WHERE scope_id=$1 AND scope_kind=$2 AND work_id=$3 AND id=$4',
   [this.work.principal.scopeId,this.work.principal.scopeKind,workId,runId]);
  if(!row)throw new WorkError('factory_writer_missing','Writer Run not found in this Work scope.');
  return {...row,writer_generation:Number(row.writer_generation)} as FactoryWriter;
 }
 async fenceNative(run:FactoryWriter) {return this.call(run,'fence-native') as Promise<FactoryWriter>;}
 async advance(run:FactoryWriter,expectedVersion:number,target:'AGENT'|'HUMAN'='AGENT') {
  return this.call(run,'advance',{expectedVersion,target,eventId:randomUUID()});
 }
 async identity(run:FactoryWriter):Promise<FactoryExecutionIdentity> {
  const receipt=new FactoryReceiptStore(this.work.principal,this.work.database);
  const q=await receipt.request(run.factory_request_id);
  const [d]=await this.work.database.query('SELECT d.admission_authority_snapshot FROM engineering_routing_decisions d JOIN engineering_route_runs r ON r.decision_id=d.id WHERE r.id=$1 AND r.work_id=$2 AND r.scope_id=$3',
   [run.id,run.work_id,this.work.principal.scopeId]);
  const f=d?.admission_authority_snapshot.factory;
  if(!f)throw new WorkError('factory_binding','Exact admitted Factory scope is required.');
  return {runId:run.id,writerGeneration:run.writer_generation,dispatchIdentity:run.dispatch_identity,workId:run.work_id,workGeneration:run.work_generation,
   factoryId:q.binding.factoryId,factoryVersion:q.binding.factoryVersion,requestId:q.binding.requestId,workOrderId:q.binding.workOrderId,remoteRunId:q.binding.runId,
   repository:f.repository,baseSha:f.baseSha,allowedPaths:f.allowedPaths,deadline:f.deadline};
 }
 async dispatch(run:FactoryWriter,transport:FactoryExecutionTransport) {
  await assertBusinessEffect(this.work,run.work_id,{operation:"execute_factory"});
  const claimed=await this.call(run,'claim-dispatch');
  if(!claimed.dispatchWon)return {dispatched:false,writer:claimed};
  // Failure/process loss deliberately leaves the sole writer UNKNOWN.
  await transport.dispatch(await this.identity(run));
  return {dispatched:true,writer:await this.call(run,'ack-dispatch')};
 }
 async stop(run:FactoryWriter,transport:FactoryExecutionTransport,reason:'cancel'|'takeover'|'timeout') {
  const state=await this.call(run,'stop',{reason});
  if(state.dispatch_state!=='TERMINAL')await transport.stop(await this.identity(run));
  return state;
 }
 async reconcile(run:FactoryWriter,transport:FactoryExecutionTransport) {
  const identity=await this.identity(run),observation=await transport.observe(identity);
  if(!observation)return this.inspect(run.work_id,run.id);
  for(const key of Object.keys(identity) as (keyof FactoryExecutionIdentity)[]) {
   if(JSON.stringify(observation[key])!==JSON.stringify(identity[key]))throw new WorkError('factory_observation','Remote quiescence belongs to another writer or scope.');
  }
  return this.call(run,'reconcile',{observation});
 }
 async takeCustody(run:FactoryWriter,receiptId:string,source:RepositorySnapshot,profile:RepositoryProfile,options:ConsumerOptions,cloudFiles?:Record<string,string>) {
  const receipts=new FactoryReceiptStore(this.work.principal,this.work.database);
  const admitted=await resumeFactoryResult(receipts,run.factory_request_id,receiptId,options);
  if(admitted.status!=='ADMITTED' || !admitted.eligibleForCurrentAdmission)throw new WorkError('factory_receipt_historical','Only a current authenticated Gate C admission may enter current custody.');
  const receipt=await receipts.get(run.factory_request_id,receiptId),q=await receipts.request(run.factory_request_id);
  const manifest=receipt.provenance?.manifest,c=manifest?.candidate;
  const identity=await this.identity(run);
  if(!c || identity.repository!==profile.repository || source.sha!==identity.baseSha || c.base!==source.sha ||
   JSON.stringify([...identity.allowedPaths].sort())!==JSON.stringify([...profile.allowedPaths].sort()))throw new WorkError('factory_candidate_scope','Candidate scope differs from admitted Factory authority.');
  const envelope=JSON.parse(receipt.envelope) as SignedResult;
  const artifact=(id:string)=>{const value=envelope.artifacts.find(a=>a.id===id);if(!value)throw new Error('Missing authenticated artifact');return Buffer.from(value.base64,'base64');};
  const files=manifest!.execution.version===2 ? cloudCustodyFiles(source,cloudFiles,manifest!.execution) : await applyFactoryPatch(source.files,artifact(c.patchArtifactId));
  const changedPaths=[...new Set([...Object.keys(source.files),...Object.keys(files)])].filter(p=>source.files[p]!==files[p]).sort();
  const patch=JSON.stringify(changedPaths.map(path=>({path,before:source.files[path]??null,after:files[path]??null})));
  // Stable candidate ID makes a crash/replay converge on exactly the same custody.
  const candidate:Candidate={id:receipt.id,workId:run.work_id,runId:run.id,attemptId:q.binding.runId,repository:profile.repository,
   baseSha:source.sha,parentSha:source.sha,sha:c.commit,tree:c.tree,files,changedPaths,patch,artifactHash:digest({files,patch}),createdAt:manifest!.completedAt,
   commit:{message:'Factory raw commit retained verbatim',name:'MyFactory',email:'provenance@invalid',date:manifest!.completedAt},rawCommit:artifact(c.commitArtifactId).toString('utf8'),producer:'MYFACTORY',
   factoryProvenance:{receiptId,requestId:q.binding.requestId,factoryId:q.binding.factoryId,factoryVersion:q.binding.factoryVersion,workOrderId:q.binding.workOrderId,remoteRunId:q.binding.runId,attemptNumber:q.binding.attemptNumber,writerGeneration:run.writer_generation}};
  assertFactoryCandidateIdentity({workId:run.work_id,repository:profile.repository,baseSha:source.sha,profile},source,candidate);
  return this.call(run,'custody',{custody:{receiptId,candidates:[candidate],sourceFiles:source.files,files,baseSha:source.sha,profileHash:digest(profile),repository:profile.repository}});
 }

 /** Explicit inactive V4 handoff. This only retains candidate data; the SQL
  * boundary still owns current writer/Work/MC fencing and requests verification.
  * No candidate code, returned workspace path or producer check is executed. */
 async takeLocalCustodyV4(run:FactoryWriter,receiptId:string,sourceValue:RepositorySnapshot,profileValue:RepositoryProfile,options:ConsumerOptions) {
  // Trusted inputs must not change while receipt/Git work yields.
  const supplied=structuredClone(run),source=localSourceSnapshot(sourceValue),profile=profileSchema.parse(profileValue);
  const current=await this.inspect(supplied.work_id,supplied.id);
  const fields=['id','work_id','work_version','work_generation','writer_generation','factory_request_id','dispatch_identity'] as const;
  if(fields.some(key=>current[key]!==supplied[key]) || current.status!=='COMPLETED' ||
   current.dispatch_state!=='TERMINAL' || !current.fenced_at || current.stop_reason)
   throw new WorkError('factory_writer_fenced','Exact completed current Factory writer required.');
  const receipts=new FactoryReceiptStore<LocalResultManifestV4,LocalFactoryBindingV4>(this.work.principal,this.work.database);
  const request=await receipts.request(current.factory_request_id);
  const binding=requireLocalFactoryBindingV4(request.binding);
  if(request.id!==current.factory_request_id || binding.workId!==current.work_id ||
   binding.workVersion!==current.work_version || binding.workGeneration!==current.work_generation ||
   source.sha!==binding.inputCommit || treeObjects(source.files).sha!==binding.inputTree)
   throw new WorkError('factory_candidate_scope','Exact admitted V4 input commit and full source tree required.');
  const identity=await this.identity(current);
  if(identity.repository!==profile.repository || identity.baseSha!==source.sha ||
   JSON.stringify([...identity.allowedPaths].sort())!==JSON.stringify([...profile.allowedPaths].sort()) ||
   JSON.stringify([...binding.configuration.allowedPaths].sort())!==JSON.stringify([...profile.allowedPaths].sort()))
   throw new WorkError('factory_candidate_scope','Candidate scope differs from admitted Factory authority.');
  const admitted=await resumeLocalFactoryResultV4(receipts,request.id,receiptId,options);
  // Delivery aliases are deliberately refused. Only the independently verified
  // actual canonical envelope may be named by immutable writer custody.
  if(admitted.status!=='ADMITTED' || !admitted.eligibleForCurrentAdmission ||
   admitted.receiptId!==receiptId || admitted.admissionReceiptId!==receiptId)
   throw new WorkError('factory_receipt_historical','Current canonical V4 admission required.');
  const receipt=await receipts.get(request.id,receiptId),manifest=receipt.provenance!.manifest,c=manifest.candidate;
  if(!c)throw new WorkError('factory_candidate_scope','Completed candidate required.');
  const envelope=JSON.parse(receipt.envelope) as SignedResult;
  const artifact=(id:string)=>{const value=envelope.artifacts.find(a=>a.id===id);if(!value)throw new Error('Missing authenticated artifact');return Buffer.from(value.base64,'base64');};
  const files=await applyFactoryPatch(source.files,artifact(c.patchArtifactId));
  const changedPaths=[...new Set([...Object.keys(source.files),...Object.keys(files)])].filter(p=>source.files[p]!==files[p]).sort();
  const patch=JSON.stringify(changedPaths.map(path=>({path,before:source.files[path]??null,after:files[path]??null})));
  const candidate:Candidate={id:receiptId,workId:current.work_id,runId:current.id,attemptId:binding.runId,repository:profile.repository,
   baseSha:source.sha,parentSha:source.sha,sha:c.commit,tree:c.tree,files,changedPaths,patch,artifactHash:digest({files,patch}),createdAt:manifest.completedAt,
   commit:{message:'Factory raw commit retained verbatim',name:'MyFactory',email:'provenance@invalid',date:manifest.completedAt},
   rawCommit:artifact(c.commitArtifactId).toString('utf8'),producer:'MYFACTORY',
   factoryProvenance:{receiptId,requestId:binding.requestId,factoryId:binding.factoryId,factoryVersion:binding.factoryVersion,
    workOrderId:binding.workOrderId,remoteRunId:binding.runId,attemptNumber:binding.attemptNumber,writerGeneration:current.writer_generation}};
  assertFactoryCandidateIdentity({workId:current.work_id,repository:profile.repository,baseSha:source.sha,profile},source,candidate);
  // Materialization can outlive a key or Work revision. Reauthenticate the same
  // canonical bytes with current trust immediately before the serialized handoff.
  const final=await resumeLocalFactoryResultV4(receipts,request.id,receiptId,options);
  if(!final.eligibleForCurrentAdmission || final.receiptId!==receiptId || final.admissionReceiptId!==receiptId ||
   final.manifestDigest!==admitted.manifestDigest)
   throw new WorkError('factory_receipt_historical','V4 admission changed before candidate custody.');
  return this.call(current,'custody',{custody:{receiptId,candidates:[candidate],sourceFiles:source.files,files,
   baseSha:source.sha,profileHash:digest(profile),repository:profile.repository}});
 }
}

/** The existing candidate pipeline uses SHA1 regular UTF-8 Git files only. */
function localSourceSnapshot(value:RepositorySnapshot):RepositorySnapshot {
 const source=structuredClone(value);
 if(!/^[a-f0-9]{40}$/.test(source.sha) || !source.files || typeof source.files!=='object' || Array.isArray(source.files) ||
  Object.keys(source.files).length>200 || Buffer.byteLength(JSON.stringify(source.files))>500000)
  throw new WorkError('factory_candidate_scope','Bounded SHA1 source snapshot required.');
 for(const [path,text] of Object.entries(source.files)) {
  if(!/^[\w./-]+$/.test(path) || path.startsWith('/') || path.split('/').some(p=>!p||p==='.'||p==='..'||p==='.git') ||
   typeof text!=='string' || Buffer.byteLength(text)>100000 || text.includes('\0') || Buffer.from(text).toString('utf8')!==text)
   throw new WorkError('factory_candidate_scope','Regular bounded UTF-8 source files required.');
 }
 return source;
}

const exec=promisify(execFile);
/** Applies data only, in a fresh isolated repository; never executes candidate
 * code or hooks. Rejects symlinks, binary/non-UTF8 files and unbounded trees. */
async function applyFactoryPatch(source:Record<string,string>,patch:Buffer):Promise<Record<string,string>> {
 if(patch.length>2*1024*1024)throw new Error('Regular bounded text patch required');
 const text=patch.toString('utf8');
 if(!Buffer.from(text).equals(patch) || text.includes('\0') ||
  /^GIT binary patch\r?$/m.test(text) || /^Binary files .+ differ\r?$/m.test(text) ||
  /^(?:copy (?:from|to) |rename (?:from|to) |(?:old|new) mode |(?:new|deleted) file mode (?!100644\r?$))/m.test(text))
  throw new Error('Regular bounded text patch required');
 const declared:string[]=[];
 for(const match of text.matchAll(/^diff --git a\/([\w./-]+) b\/([\w./-]+)\r?$/gm)) {
  if(declared.length===200)throw new Error('Factory patch path bound');
  if(match[1]!==match[2])throw new Error('Regular bounded text patch required');
  declared.push(match[1]);
 }
 if(!declared.length)throw new Error('Regular bounded text patch required');
 const dir=await mkdtemp(join(tmpdir(),'myeve-factory-custody-'));
 const env={...process.env,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null'};
 const git=(args:string[])=>exec('git',['-c','core.hooksPath=/dev/null',...args],{cwd:dir,env,maxBuffer:2*1024*1024,timeout:10000});
 try {
  if(Object.keys(source).length>200 || Buffer.byteLength(JSON.stringify(source))>500000)throw new Error('Factory source bound');
  await git(['init','--quiet']);
  for(const [path,content] of Object.entries(source)) {
   if(!/^[\w./-]+$/.test(path) || path.startsWith('/') || path.split('/').some(p=>!p||p==='.'||p==='..'||p==='.git'))throw new Error('Unsafe Factory base path');
   await mkdir(dirname(join(dir,path)),{recursive:true});await writeFile(join(dir,path),content);
  }
  await git(['add','--all']);
  const patchPath=join(dir,'.git','factory.patch');await writeFile(patchPath,patch);
  // Inspect only text-patch metadata before any candidate files are written.
  // The text byte bound prevents compressed expansion; this bounds path count.
  const stats=await git(['apply','--numstat','-z',patchPath]);
  const paths=stats.stdout.split('\0').filter(Boolean);
  if(!paths.length || paths.length>200 || paths.some(entry=>{
   const match=/^\d+\t\d+\t([\w./-]+)$/.exec(entry),path=match?.[1];
   return !path || path.startsWith('/') || path.split('/').some(p=>!p||p==='.'||p==='..'||p==='.git');
  }))throw new Error('Factory patch path bound');
  const observed=paths.map(entry=>entry.split('\t')[2]).sort();
  if(new Set(declared).size!==declared.length || JSON.stringify(declared.sort())!==JSON.stringify(observed))
   throw new Error('Factory patch path bound');
  await git(['apply','--index','--whitespace=nowarn',patchPath]);
  const {stdout}=await git(['ls-files','--stage','-z']);const files:Record<string,string>={};
  for(const entry of stdout.split('\0').filter(Boolean)) {
   const match=/^100644 [a-f0-9]{40} 0\t(.+)$/.exec(entry);
   if(!match)throw new Error('Factory candidate must contain regular text files only');
   const path=match[1];if(!(await lstat(join(dir,path))).isFile())throw new Error('Factory file type');
   const bytes=await readFile(join(dir,path));const text=bytes.toString('utf8');
   if(bytes.length>100000 || !Buffer.from(text).equals(bytes) || text.includes('\0'))throw new Error('Factory text bound');files[path]=text;
  }
  if(Object.keys(files).length>200 || Buffer.byteLength(JSON.stringify(files))>500000)throw new Error('Factory tree bound');
  return files;
 }finally{await rm(dir,{recursive:true,force:true});}
}
