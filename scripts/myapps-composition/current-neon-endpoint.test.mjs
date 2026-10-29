/** Pure fixture-contract tests. No Next/Neon/SDK modules, app imports, sockets,
 * SQL, installed artifact evaluation, helper replay or runtime processes. */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync,existsSync} from 'node:fs';
import path from 'node:path';
import {CURRENT_QE_NEON_STORES,currentQENeonConfiguration,projectCurrentQENeonStore,projectCurrentQETransport} from './current-qe-seams.mjs';

const appUrl='postgresql://fixture:synthetic_only@127.0.0.1:56792/ea_work_0123456789abcdef0123456789abcdef';
const centralUrl='postgresql://fixture:synthetic_only@127.0.0.1:56792/ea_work_fedcba9876543210fedcba9876543210';
const opaqueInvalid='https://api.0.0.1/sql',endpoint='http://127.0.0.1:56792/__current_qe_neon';
const topology={appUrl,centralUrl,pgPort:56792,webPort:3188,evePort:3185,modelPort:3184,ipcDirectory:'/pure/ipc'};
const baselineNames={
 'apps/eve/agent/lib/receipts-db.ts':'BASELINE_RECEIPTS_DB.ts',
 'apps/eve/lib/threads-db.ts':'BASELINE_THREADS_DB.ts',
};
function baseline(file,name){
 const copied=new URL('./'+name,import.meta.url);
 return readFileSync(existsSync(copied)?copied:new URL('../../'+file,import.meta.url),'utf8');
}
const transport=baseline('apps/eve/test/owner-chat-only/transport.cjs','BASELINE_OWNER_CHAT_ONLY_TRANSPORT.cjs');

// Model the documented public config in the SAME import context as its neon
// constructor. A separate preload object deliberately cannot configure it.
function store(file,send=async()=>new Response('{}'),database=appUrl){
 const source=baseline(file,baselineNames[file]),projected=projectCurrentQENeonStore(source,file);
 const name=file.endsWith('threads-db.ts')?'sql':'db';
 const header=(name==='db'?'export ':'')+'function '+name+'(): NeonQueryFunction<false, false> {';
 const start=projected.indexOf(header),end=projected.indexOf('\n  return _sql;\n}',start);
 assert(start>=0&&end>start);
 const body=projected.slice(start,end+'\n  return _sql;\n}'.length)
  .replace(header,'function initialize() {')
  .replace('(host: string, port: number | string)','(host, port)')
  .replace('process.env.DATABASE_URL!','process.env.DATABASE_URL');
 const neonConfig={fetchEndpoint:()=>opaqueInvalid},connections=[];
 function neon(connection){
  connections.push(connection);
  return async(query='PURE_SYNTHETIC_QUERY',params=[])=>{
   const parsed=new URL(connection),target=neonConfig.fetchEndpoint(parsed.hostname,parsed.port);
   return send(target,{method:'POST',headers:{'Neon-Connection-String':connection},body:JSON.stringify({query,params})});
  };
 }
 const context=vm.createContext({URL,process:{env:{DATABASE_URL:database}},neon,neonConfig});
 vm.runInContext('let _sql=null;\n'+body+'\nglobalThis.initialize=initialize;',context);
 return {initialize:context.initialize,neonConfig,connections,source,projected};
}
function adapter(){
 const events={sql:[],connects:0,releases:0,http:0,pools:0};
 let dispatcher;
 const client={
  async query(query){events.sql.push(query);return {fields:[],rows:[],command:'SELECT',rowCount:0};},
  release(){events.releases++;},
 };
 const nativeHttp=Object.fromEntries(['http','https'].map(protocol=>[protocol,
  Object.fromEntries(['request','get'].map(method=>[method,()=>{events.http++;throw Error('PURE_NETWORK_FORBIDDEN');}]))]));
 const modules={
  'node:fs':{readFileSync(file){assert.equal(file,'/pure/binding.json');return JSON.stringify(topology);}},
  'node:path':path,
  'node:net':{Socket:class{connect(){throw Error('PURE_SOCKET_FORBIDDEN');}}},
  pg:{Pool:class{constructor(options){assert.equal(options.connectionString,appUrl);events.pools++;}
   async connect(){events.connects++;return client;}}},
  '@neondatabase/serverless':{neonConfig:{fetchEndpoint:()=>opaqueInvalid}},
  undici:{Dispatcher:class{},Agent:class{dispatch(){events.http++;throw Error('PURE_NETWORK_FORBIDDEN');}},
   setGlobalDispatcher(value){dispatcher=value;}},
  'node:http':nativeHttp.http,'node:https':nativeHttp.https,
 };
 const context=vm.createContext({URL,Request,Response,Headers,
  process:{env:{DATABASE_URL:appUrl,MYEVE_EXTERNAL_ALPHA_ACCOUNTING_DATABASE_URL:centralUrl,MYEVE_CHAT_ONLY_TRANSPORT_FILE:'/pure/binding.json'}},
  require(name){assert(Object.hasOwn(modules,name),'Unreviewed synthetic dependency');return modules[name];},
  fetch:async()=>{events.http++;throw Error('PURE_NETWORK_FORBIDDEN');},
 });
 vm.runInContext(projectCurrentQETransport(transport),context,{filename:'pure-projected-transport.cjs'});
 return {fetch:context.fetch,events,dispatcher,http:nativeHttp.http};
}
// Own tiny model of Next's Request-before-POST-delegation contract, established
// by static source evidence. Never import/evaluate the installed Next wrapper.
const normalizeBeforeSend=send=>async(resource,options)=>{new Request(resource,options);return send(resource,options);};
function requestOptions(connection=appUrl,method='POST'){
 return {method,headers:{'Neon-Connection-String':connection},body:JSON.stringify({query:'PURE_SYNTHETIC_QUERY',params:[]})};
}

test('old opaque numeric endpoint fails Request normalization before owned SQL adapter',async()=>{
 const a=adapter();
 await assert.rejects(normalizeBeforeSend(a.fetch)(opaqueInvalid,requestOptions()),TypeError);
 assert.equal(a.events.connects,0);assert.equal(a.events.http,0);
});
for(const file of CURRENT_QE_NEON_STORES){
 test('selected store configures its own public Neon instance before lazy client creation: '+file,async()=>{
  const a=adapter(),preload={fetchEndpoint:()=>opaqueInvalid},s=store(file,normalizeBeforeSend(a.fetch));
  const first=s.initialize();assert.equal(s.initialize(),first);
  assert.equal(s.connections.length,1);assert.equal(s.connections[0],appUrl);
  assert.equal(preload.fetchEndpoint(),opaqueInvalid);
  assert.equal(s.neonConfig.fetchEndpoint('127.0.0.1',56792),endpoint);
  assert.equal(s.neonConfig.fetchEndpoint('127.0.0.1','56792'),endpoint);
  assert.equal((await first()).status,200);
  assert.equal(a.events.connects,1);assert.equal(a.events.sql.length,1);assert.equal(a.events.releases,1);assert.equal(a.events.http,0);
 });
 test('selected store preserves the exact canonical body outside public config/import: '+file,()=>{
  const s=store(file);
  const added='  if (_sql === null) {\n    '+currentQENeonConfiguration(true).replaceAll('\n','\n    ')
   +'\n    _sql = neon(process.env.DATABASE_URL!);\n  }';
  const original=s.projected.replace('import { neon, neonConfig, type NeonQueryFunction } from "@neondatabase/serverless";',
   'import { neon, type NeonQueryFunction } from "@neondatabase/serverless";')
   .replace(added,'  if (_sql === null) _sql = neon(process.env.DATABASE_URL!);');
  assert.equal(original,s.source);
  assert.throws(()=>projectCurrentQENeonStore(s.source+'\n',file),/PREIMAGE_CHANGED/);
 });
}
test('separate Eve and Next bundled Neon contexts each receive valid config',()=>{
 const next=store(CURRENT_QE_NEON_STORES[0]),eve=store(CURRENT_QE_NEON_STORES[0]);
 assert.notEqual(next.neonConfig,eve.neonConfig);
 next.initialize();assert.equal(eve.neonConfig.fetchEndpoint(),opaqueInvalid);
 eve.initialize();
 assert.equal(next.neonConfig.fetchEndpoint('127.0.0.1',56792),endpoint);
 assert.equal(eve.neonConfig.fetchEndpoint('127.0.0.1',56792),endpoint);
});
for(const database of [
 'not-a-url',appUrl.replace('postgresql:','https:'),appUrl.replace('127.0.0.1','provider.invalid'),
 appUrl.replace('127.0.0.1','localhost'),appUrl.replace(':56792',':0'),appUrl.replace(':56792',':65536'),
 appUrl.replace('/ea_work_0123456789abcdef0123456789abcdef','/another_database'),appUrl+'?host=foreign',appUrl+'#fragment',
]){
 test('public fixture config rejects invalid database binding case '+String([
  'not-a-url','https:','provider.invalid','localhost',':0',':65536','another_database','?host=','#fragment'
 ].find(value=>database.includes(value))),()=>{
  const s=store(CURRENT_QE_NEON_STORES[0],undefined,database);s.initialize();
  assert.throws(()=>s.neonConfig.fetchEndpoint('127.0.0.1',56792),/QE_OWNED_NEON_DATABASE_REQUIRED/);
 });
}
for(const [host,port] of [['localhost',56792],['provider.invalid',56792],['127.0.0.1',56793],['127.0.0.1','056792'],['127.0.0.1',null]]){
 test('public fixture config rejects mismatching SDK host/port '+host+':'+String(port),()=>{
  const s=store(CURRENT_QE_NEON_STORES[0]);s.initialize();
  assert.throws(()=>s.neonConfig.fetchEndpoint(host,port),/QE_NEON_ENDPOINT_CONNECTION_MISMATCH/);
 });
}
for(const [label,target,options] of [
 ['wrong database',endpoint,requestOptions(centralUrl)],
 ['wrong credentials',endpoint,requestOptions(appUrl.replace('synthetic_only','foreign'))],
 ['invalid connection',endpoint,requestOptions('not-a-url')],
 ['wrong path',endpoint+'/extra',requestOptions()],
 ['wrong port',endpoint.replace(':56792',':56793'),requestOptions()],
 ['query',endpoint+'?x=1',requestOptions()],
 ['fragment',endpoint+'#x',requestOptions()],
 ['wrong method',endpoint,requestOptions(appUrl,'PUT')],
 ['missing connection',endpoint,{method:'POST',body:'{}'}],
]){
 test('projected adapter denies '+label+' before pool or HTTP',async()=>{
  const a=adapter();await assert.rejects(a.fetch(target,options));
  assert.equal(a.events.connects,0);assert.equal(a.events.sql.length,0);assert.equal(a.events.http,0);
 });
}
test('valid opaque endpoint cannot leak to HTTP or Undici without the owned SQL branch',()=>{
 const a=adapter(),url=new URL(endpoint);
 assert.throws(()=>a.http.request(endpoint,{method:'POST'}),/FOREIGN_NODE_HTTP_DENIED/);
 assert.throws(()=>a.dispatcher.dispatch({origin:url.origin,path:url.pathname,method:'POST'},{}),/FOREIGN_HTTP_DENIED/);
 assert.equal(a.events.http,0);assert.equal(a.events.connects,0);
});
test('only two selected SQL stores receive overlays; changed or unselected sources fail closed',()=>{
 assert.deepEqual([...CURRENT_QE_NEON_STORES],['apps/eve/agent/lib/receipts-db.ts','apps/eve/lib/threads-db.ts']);
 for(const file of ['apps/eve/agent/lib/neon.ts','apps/eve/lib/push-db.ts','apps/eve/lib/foreign.ts'])
  assert.throws(()=>projectCurrentQENeonStore('',file),/UNREVIEWED_NEON_STORE/);
 assert.throws(()=>projectCurrentQETransport(transport+'\n'),/SEAM_CHANGED/);
});
test('producer retains its exact overlay guard and adds only the two selected named paths',()=>{
 const producer=readFileSync(new URL('./current-build-producer.mjs',import.meta.url),'utf8');
 const start=producer.indexOf(' const allowed=new Set(['),end=producer.indexOf(']);',start);
 assert(start>0&&end>start);
 const allowed=vm.runInNewContext(producer.slice(start,end+3)+'\n[...allowed]');
 assert.deepEqual([...allowed].sort(),[
  'apps/eve/lib/external-alpha/model.ts','apps/eve/next.config.ts','apps/eve/app/layout.tsx',
  'apps/eve/test/owner-chat-only/fixture-geist-regular.ttf','apps/eve/test/owner-journey/transport.cjs',
  ...CURRENT_QE_NEON_STORES,
 ].sort());
 assert(producer.includes("assert(allowed.has(path)&&!seen.has(path),'BUILD_UNREVIEWED_SEAM')"));
 assert(producer.includes("assert.equal(authored[path]??null,overlay.beforeSha256,'BUILD_SEAM_PREIMAGE')"));
});
