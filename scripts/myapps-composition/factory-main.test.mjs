import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {applyFactoryMain,reviewedFactoryMain as manifest,factoryMainConflicts} from './factory-main.mjs';
function fixture(){
 const repo=process.env.MYFACTORY_SOURCE_ROOT;assert(repo,'MYFACTORY_SOURCE_ROOT required');
 const command=args=>spawnSync('git',['-C',repo,...args],{encoding:'utf8',maxBuffer:32*1024*1024});
 const head=command(['rev-parse','HEAD']).stdout.trim(),integration=manifest.integration;
 const result=command(['merge-tree','--write-tree','--name-only',head,integration]);assert.equal(result.status,1,result.stderr);
 const [initialTree,...conflicts]=result.stdout.split('\n\n')[0].split('\n');assert.deepEqual(conflicts.sort(),factoryMainConflicts);
 const read=(sha,path)=>{const r=command(['show',`${sha}:${path}`]);if(r.status!==0){assert.match(r.stderr,/does not exist in|exists on disk, but not in/);return null;}return r.stdout;};
 const writes=new Map();return {writes,args:{main:manifest.main,head,integration,initialTree,read,readComposed:path=>read(initialTree,path),put:(p,s)=>writes.set(p,s)}};
}
test('Factory exact union retains capability, writer, verifier, UNKNOWN and both lifecycle assertions',()=>{
 const {args,writes}=fixture();const proof=applyFactoryMain(args);
 const dispatch=writes.get('apps/cloud-control/src/postgres-dispatch.mjs');
 for(const anchor of ['this.capabilityBindings=capabilityBindings','this.strictWriterFence=strictWriterFence','this.requireVerifierPass=requireVerifierPass','this.onDeliveryUnknown=onDeliveryUnknown','assertFactoryCapability','owner_scope_bound','capability_pause_requested'])assert(dispatch.includes(anchor),anchor);
 const tests=writes.get('apps/cloud-control/test/cloud-work-lifecycle.test.mjs');
 assert(tests.includes('revocation recovery cannot finalize while an independent verifier is still unclean'));
 assert(tests.includes('private source preflight completes after recovery scheduling'));
 const pricing=writes.get('apps/cloud-control/test/production-model-provider.test.mjs');
 assert.equal(pricing.split('test.mock.timers.enable(').length,2);
 assert(pricing.includes('price expiry after construction prevents workload credential acquisition'));
 const identities=writes.get('apps/cloud-control/test/source-identity-qualification.test.mjs');
 for(const name of ['preparation','recovery','lifecycle','predecessor','historical'])assert(identities.includes(`[${name}.sourceDigest,`),name);
 assert.equal(proof.sourceDigest,manifest.identity.source.sourceDigest);
 assert(!writes.has('apps/cloud-control/src/production-model-provider.mjs'),'Canonical current pricing runtime is not overwritten');
});
test('Factory input pin, source, constructor and inventory drift fail atomically',()=>{
 for(const kind of ['main','integration','preparation','conflict','inventory','identity','nonconflictingSource']){
  const {args,writes}=fixture(),read=args.read;
  if(kind==='main'||kind==='integration')args[kind]='0'.repeat(40);
  else args.read=(sha,path)=>read(sha,path)+(
   kind==='preparation'&&sha===args.head&&path.endsWith('postgres-dispatch.mjs')||
   kind==='conflict'&&sha===args.initialTree&&path.endsWith('postgres-dispatch.mjs')||
   kind==='inventory'&&sha===args.head&&path===manifest.inventory.path?'\n':'');
  if(kind==='nonconflictingSource')args.readComposed=path=>{const bytes=read(args.initialTree,path);return path==='apps/cloud-control/src/capability-admission.mjs'?bytes+'\n':bytes;};
  if(kind==='identity')args.readComposed=path=>{const bytes=read(args.initialTree,path);return path.endsWith('source-identity-qualification.test.mjs')?bytes+'\n':bytes;};
  assert.throws(()=>applyFactoryMain(args),/Unreviewed|Changed/);assert.equal(writes.size,0);
 }
});
