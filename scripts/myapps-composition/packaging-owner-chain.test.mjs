/** Actual profile -> actual command owner, simulated native cleanup stages and
 * virtual time/processes. No Python, native child, SDK, database or signal runs.
 * The native handler itself is separately extracted by the Python pure tests.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {EventEmitter} from 'node:events';
import {readFileSync} from 'node:fs';
import {dirname,isAbsolute,join} from 'node:path';
import {runInNewContext} from 'node:vm';
import {encodeBuildFailureMetadata} from './build-failure-metadata.mjs';
const producer=readFileSync(new URL('./current-build-producer.mjs',import.meta.url),'utf8');
const profile=readFileSync(new URL('./run-packaging-profile.mjs',import.meta.url),'utf8');
const native=readFileSync(new URL('./current-native-operator.py',import.meta.url));
const start=producer.indexOf('export function observedCommand('),end=producer.indexOf('\n/** Prospective',start);
const profileStart=profile.indexOf('const CURRENT='),profileEnd=profile.indexOf('\nif(process.argv',profileStart);
assert(start>=0&&end>start&&profileStart>=0&&profileEnd>profileStart,'Review actual source extraction');
const subject=producer.slice(start,end).replace(/^export /,'')+'\n'+profile.slice(profileStart,profileEnd).replaceAll('export ','');
const hash=body=>createHash('sha256').update(body).digest('hex');
const messages=error=>[error.message,...(error.errors??[]).map(messages)].join(' ');
function fixture({hang=false,earlyLoss=false}={}){
 let now=0,nextId=1,pythonLive=true,startedCleanup=false,spawns=0,outcome;
 const timers=new Map(),signals=[],stages=[],files=new Map(),detached={controller:true,groups:true,postgres:true};
 const child=new EventEmitter(),process=new EventEmitter();
 child.pid=4242;child.stdout=new EventEmitter();child.stderr=new EventEmitter();
 child.stdout.destroy=()=>{};child.stderr.destroy=()=>{};child.unref=()=>{};process.platform='darwin';
 const schedule=(callback,delay)=>{const id=nextId++;timers.set(id,{callback,at:now+delay});return id;};
 function exited(code){pythonLive=false;child.emit('exit',code,null);child.emit('close',code,null);}
 function nativeCleanup(){
  if(startedCleanup)return;startedCleanup=true;stages.push(['cleanup-start',now]);
  if(earlyLoss){exited(1);return;}
  if(hang)return;
  // Worst reviewed finite sub-budgets, not normal wall-clock estimates.
  schedule(()=>{detached.controller=false;stages.push(['controller-drained',now]);},35000);
  schedule(()=>{detached.groups=false;stages.push(['registry-reconciled',now]);},92000);
  schedule(()=>{detached.postgres=false;stages.push(['cluster-stopped',now]);},257000);
  schedule(()=>{stages.push(['final-audits',now]);exited(1);},297000);
 }
 process.kill=(pid,signal)=>{
  assert.equal(pid,-4242,'Only the simulated Python PG is signaled');
  if(signal===0){if(!pythonLive)throw Object.assign(Error('no group'),{code:'ESRCH'});return;}
  signals.push([signal,now]);
  if(signal==='SIGTERM')nativeCleanup();
  if(signal==='SIGKILL')exited(-9);
 };
 const plan={profile:'eve-0.66.3-current-qe-public-chat-v1',sourceRoot:'/source',sourceCommit:'a'.repeat(40),sourceTree:'b'.repeat(40),
  nativeRoot:'/native',platform:'darwin',arch:'arm64',toolchain:{python:{path:'/pinned/python',sha256:hash('synthetic-python')}},
  sourceFiles:{'scripts/myapps-composition/current-native-operator.py':hash(native)}};
 files.set('/control/plan',Buffer.from(JSON.stringify(plan)));files.set('/control/clearance',Buffer.from('{}'));
 files.set('/pinned/python',Buffer.from('synthetic-python'));files.set('/source/scripts/myapps-composition/current-native-operator.py',native);
 const spec={profile:plan.profile,plan:'/control/plan',planSha256:hash(files.get('/control/plan')),
  clearance:'/control/clearance',clearanceSha256:hash(files.get('/control/clearance')),log:'/private-log'};
 const context={assert,isAbsolute,dirname,join,encodeBuildFailureMetadata,Buffer,createHash,process,AggregateError,
  specJson:JSON.stringify(spec),performance:{now:()=>now},
  setTimeout:schedule,clearTimeout:id=>timers.delete(id),realpathSync:path=>path,hash,
  readFileSync:path=>{assert(files.has(path),'Only synthetic mapped files may be read: '+path);return files.get(path);},
  writeFileSync:(path,body,options)=>{assert.equal(options.flag,'wx');assert.equal(options.mode,0o600);assert(!files.has(path));files.set(path,body);},
  bytes:path=>files.get(path),spawn:(binary,args)=>{spawns++;assert.equal(binary,'/pinned/python');assert.equal(args[0],'/source/scripts/myapps-composition/current-native-operator.py');return child;}};
 const promise=runInNewContext(subject+'\nrunPackagingProfile(JSON.parse(specJson));',context,{timeout:1000})
  .then(value=>{outcome={value};},error=>{outcome={error};});
 async function advance(ms){
  const until=now+ms;let steps=0;
  for(;;){
   await Promise.resolve();await Promise.resolve();await Promise.resolve();
   const next=[...timers].sort((a,b)=>a[1].at-b[1].at||a[0]-b[0])[0];
   if(!next||next[1].at>until)break;
   assert(++steps<100000,'Virtual full-chain deadline');now=next[1].at;timers.delete(next[0]);next[1].callback();
  }
  now=until;await Promise.resolve();await Promise.resolve();await Promise.resolve();
 }
 return {process,signals,stages,detached,timers,advance,promise,nativeCleanup,
  prematureClose(){child.emit('close',0,null);},get now(){return now;},get outcome(){return outcome;},get spawns(){return spawns;}};
}
for(const signal of ['SIGINT','SIGTERM'])test('full profile '+signal+' honors controller, registry and PG cleanup before rejecting',async()=>{
 const f=fixture();f.process.emit(signal);await f.advance(4000);
 assert.equal(f.outcome,undefined);assert.deepEqual(f.signals,[['SIGTERM',0]]);assert.equal(f.detached.postgres,true);
 await f.advance(294000);await f.promise;
 assert.deepEqual(f.detached,{controller:false,groups:false,postgres:false});
 assert.deepEqual(f.stages.map(row=>row[0]),['cleanup-start','controller-drained','registry-reconciled','cluster-stopped','final-audits']);
 assert.match(messages(f.outcome.error),/BUILD_OPERATOR_INTERRUPTED/);assert.equal(f.outcome.value,undefined);
 assert.equal(f.spawns,1);assert.equal(f.timers.size,0);assert.equal(f.signals.length,1);
});
test('full profile deadline preserves first timeout and gives native cleanup its independent budget',async()=>{
 const f=fixture();await f.advance(904000);assert.equal(f.outcome,undefined);
 assert.deepEqual(f.signals,[['SIGTERM',900000]]);await f.advance(294000);await f.promise;
 assert.match(messages(f.outcome.error),/BUILD_COMMAND_TIMEOUT/);assert.equal(f.detached.postgres,false);assert.equal(f.signals.length,1);assert.equal(f.spawns,1);
});
test('repeated outer interruption never reinterrupts native cleanup or shortens its budget',async()=>{
 const f=fixture();f.process.emit('SIGINT');await f.advance(35000);f.process.emit('SIGTERM');f.process.emit('SIGINT');
 await f.advance(263000);await f.promise;assert.equal(f.signals.length,1);assert.equal(f.detached.postgres,false);
 assert.match(messages(f.outcome.error),/BUILD_OPERATOR_INTERRUPTED/);assert.equal(f.process.listenerCount('SIGTERM'),0);
});
test('first outer interruption during existing native cleanup preserves its drain instead of restarting it',async()=>{
 const f=fixture();f.nativeCleanup();await f.advance(50000);f.process.emit('SIGINT');await f.advance(248000);await f.promise;
 assert.equal(f.stages.filter(row=>row[0]==='cleanup-start').length,1);assert.equal(f.detached.postgres,false);
 assert.deepEqual(f.signals,[['SIGTERM',50000]]);assert.match(messages(f.outcome.error),/BUILD_OPERATOR_INTERRUPTED/);
});
test('premature close with a live owned group uses the same complete cleanup budget',async()=>{
 const f=fixture();f.prematureClose();await f.advance(5000);assert.equal(f.outcome,undefined);assert.equal(f.signals.length,1);
 assert.equal(f.signals[0][0],'SIGTERM');await f.advance(294000);await f.promise;
 assert.equal(f.detached.postgres,false);assert.equal(f.signals.length,1);assert.equal(f.outcome.value,undefined);
 assert.match(messages(f.outcome.error),/GROUP_DID_NOT_QUIESCE/);
});
test('forced native-owner loss is bounded and retains wider cleanup UNKNOWN even when Python PG is empty',async()=>{
 const f=fixture({hang:true});f.process.emit('SIGTERM');await f.advance(419999);assert.equal(f.signals.length,1);assert.equal(f.outcome,undefined);
 await f.advance(10000);await f.promise;assert.deepEqual(f.signals,[['SIGTERM',0],['SIGKILL',420000]]);
 assert.deepEqual(f.detached,{controller:true,groups:true,postgres:true});
 assert.match(messages(f.outcome.error),/BUILD_OPERATOR_INTERRUPTED/);assert.match(messages(f.outcome.error),/NATIVE_DESCENDANT_CLEANUP_UNKNOWN/);
 assert.equal(f.outcome.value,undefined);assert.equal(f.spawns,1);assert.equal(f.timers.size,0);
});
test('premature native exit cannot certify detached cleanup from empty Python PG or a stale receipt',async()=>{
 const f=fixture({earlyLoss:true});f.process.emit('SIGINT');await f.advance(0);await f.promise;
 assert.deepEqual(f.detached,{controller:true,groups:true,postgres:true});assert.match(messages(f.outcome.error),/NATIVE_DESCENDANT_CLEANUP_UNKNOWN/);
 assert.equal(f.outcome.value,undefined);assert.equal(f.spawns,1);
});
