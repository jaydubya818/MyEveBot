/** Actual bootstrap resolve-method body with simulated normal Node results.
 * Does not register a hook, load an SDK/app or touch the network/filesystem. */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const source=readFileSync(new URL('./current-runtime-bootstrap.mjs',import.meta.url),'utf8');
const start=source.indexOf(' resolve(specifier,context,next){')+' resolve(specifier,context,next){'.length;
const end=source.indexOf('\n },load:hooks.load,',start);
assert(start>0&&end>start);
const body=source.slice(start,end).replaceAll('import.meta.url',JSON.stringify('file:///copy/scripts/bootstrap.mjs'));
function fixture(){
 const records=[],adapterSources=new Set(),roles=new Map(),spec={kind:'eve',outputRoot:'/copy/app/.output/server',clientWorkspace:'/copy',transport:'/copy/app/test/transport.cjs'};
 const context=vm.createContext({spec,roles,adapterSources,fileURLToPath,sep:'/',inside:(root,path)=>path===root||path.startsWith(root+'/'),
  hooks:{resolve:(_s,_c,next)=>next()},record:row=>records.push(row)});
 const resolve=vm.runInContext('(function(specifier,context,next){'+body+'})',context);
 const call=(parent,url)=>resolve('synthetic',{parentURL:parent,conditions:['node']},()=>({url}));
 return {call,roles,records,spec};
}
test('compiled Eve entry and in-output external imports are bound to output',()=>{
 const e=fixture();e.call('file:///copy/scripts/bootstrap.mjs','file:///copy/app/.output/server/index.mjs');
 e.call('file:///copy/app/.output/server/index.mjs','file:///copy/app/.output/server/node_modules/runtime/index.js');
 assert.equal(e.records.at(-1).role,'OUTPUT');
});
test('ordinary Node builtins remain available without a source fallback',()=>{
 const e=fixture();assert.equal(e.call('file:///copy/app/.output/server/index.mjs','node:crypto').url,'node:crypto');assert.equal(e.records[0].role,'BUILTIN');
});
test('transport support has an explicit rooted parent chain',()=>{
 const e=fixture();e.call('file:///copy/scripts/bootstrap.mjs','file:///copy/app/test/transport.cjs');
 e.call('file:///copy/app/test/transport.cjs','file:///copy/node_modules/pg/index.js');
 e.call('file:///copy/node_modules/pg/index.js','file:///copy/node_modules/pg-pool/index.js');
 assert.equal(e.records.at(-1).role,'FIXTURE_TRANSPORT_DEPENDENCY');
});
test('Eve cannot borrow the adapter already-loaded pg to hide a missing bundle',()=>{
 const e=fixture();e.call('file:///copy/scripts/bootstrap.mjs','file:///copy/app/test/transport.cjs');e.call('file:///copy/app/test/transport.cjs','file:///copy/node_modules/pg/index.js');
 assert.throws(()=>e.call('file:///copy/app/.output/server/index.mjs','file:///copy/node_modules/pg/index.js'),/SOURCE_FALLBACK/);
});
test('synthetic createRequire parent cannot borrow a source dependency',()=>{
 const e=fixture();assert.throws(()=>e.call('file:///copy/app/package.json','file:///copy/node_modules/pg/index.js'),/FOREIGN_PARENT/);
});
test('adapter parent cannot escape the authenticated copied input closure',()=>{
 const e=fixture();e.call('file:///copy/scripts/bootstrap.mjs','file:///copy/app/test/transport.cjs');
 assert.throws(()=>e.call('file:///copy/app/test/transport.cjs','file:///foreign/node_modules/pg/index.js'),/SOURCE_FALLBACK/);
});
