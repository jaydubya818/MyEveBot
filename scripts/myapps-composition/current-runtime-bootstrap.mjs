/** Owned process entry. No inherited loader; the producer authenticates this
 * bootstrap before spawn. It registers normal Node hooks before app/client code. */
import assert from 'node:assert/strict';
import {appendFileSync,readFileSync,writeFileSync} from 'node:fs';
import {createRequire,registerHooks,syncBuiltinESMExports} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {sep} from 'node:path';
import {createSealedModuleHooks} from './sealed-module-hooks.mjs';
const spec=JSON.parse(readFileSync(process.argv[2],'utf8'));
assert(['eve','next','client'].includes(spec.kind));
assert.equal(process.env.NODE_OPTIONS,undefined,'RUNTIME_INHERITED_LOADER');
let bytes=0;
function record(row){
 const body=JSON.stringify(row)+'\n';bytes+=Buffer.byteLength(body);
 assert(bytes<=16*1024**2,'RUNTIME_MODULE_LOG_LIMIT');appendFileSync(spec.moduleLog,body,{mode:0o600});
}
const adapterSources=new Set(),roles=new Map();
const inside=(root,path)=>path===root||path.startsWith(root+sep);
const hooks=createSealedModuleHooks(spec.approvedFiles,row=>record({kind:'load',role:roles.get(fileURLToPath(row.url))??'INPUT_OR_CONTROL',...row}));
registerHooks({
 resolve(specifier,context,next){
  const result=hooks.resolve(specifier,context,next);
  let role='BUILTIN';
  if(result.url.startsWith('file:')){
   const path=fileURLToPath(result.url),parent=context.parentURL?.startsWith('file:')?fileURLToPath(context.parentURL):null;
   role=inside(spec.outputRoot,path)?'OUTPUT':'INPUT_OR_CONTROL';
   if(spec.kind==='eve'&&role!=='OUTPUT'){
    if(parent===fileURLToPath(import.meta.url)&&path===spec.transport)adapterSources.add(path);
    else if(adapterSources.has(parent)&&inside(spec.clientWorkspace,path)&&path.includes(sep+'node_modules'+sep))adapterSources.add(path);
    else throw Error('RUNTIME_EVE_FOREIGN_PARENT_OR_SOURCE_FALLBACK');
    role='FIXTURE_TRANSPORT_DEPENDENCY';
   }
   roles.set(path,role);
  }
  record({kind:'resolution',role,specifier,parentURL:context.parentURL??null,url:result.url,conditions:context.conditions});
  return result;
 },load:hooks.load,
});
const require=createRequire(import.meta.url);
// This is the reviewed fixture adapter from the copied/authenticated source,
// loaded AFTER hooks, rather than an invisible --require prewarm.
require(spec.transport);
if(spec.kind!=='client'){
 const http=require('node:http'),createServer=http.createServer;
 http.createServer=function(...args){
  const server=Reflect.apply(createServer,this,args);
  server.on('listening',()=>{const address=server.address();if(address&&typeof address==='object')record({kind:'listener',pid:process.pid,address:address.address,port:address.port});});
  server.prependListener('request',(request)=>{
   const marker=request.headers['x-myeve-runtime-probe'];
   if(typeof marker==='string'&&[spec.httpProbeMarker+'-direct',spec.httpProbeMarker+'-proxy',spec.httpProbeMarker+'-chat'].includes(marker))
    record({kind:'http-request',pid:process.pid,port:request.socket.localPort,marker,method:request.method,path:request.url});
  });
  return server;
 };
 syncBuiltinESMExports();
}
if(spec.kind==='client'){
 const {observePublicRuntime}=await import(pathToFileURL(spec.entry).href);
 const observation=await observePublicRuntime(spec.config);
 writeFileSync(spec.result,JSON.stringify(observation,null,2)+'\n',{flag:'wx',mode:0o600});
}else{
 process.argv=[process.execPath,spec.entry,...spec.args];
 await import(pathToFileURL(spec.entry).href);
}
