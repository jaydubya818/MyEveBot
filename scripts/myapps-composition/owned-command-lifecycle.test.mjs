/** Execute the ACTUAL observedCommand function body with simulated native APIs.
 * No child, SDK import, network, signal, resource mutation or real timers.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {EventEmitter} from 'node:events';
import {readFileSync} from 'node:fs';
import {dirname,isAbsolute,join} from 'node:path';
import {runInNewContext} from 'node:vm';
import {encodeBuildFailureMetadata} from './build-failure-metadata.mjs';

const source=readFileSync(new URL('./current-build-producer.mjs',import.meta.url),'utf8');
const start=source.indexOf('export function observedCommand('),end=source.indexOf('\n/** Prospective',start);
assert(start>=0&&end>start,'Actual command function extraction changed; review before tests');
const subject=source.slice(start,end).replace(/^export /,'');
function fixture({group=false,cleanupGraceMs,phase,metadataWriteError,metadataEncodeError,
 registry=false,registryCloseError,observationError,missingPid=false,
 commandArgs=['--synthetic'],commandEnv={}}={}){
 const timers=new Map(),signals=[],logs=new Map(),metadata=[];let now=0,nextId=1,groupLive=group;
 const child=new EventEmitter(),process=new EventEmitter();
 child.pid=missingPid?undefined:4242;child.stdout=new EventEmitter();child.stderr=new EventEmitter();
 child.stdout.destroy=()=>{child.stdout.destroyed=true;};
 child.stderr.destroy=()=>{child.stderr.destroyed=true;};
 child.unref=()=>{child.unreferenced=true;};
 process.platform='darwin';
 process.kill=(pid,signal)=>{
  assert.equal(pid,-child.pid,'Only the simulated owned group may be observed/signaled');
  if(signal===0&&observationError)throw observationError;
  if(signal===0&&!groupLive)throw Object.assign(Error('no group'),{code:'ESRCH'});
  if(signal!==0){signals.push(signal);if(signal==='SIGKILL')groupLive=false;}
 };
 const setTimeout=(callback,delay)=>{const id=nextId++;timers.set(id,{callback,at:now+delay});return id;};
 const clearTimeout=id=>timers.delete(id);
 const context={assert,isAbsolute,dirname,join,Buffer,process,setTimeout,clearTimeout,performance:{now:()=>now},
  encodeBuildFailureMetadata:(...values)=>{if(metadataEncodeError)throw metadataEncodeError;return encodeBuildFailureMetadata(...values);},
  registerOwnedProcess:()=>({owned:true}),closeOwnedProcess:()=>{if(registryCloseError)throw registryCloseError;},
  spawn:()=>child,writeFileSync:(path,body,options)=>{
   assert.equal(options.flag,'wx');assert.equal(options.mode,0o600);
   if(path==='/build-command-failure.json'){
    if(metadataWriteError)throw metadataWriteError;
    assert.equal(metadata.length,0);assert(Buffer.byteLength(body)<=2048);metadata.push(JSON.parse(body));return;
   }
   assert(!logs.has(path));logs.set(path,body);
  },bytes:path=>logs.get(path),hash:body=>createHash('sha256').update(body).digest('hex')};
 const command=runInNewContext(subject+'\nobservedCommand;',context,{timeout:1000});
 let outcome;
 const promise=command('/synthetic/node',commandArgs,{cwd:'/synthetic',env:commandEnv,log:'/private-log',timeoutMs:100,
  cleanupGraceMs,phase,registry:registry?{}:undefined})
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
 return {child,process,signals,logs,metadata,timers,advance,promise,get outcome(){return outcome;},
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
 assert.equal(f.metadata.length,0);
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
 assert.equal(f.metadata.length,1);
});
test('actual command failure emits only the fixed phase and observed exit signal, after normal cleanup',async()=>{
 const f=fixture({phase:'EVE_BUILD'});f.exit(null,'SIGKILL');f.close(null,'SIGKILL');await f.advance(0);await f.promise;
 assert.match(message(f.outcome.error),/BUILD_COMMAND_FAILED:SIGKILL/);assert.equal(f.outcome.value,undefined);
 assert.deepEqual(f.metadata,[{schema:'myapps.build-command-failure.v1',status:'FAILURE_METADATA_ONLY',
  phase:'EVE_BUILD',ownedChildPid:4242,exitCode:null,signal:'SIGKILL',cleanupState:'QUIESCENT'}]);
});
test('unknown stdio/exit cleanup remains UNKNOWN in failure metadata',async()=>{
 const f=fixture({phase:'NEXT_BUILD'});f.exit(1);await f.advance(10_000);
 assert(f.outcome.error);assert.equal(f.metadata.length,1);assert.equal(f.metadata[0].cleanupState,'UNKNOWN');
 assert.equal(f.metadata[0].signal,null);assert.equal(f.metadata[0].exitCode,1);
});
for(const mode of ['EEXIST','EIO','encode'])test('diagnostic '+mode+' failure cannot mask the original thrown error',async()=>{
 const diagnostic=Object.assign(Error('SYNTHETIC_DIAGNOSTIC_FAILURE'),{code:mode});
 const f=fixture({phase:'PATCH',...(mode!=='encode'?{metadataWriteError:diagnostic}:{metadataEncodeError:diagnostic})});
 const first=Error('SYNTHETIC_ORIGINAL_FAILURE');let inspected=0;
 for(const key of ['code','stack'])Object.defineProperty(first,key,{get(){inspected++;throw Error('MUST_NOT_INSPECT');}});
 f.child.emit('error',first);f.exit(1);f.close(1);await f.advance(0);await f.promise;
 assert.equal(f.outcome.error,first);assert.equal(f.outcome.value,undefined);assert.equal(inspected,0);
 assert.equal(f.metadata.length,0);assert.equal(f.logs.size,1);assert.equal(f.timers.size,0);
});
test('exit0 after a log-limit failure still emits failure metadata and preserves the first error',async()=>{
 const f=fixture({phase:'INSTALL'});f.child.stdout.emit('data',Buffer.alloc(16*1024**2+1));f.exit();f.close();
 await f.advance(0);await f.promise;assert.match(message(f.outcome.error),/BUILD_LOG_LIMIT/);
 assert.equal(f.metadata.length,1);assert.equal(f.metadata[0].exitCode,0);
 assert.equal(f.metadata[0].status,'FAILURE_METADATA_ONLY');assert.equal(f.outcome.value,undefined);
});
test('unobserved spawn PID and exit state remain null/UNKNOWN without inventing a child identity',async()=>{
 const f=fixture({phase:'INSTALL',missingPid:true}),first=Error('SYNTHETIC_SPAWN_FAILURE');
 f.child.emit('error',first);f.close(null,null);await f.advance(0);await f.promise;
 assert.equal(f.outcome.error,first);assert.equal(f.metadata.length,1);
 assert.equal(f.metadata[0].ownedChildPid,null);assert.equal(f.metadata[0].exitCode,null);
 assert.equal(f.metadata[0].signal,null);assert.equal(f.metadata[0].cleanupState,'UNKNOWN');
});
test('permission failure during group observation stays UNKNOWN and remains the original failure',async()=>{
 const error=Object.assign(Error('SYNTHETIC_PERMISSION_FAILURE'),{code:'EPERM'});
 const f=fixture({phase:'NEXT_BUILD',observationError:error});f.exit();f.close();await f.advance(0);await f.promise;
 assert.equal(f.outcome.error,error);assert.equal(f.metadata.length,1);assert.equal(f.metadata[0].cleanupState,'UNKNOWN');
 assert.equal(f.outcome.value,undefined);
});
test('failed registry closure cannot be relabeled as completed cleanup or mask the first command error',async()=>{
 const cleanup=Error('SYNTHETIC_REGISTRY_CLOSE_FAILURE'),first=Error('SYNTHETIC_COMMAND_FAILURE');
 const f=fixture({phase:'EVE_BUILD',registry:true,registryCloseError:cleanup});
 f.child.emit('error',first);f.exit(1);f.close(1);await f.advance(0);await f.promise;
 assert.equal(f.outcome.error.errors.length,2);assert.equal(f.outcome.error.errors[0],first);
 assert.equal(f.outcome.error.errors[1],cleanup);assert.equal(f.metadata.length,1);
 assert.equal(f.metadata[0].cleanupState,'UNKNOWN');assert.equal(f.outcome.value,undefined);
});
test('command arguments, environment, raw output and arbitrary Error fields cannot enter the public failure record',async()=>{
 const secret='SYNTHETIC_PRIVATE_OWNER_https://fixture.invalid/token';
 const f=fixture({phase:'SDK_AUTHENTICATE',commandArgs:[secret],commandEnv:{PRIVATE:secret}});
 const first=Object.assign(Error(secret),{code:secret});f.child.stdout.emit('data',Buffer.from(secret));
 f.child.emit('error',first);f.exit(1);f.close(1);await f.advance(0);await f.promise;
 assert.equal(f.outcome.error,first);assert.equal(f.metadata.length,1);
 const body=JSON.stringify(f.metadata[0]);assert(!body.includes(secret)&&!body.includes('/synthetic'));
 assert.equal(f.metadata[0].phase,'SDK_AUTHENTICATE');assert.equal(f.metadata[0].exitCode,1);
});
