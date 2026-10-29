/** Executes the actual manager function with simulated process groups, pipes,
 * filesystem and clock. Never creates a child or sends a real signal. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('./owned-runtime-processes.mjs',import.meta.url),'utf8');
const body=source.slice(source.indexOf('export function createOwnedRuntimeProcesses')).replace('export function','function');
function environment(){
 let now=0,id=0;const timers=new Map(),groups=new Map(),children=[],files=new Map(),signals=[];
 const later=(fn,ms=0)=>{const key=++id;timers.set(key,{fn,at:now+ms});return key;};
 const process=new EventEmitter();process.kill=(pid,sig)=>{
  const live=groups.get(-pid);if(!live){const error=Error('gone');error.code='ESRCH';throw error;}
  if(sig!==0){signals.push({pid,sig});groups.set(-pid,false);}
 };
 function spawn(){
  const child=new EventEmitter();child.pid=100+children.length;child.stdout=new EventEmitter();child.stderr=new EventEmitter();
  for(const stream of [child.stdout,child.stderr])stream.destroy=()=>{stream.destroyed=true;};
  child.unref=()=>{child.unreferenced=true;};children.push(child);groups.set(child.pid,true);return child;
 }
 const context=vm.createContext({assert,process,spawn,Buffer,Date,setTimeout:later,clearTimeout:key=>timers.delete(key),
  hash:value=>'sha:'+String(value),writeFileSync:(path,value)=>{assert(!files.has(path));files.set(path,String(value));},
  appendFileSync:(path,value)=>files.set(path,files.get(path)+String(value)),readFileSync:path=>files.get(path),
  wait:ms=>new Promise(resolve=>later(resolve,ms))});
 const factory=vm.runInContext(body+'\ncreateOwnedRuntimeProcesses',context),owner=factory();
 const launch=(kind='eve',expectedToExit=false,env={})=>owner.launch({node:'/owned/node',args:['/owned/entry'],cwd:'/owned',env,log:'/log'+children.length,kind,expectedToExit});
 async function pump(promise){
  let done=false,value,error;promise.then(x=>{done=true;value=x;},x=>{done=true;error=x;});
  for(let step=0;step<3000&&!done;step++){
   for(let micro=0;micro<6;micro++)await Promise.resolve();
   if(done)break;
   const next=[...timers.entries()].sort((a,b)=>a[1].at-b[1].at)[0];assert(next,'No timer with unsettled test promise');
   now=next[1].at;timers.delete(next[0]);next[1].fn();
  }
  assert(done,'Simulated lifecycle did not settle');if(error)throw error;return value;
 }
 function stop(child,code=0,close=true){groups.set(child.pid,false);child.emit('exit',code,null);if(close)child.emit('close',code,null);}
 return {owner,launch,pump,stop,children,groups,signals,process,files,later};
}
test('unknown loaders are rejected before any spawn or file mutation',()=>{
 const e=environment();assert.throws(()=>e.launch('eve',false,{NODE_OPTIONS:'--require=/foreign'}),/UNDECLARED_LOADER/);assert.equal(e.children.length,0);assert.equal(e.files.size,0);
});
test('normal owned server groups are signaled, awaited and closed before success',async()=>{
 const e=environment();e.launch();e.later(()=>e.stop(e.children[0],null),100);
 const first=e.owner.close();assert.equal(e.owner.close(),first,'Cleanup is one idempotent promise');const rows=await e.pump(first);assert.equal(rows.length,1);assert(rows[0].groupQuiescent);assert.equal(e.signals[0].pid,-100);assert(e.children[0].stdout.destroyed);
});
test('premature exit remains first failure even if cleanup finishes',async()=>{
 const e=environment();e.launch();e.stop(e.children[0],1);
 await assert.rejects(e.owner.guard(Promise.resolve('irrelevant')),/PREMATURE_EXIT/);
 await assert.rejects(e.pump(e.owner.close()),/Runtime process failure/);
});
test('exited leader retaining stdio closes in finite virtual time as UNKNOWN',async()=>{
 const e=environment();e.launch('client',true);e.stop(e.children[0],0,false);
 await assert.rejects(e.pump(e.owner.close()),/cleanup unknown/);assert(e.children[0].stdout.destroyed);assert(e.children[0].unreferenced);
});
test('operator signal remains a failure after group cleanup',async()=>{
 const e=environment();e.launch();e.process.emit('SIGINT');e.later(()=>e.stop(e.children[0],null),100);
 await assert.rejects(e.pump(e.owner.close()),/Runtime process failure/);assert.equal(e.process.listenerCount('SIGINT'),0);
});
test('oversized log is rejected without retaining its secret body',async()=>{
 const e=environment();e.launch();e.children[0].stdout.emit('data',Buffer.alloc(16*1024**2+1,65));
 assert.equal(e.files.get('/log0'),'');e.later(()=>e.stop(e.children[0],null),100);
 await assert.rejects(e.pump(e.owner.close()),/Runtime process failure/);
});
