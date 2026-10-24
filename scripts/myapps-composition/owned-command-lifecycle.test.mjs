/** Execute the ACTUAL observedCommand function body with simulated native APIs.
 * No child, SDK import, network, signal, resource mutation or real timers.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {EventEmitter} from 'node:events';
import {readFileSync} from 'node:fs';
import {isAbsolute} from 'node:path';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('./current-build-producer.mjs',import.meta.url),'utf8');
const start=source.indexOf('export function observedCommand('),end=source.indexOf('\n/** Prospective',start);
assert(start>=0&&end>start,'Actual command function extraction changed; review before tests');
const subject=source.slice(start,end).replace(/^export /,'');
function fixture({group=false,cleanupGraceMs}={}){
 const timers=new Map(),signals=[],logs=new Map();let now=0,nextId=1,groupLive=group;
 const child=new EventEmitter(),process=new EventEmitter();
 child.pid=4242;child.stdout=new EventEmitter();child.stderr=new EventEmitter();
 child.stdout.destroy=()=>{child.stdout.destroyed=true;};
 child.stderr.destroy=()=>{child.stderr.destroyed=true;};
 child.unref=()=>{child.unreferenced=true;};
 process.platform='darwin';
 process.kill=(pid,signal)=>{
  assert.equal(pid,-child.pid,'Only the simulated owned group may be observed/signaled');
  if(signal===0&&!groupLive)throw Object.assign(Error('no group'),{code:'ESRCH'});
  if(signal!==0){signals.push(signal);if(signal==='SIGKILL')groupLive=false;}
 };
 const setTimeout=(callback,delay)=>{const id=nextId++;timers.set(id,{callback,at:now+delay});return id;};
 const clearTimeout=id=>timers.delete(id);
 const context={assert,isAbsolute,Buffer,process,setTimeout,clearTimeout,performance:{now:()=>now},
  spawn:()=>child,writeFileSync:(path,body,options)=>{
   assert.equal(options.flag,'wx');assert.equal(options.mode,0o600);assert(!logs.has(path));logs.set(path,body);
  },bytes:path=>logs.get(path),hash:body=>createHash('sha256').update(body).digest('hex')};
 const command=runInNewContext(subject+'\nobservedCommand;',context,{timeout:1000});
 let outcome;
 const promise=command('/synthetic/node',['--synthetic'],{cwd:'/synthetic',env:{},log:'/private-log',timeoutMs:100,cleanupGraceMs})
  .then(value=>{outcome={value};},error=>{outcome={error};});
 async function advance(ms){
  const until=now+ms;let steps=0;
  for(;;){
   await Promise.resolve();await Promise.resolve();
   const scheduled=[...timers].sort((a,b)=>a[1].at-b[1].at||a[0]-b[0])[0];
   if(!scheduled||scheduled[1].at>until)break;
   assert(++steps<20_000,'Synthetic timer bound');
   now=scheduled[1].at;timers.delete(scheduled[0]);scheduled[1].callback();
  }
  now=until;await Promise.resolve();await Promise.resolve();
 }
 return {child,process,signals,logs,timers,advance,promise,get outcome(){return outcome;},
  exit(code=0,signal=null){child.emit('exit',code,signal);},close(code=0,signal=null){child.emit('close',code,signal);}};
}
const message=error=>[error.message,...(error.errors??[]).map(message)].join(' ');
test('cleanup grace rejects unbounded or too-short values before spawning',()=>{
 for(const cleanupGraceMs of [0,2999,420001,Infinity,NaN])assert.throws(()=>fixture({cleanupGraceMs}),/BUILD_COMMAND_CLEANUP_BUDGET/);
});
test('normal owned exit/close completes once and clears signals and timers',async()=>{
 const f=fixture();f.exit();f.close();await f.advance(0);await f.promise;
 assert.equal(f.outcome.value.groupQuiescent,true);assert.equal(f.outcome.value.exitCode,0);
 assert.equal(f.logs.size,1);assert.equal(f.timers.size,0);assert.equal(f.process.listenerCount('SIGTERM'),0);
});
test('exited leader plus escaped descendant retaining stdio settles UNKNOWN without waiting for close',async()=>{
 const f=fixture();f.exit();await f.advance(10_000);
 assert(f.outcome?.error,'Must settle even though simulated close never arrives');
 assert.match(message(f.outcome.error),/STDIO.*UNKNOWN|CLEANUP_UNKNOWN/);
 assert(f.child.stdout.destroyed&&f.child.stderr.destroyed&&f.child.unreferenced);
 assert.equal(f.logs.size,1);assert.equal(f.process.listenerCount('SIGTERM'),0);
});
test('a timed-out leader without exit/close remains failed and cannot hold settlement open',async()=>{
 const f=fixture({group:true});await f.advance(15_000);
 assert(f.outcome?.error,'The deadline must settle independently of exit/close');
 assert.match(message(f.outcome.error),/BUILD_COMMAND_TIMEOUT/);
 assert.match(message(f.outcome.error),/CLEANUP_UNKNOWN/);
 assert.deepEqual(f.signals,['SIGTERM','SIGKILL']);
});
test('operator interruption remains the first failure while cleanup still runs',async()=>{
 const f=fixture({group:true});f.process.emit('SIGINT');await f.advance(15_000);
 assert(f.outcome?.error);assert.match(message(f.outcome.error),/BUILD_OPERATOR_INTERRUPTED/);
 assert(f.signals.includes('SIGKILL'));assert.equal(f.timers.size,0);
});
test('an output-limit failure cannot become success after an exit0',async()=>{
 const f=fixture();f.child.stdout.emit('data',Buffer.alloc(16*1024**2+1));f.exit();f.close();
 await f.advance(0);await f.promise;
 assert.match(message(f.outcome.error),/BUILD_LOG_LIMIT/);assert.equal(f.outcome.value,undefined);
});
test('late close after a forced UNKNOWN cannot double-write or relabel the outcome',async()=>{
 const f=fixture();f.exit();await f.advance(10_000);assert(f.outcome?.error);
 const first=f.outcome.error;f.close();await f.advance(0);
 assert.equal(f.logs.size,1);assert.equal(f.outcome.error,first);assert.equal(f.outcome.value,undefined);
});
