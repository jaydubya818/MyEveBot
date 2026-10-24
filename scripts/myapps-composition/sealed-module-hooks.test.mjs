import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chmodSync,mkdtempSync,realpathSync,rmSync,symlinkSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createSealedModuleHooks} from './sealed-module-hooks.mjs';

function fixture(t){
 const root=realpathSync(mkdtempSync(join(tmpdir(),'sealed-module-')));
 t.after(()=>rmSync(root,{recursive:true,force:true}));
 const path=join(root,'selected.mjs'),body='throw new Error("never executed");';
 writeFileSync(path,body);chmodSync(path,0o644);
 const record={path,sha256:createHash('sha256').update(body).digest('hex'),mode:0o644};
 const reads=[],hooks=createSealedModuleHooks([record],value=>reads.push(value));
 return {root,path,body,record,reads,hooks,url:pathToFileURL(path).href};
}
test('selected resolution/load is preserved and recorded without running the module',t=>{
 const f=fixture(t),result={url:f.url,format:'module'};
 assert.equal(f.hooks.resolve('./selected.mjs',{parentURL:f.url},()=>result),result);
 const loaded={source:f.body,format:'module'};
 assert.equal(f.hooks.load(f.url,{},()=>loaded),loaded);
 assert.deepEqual(f.reads,[{url:f.url,sha256:f.record.sha256,mode:0o644,format:'module',observation:'RETURNED_SOURCE_BYTES_VERIFIED'}]);
});
test('normal Node builtins do not masquerade as file capabilities',t=>{
 const f=fixture(t),result={url:'node:fs',format:'builtin'};
 assert.equal(f.hooks.resolve('fs',{parentURL:f.url},()=>result),result);
 assert.equal(f.hooks.load('node:fs',{},()=>result),result);assert.equal(f.reads.length,0);
});
for(const value of ['data:text/javascript,throw%201','https://example.invalid/module.js'])
 test('non-file module scheme denied: '+value,t=>{
  const f=fixture(t);assert.throws(()=>f.hooks.resolve(value,{},()=>({url:value})),/FILE_URL_REQUIRED/);
 });
test('foreign module and foreign importing parent are denied',t=>{
 const f=fixture(t),foreign=join(f.root,'unselected.mjs');writeFileSync(foreign,'throw 1');
 const url=pathToFileURL(foreign).href;
 assert.throws(()=>f.hooks.resolve('foreign',{},()=>({url})),/UNSEALED_RESOLUTION/);
 assert.throws(()=>f.hooks.resolve('child',{parentURL:url},()=>({url:f.url})),/UNSEALED_RESOLUTION/);
});
for(const change of ['bytes','mode'])test('resolution/load rejects changed '+change,t=>{
 const f=fixture(t);if(change==='bytes')writeFileSync(f.path,'modified');else chmodSync(f.path,0o755);
 assert.throws(()=>f.hooks.resolve('selected',{},()=>({url:f.url})),/FILE_(MODE|BYTES)_CHANGED/);
 assert.throws(()=>f.hooks.load(f.url,{},()=>({source:f.body})),/FILE_(MODE|BYTES)_CHANGED/);
});
test('an undeclared symlink spelling cannot bypass the canonical file inventory',t=>{
 const f=fixture(t),alias=join(f.root,'alias.mjs');symlinkSync('selected.mjs',alias);
 assert.throws(()=>f.hooks.resolve('alias',{},()=>({url:pathToFileURL(alias).href})),/UNDECLARED_ALIAS/);
});
test('URL query and fragment are not silent alternative module identities',t=>{
 const f=fixture(t);
 for(const suffix of ['?changed','#changed'])
  assert.throws(()=>f.hooks.load(f.url+suffix,{},()=>({source:f.body})),/FILE_URL_REQUIRED/);
});
test('a downstream loader cannot silently replace authenticated source bytes',t=>{
 const f=fixture(t);
 assert.throws(()=>f.hooks.load(f.url,{},()=>({source:'modified',format:'module'})),/UNREVIEWED_SOURCE_TRANSFORM/);
 assert.equal(f.reads.length,0);
});
test('mutation during the downstream load is rejected before success is recorded',t=>{
 const f=fixture(t);
 assert.throws(()=>f.hooks.load(f.url,{},()=>{writeFileSync(f.path,'mutated');return {source:f.body};}),/FILE_BYTES_CHANGED/);
 assert.equal(f.reads.length,0);
});
test('unknown fields, duplicate capabilities and malformed digests fail construction',t=>{
 const f=fixture(t);
 assert.throws(()=>createSealedModuleHooks([{...f.record,ignore:true}]),/RECORD_FIELDS/);
 assert.throws(()=>createSealedModuleHooks([f.record,f.record]),/DUPLICATE_FILE/);
 assert.throws(()=>createSealedModuleHooks([{...f.record,sha256:'fake'}]),/RECORD_DIGEST/);
});
test('a null or unavailable source is recorded as file/resolution only, never loaded-byte equivalence',t=>{
 const f=fixture(t);f.hooks.load(f.url,{},()=>({source:null,format:'commonjs'}));
 assert.equal(f.reads[0].observation,'FILE_AND_RESOLUTION_ONLY');
});
