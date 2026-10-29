/** Synthetic fetch failures and process groups only. No app/SDK/controller import,
 * native child/signal, filesystem adapter installation, SQL or network request. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {EventEmitter} from 'node:events';
import vm from 'node:vm';
const hash=value=>createHash('sha256').update(value).digest('hex');
const source=readFileSync(new URL('./current-qe-seams.mjs',import.meta.url),'utf8');
const baselinePath=new URL('./BASELINE_OWNER_CHAT_ONLY_TRANSPORT.cjs',import.meta.url);
const baseline=readFileSync(existsSync(baselinePath)?baselinePath:new URL('../../apps/eve/test/owner-chat-only/transport.cjs',import.meta.url),'utf8');
const parentPath=new URL('./fixtures/current-qe-seams-parent-8a795c8f.mjs',import.meta.url);
const parent=readFileSync(parentPath,'utf8');
assert.equal(hash(parent),'3f1a7e3e1d9ff15b2dd09dd0eccf6f55c152b4420078643f3baa924d2e1f9845','QE_TRANSPORT_PARENT_FIXTURE_CHANGED');
function functionText(name){
 const start=source.indexOf('export function '+name+'(');assert(start>=0);
 const next=source.indexOf('\nexport ',start+1);return source.slice(start,next<0?undefined:next).replace('export function','function');
}
const context=vm.createContext({assert,hash,String});
const declarations=['currentQENeonConfiguration','projectCurrentQETransport','currentQEFailureDiagnostics'].map(functionText).join('\n');
const project=vm.runInContext(declarations+'\nprojectCurrentQETransport',context);
const projected=project(baseline);
const allowedText=text=>text.slice(text.indexOf('function allowedHttp('),text.indexOf("\nfor (const protocol",text.indexOf('function allowedHttp(')));
const prefix=projected.indexOf('const currentQEDiagnosticHash=');assert(prefix>0);
const fetchCode=projected.slice(prefix);
function fetchFixture(operation,{logger}={}){
 const rows=[],requests=[];
 const underlying=async(...args)=>{requests.push(args);return operation(...args);};
 const scope=vm.createContext({URL,Request,Response,Headers,Buffer,Set,Object,JSON,
  require:name=>{assert.equal(name,'node:crypto');return {createHash};},
  web:new Set(['http://localhost:3188','http://127.0.0.1:3188']),eve:'http://127.0.0.1:3185',model:'http://127.0.0.1:3184',
  app:new URL('postgresql://synthetic:secret@127.0.0.1:56792/ea_work_'+ 'a'.repeat(32)),endpoint:'http://127.0.0.1:56792/__current_qe_neon',
  reads:new Set(['/api/agents']),pool:{connect(){throw Error('SYNTHETIC_DATABASE_BOUNDARY');}},
  console:{error:(...args)=>{rows.push(args);logger?.(...args);}},fetch:underlying});
 vm.runInContext(allowedText(projected)+'\n'+fetchCode,scope);
 return {fetch:vm.runInContext('globalThis.fetch',scope),rows,requests,scope};
}
const diagnostic=row=>JSON.parse(row[1]);
async function thrown(promise){try{await promise;assert.fail('expected rejection');}catch(error){return error;}}
test('only existing transport allowances and exact Neon endpoint projection remain',()=>{
 const start=parent.indexOf('export function currentQENeonConfiguration('),end=parent.indexOf('\nexport const CURRENT_QE_NEON_STORES',start);
 const projectStart=parent.indexOf('export function projectCurrentQETransport(');
 const previous=vm.runInNewContext(parent.slice(start,end).replace('export function','function')+'\n'+parent.slice(projectStart).replace('export function','function')+'\nprojectCurrentQETransport',{assert,hash});
 assert.equal(allowedText(projected),allowedText(previous(baseline)));
 assert(projected.includes('return await fetch(input, init)'));
 assert(projected.includes("throw Error('CHAT_FIXTURE_FOREIGN_NEON_DENIED')"));
});
test('successful fetch keeps the original response and produces no diagnostic',async()=>{
 const response=Response.json({ok:true}),f=fetchFixture(()=>response);
 assert.equal(await f.fetch('http://127.0.0.1:3184/model',{method:'POST'}),response);assert.equal(f.rows.length,0);assert.equal(f.requests.length,1);
});
test('asynchronous native fetch rejection is observed and rethrown by identity',async()=>{
 const error=new TypeError('private underlying message'),f=fetchFixture(()=>Promise.reject(error));
 assert.equal(await thrown(f.fetch('http://127.0.0.1:3185/.well-known/workflow/v1/flow',{method:'POST'})),error);
 const d=diagnostic(f.rows[0]);assert.equal(d.chain[0].class,'TypeError');assert.equal(d.chain[0].messageSha256,hash(error.message));assert.equal(d.origin,'owned-eve');assert.equal(d.route,'/.well-known/workflow/v1/flow');
});
for(const code of ['ECONNREFUSED','ECONNRESET','ENOTFOUND','ETIMEDOUT','EACCES','EPERM','ERR_INVALID_URL','UND_ERR_SOCKET','UND_ERR_CONNECT_TIMEOUT','UND_ERR_HEADERS_TIMEOUT','UND_ERR_BODY_TIMEOUT'])
 test('fixed native cause code is retained: '+code,async()=>{
  const cause=Object.assign(Error('private cause'),{code}),error=new TypeError('fetch failed',{cause}),f=fetchFixture(()=>{throw error;});
  assert.equal(await thrown(f.fetch('http://127.0.0.1:3184/model',{method:'POST'})),error);assert.equal(diagnostic(f.rows[0]).chain[1].code,code);
 });
test('session, query, fragment, headers, body and error text never appear in diagnostics',async()=>{
 const secret='DONT_EMIT_THIS_PRIVATE_VALUE',error=Object.assign(Error(secret),{code:secret}),f=fetchFixture(()=>{throw error;});
 await thrown(f.fetch('http://127.0.0.1:3185/eve/v1/session/'+secret+'/stream?token='+secret+'#'+secret,{headers:{cookie:secret},body:secret}));
 const text=JSON.stringify(f.rows),d=diagnostic(f.rows[0]);assert(!text.includes(secret));assert.equal(d.route,'/eve/v1/session/:id/stream');assert.equal(d.chain[0].code,null);assert(d.hasQuery&&d.hasFragment);
});
test('foreign target remains denied before dispatch without exposing its URL',async()=>{
 const f=fetchFixture(()=>assert.fail('foreign dispatch'));await thrown(f.fetch('https://secret.invalid/private?token=secret'));
 assert.equal(f.requests.length,0);const d=diagnostic(f.rows[0]);assert.equal(d.origin,'unrecognized');assert.equal(d.route,'unrecognized');assert.equal(d.chain[0].messageSha256,hash('CHAT_FIXTURE_FOREIGN_FETCH_DENIED'));assert(!JSON.stringify(d).includes('secret'));
});
test('unrecognized owned path is hashed while its denial remains unchanged',async()=>{
 const f=fetchFixture(()=>assert.fail('unknown dispatch'));await thrown(f.fetch('http://127.0.0.1:3185/private-secret-path'));
 const d=diagnostic(f.rows[0]);assert.equal(d.origin,'owned-eve');assert.equal(d.pathSha256,hash('/private-secret-path'));assert.equal(d.route,'unrecognized');assert(!JSON.stringify(d).includes('private-secret-path'));
});
test('Neon adapter rejection is recorded without dispatch or connection-string exposure',async()=>{
 const f=fetchFixture(()=>assert.fail('SQL HTTP dispatch'));await thrown(f.fetch('http://127.0.0.1:56792/__current_qe_neon',{method:'POST',headers:{'Neon-Connection-String':'postgresql://secret:secret@127.0.0.1:56792/foreign'}}));
 assert.equal(f.requests.length,0);const d=diagnostic(f.rows[0]);assert.equal(d.origin,'owned-pg-endpoint');assert.equal(d.route,'/__current_qe_neon');assert(!JSON.stringify(f.rows).includes('postgresql'));assert.equal(d.chain[0].messageSha256,hash('CHAT_FIXTURE_FOREIGN_NEON_DENIED'));
});
test('cyclic and excessive cause chains are finite',async()=>{
 const error=Error('root'),next=Error('next');error.cause=next;next.cause=error;
 const f=fetchFixture(()=>{throw error;});await thrown(f.fetch('http://127.0.0.1:3184/model',{method:'POST'}));assert.equal(diagnostic(f.rows[0]).chain.length,2);
 let chain=error;for(let n=0;n<8;n++)chain=Error('level',{cause:chain});const g=fetchFixture(()=>{throw chain;});await thrown(g.fetch('http://127.0.0.1:3184/model',{method:'POST'}));assert.equal(diagnostic(g.rows[0]).chain.length,4);
});
test('error getters are never invoked and unknown classes never leak',async()=>{
 let accessed=0;const error=Error('private');Object.defineProperties(error,{cause:{get(){accessed++;throw Error('getter');}},code:{get(){accessed++;return 'secret';}},name:{value:'SecretClass'}});
 const f=fetchFixture(()=>{throw error;});assert.equal(await thrown(f.fetch('http://127.0.0.1:3184/model',{method:'POST'})),error);assert.equal(accessed,0);assert.equal(diagnostic(f.rows[0]).chain[0].class,'OtherError');assert(!JSON.stringify(f.rows).includes('SecretClass'));
});
test('diagnostic logging failure cannot substitute the original fetch failure',async()=>{
 const error=Error('original'),f=fetchFixture(()=>{throw error;},{logger(){throw Error('logger failure');}});
 assert.equal(await thrown(f.fetch('http://127.0.0.1:3184/model',{method:'POST'})),error);
});
test('diagnostics have a finite 32-failure record ceiling',async()=>{
 const error=Error('same'),f=fetchFixture(()=>{throw error;});for(let n=0;n<35;n++)assert.equal(await thrown(f.fetch('http://127.0.0.1:3184/model',{method:'POST'})),error);assert.equal(f.rows.length,32);
});
test('large error messages are bounded and marked before hashing',async()=>{
 const error=Error('a'.repeat(20000)),f=fetchFixture(()=>{throw error;});await thrown(f.fetch('http://127.0.0.1:3184/model',{method:'POST'}));const d=diagnostic(f.rows[0]);assert.equal(d.chain[0].messageSha256,hash('a'.repeat(16384)));assert(d.chain[0].messageTruncated);
});
const managerSource=readFileSync(new URL('./owned-runtime-processes.mjs',import.meta.url),'utf8');
const managerBody=managerSource.slice(managerSource.indexOf('export function createOwnedRuntimeProcesses')).replace('export function','function');
function processFixture(fault){
 let now=0,id=0;const timers=new Map(),groups=new Map(),children=[],signals=[],probes=new Map(),closed=[],files=new Map();
 const later=(fn,ms=0)=>{const key=++id;timers.set(key,{fn,at:now+ms});return key;};
 const process=new EventEmitter(),permission=Object.assign(Error('permission denied'),{code:'EPERM'});
 function stop(child,code=0){groups.set(child.pid,false);child.emit('exit',code,null);child.emit('close',code,null);}
 process.kill=(negative,sig)=>{
  const pid=-negative;assert(children.some(child=>child.pid===pid),'foreign group signal');
  const count=sig===0?(probes.set(pid,(probes.get(pid)??0)+1),probes.get(pid)):0;
  if(fault?.({pid,sig,count}))throw permission;
  if(!groups.get(pid))throw Object.assign(Error('absent'),{code:'ESRCH'});
  if(sig!==0){signals.push({pid,sig});later(()=>stop(children.find(child=>child.pid===pid)),1);}
 };
 function spawn(){
  const child=new EventEmitter();child.pid=100+children.length;child.stdout=new EventEmitter();child.stderr=new EventEmitter();
  for(const stream of [child.stdout,child.stderr])stream.destroy=()=>{stream.destroyed=true;};child.unref=()=>{child.unreferenced=true;};children.push(child);groups.set(child.pid,true);return child;
 }
 const scope=vm.createContext({assert,process,spawn,Buffer,Date,setTimeout:later,clearTimeout:key=>timers.delete(key),
  hash,writeFileSync:(path,value)=>files.set(path,String(value)),appendFileSync:(path,value)=>files.set(path,files.get(path)+String(value)),readFileSync:path=>files.get(path),
  registerOwnedProcess:(_registry,item)=>({pid:item.pid}),closeOwnedProcess:(_registry,item)=>closed.push(item.pid),
  wait:ms=>new Promise(resolve=>later(resolve,ms))});
 const owner=vm.runInContext(managerBody+'\ncreateOwnedRuntimeProcesses',scope)({path:'/synthetic-registry'});
 const launch=kind=>owner.launch({node:'/synthetic/node',args:['/synthetic/entry'],cwd:'/synthetic',env:{},log:'/log'+children.length,kind,expectedToExit:kind==='client'});
 async function pump(promise){
  let done=false,value,error;promise.then(x=>{done=true;value=x;},x=>{done=true;error=x;});
  for(let n=0;n<4000&&!done;n++){
   for(let m=0;m<8;m++)await Promise.resolve();if(done)break;
   const next=[...timers.entries()].sort((a,b)=>a[1].at-b[1].at)[0];assert(next,'no bounded synthetic timer');now=next[1].at;timers.delete(next[0]);next[1].fn();
  }
  assert(done,'cleanup did not settle');if(error)throw error;return value;
 }
 const finalizeAssertions=()=>{for(const child of children){assert(child.stdout.destroyed&&child.stderr.destroyed&&child.unreferenced);}};
 return {owner,launch,pump,stop,children,groups,signals,probes,closed,permission,process,finalizeAssertions};
}
for(const failingIndex of [0,1,2])test('liveness EPERM preserves unknown child '+failingIndex+' while finalizing peers',async()=>{
 const e=processFixture(({pid,sig})=>pid===100+failingIndex&&sig===0);for(const kind of ['eve','next','client'])e.launch(kind);
 const first=e.owner.close();assert.equal(e.owner.close(),first);const error=await thrown(e.pump(first));assert(error instanceof AggregateError||error.name==='AggregateError');assert(error.errors.includes(e.permission));
 assert(!e.closed.includes(100+failingIndex));assert.equal(e.closed.length,2);assert(!e.signals.some(row=>row.pid===100+failingIndex));e.finalizeAssertions();
});
test('EPERM during formerly unguarded polling does not bypass any finalizer',async()=>{
 const e=processFixture(({pid,sig,count})=>pid===100&&sig===0&&count===2);e.launch('eve');e.launch('next');
 const error=await thrown(e.pump(e.owner.close()));assert(error.errors.includes(e.permission));assert.deepEqual(e.closed,[101]);e.finalizeAssertions();
});
test('signal EPERM is preserved without a speculative escalation for that group',async()=>{
 const e=processFixture(({pid,sig})=>pid===100&&sig==='SIGTERM');e.launch('eve');e.launch('next');
 const error=await thrown(e.pump(e.owner.close()));assert(error.errors.includes(e.permission));assert(!e.signals.some(row=>row.pid===100));assert.deepEqual(e.closed,[101]);e.finalizeAssertions();
});
test('primary runtime failure remains first alongside cleanup EPERM',async()=>{
 const e=processFixture(({pid,sig})=>pid===100&&sig===0);e.launch('eve');e.launch('client');e.stop(e.children[1],1);
 const error=await thrown(e.pump(e.owner.close()));assert.match(error.errors[0].message,/RUNTIME_PREMATURE_EXIT:client:1/);assert(error.errors.includes(e.permission));e.finalizeAssertions();
});
test('permission failure is retained once rather than retried on each poll',async()=>{
 const e=processFixture(({pid,sig})=>pid===100&&sig===0);e.launch('eve');e.launch('next');
 const error=await thrown(e.pump(e.owner.close()));assert.equal(error.errors.filter(x=>x===e.permission).length,1);assert.equal(e.probes.get(100),1);e.finalizeAssertions();
});
