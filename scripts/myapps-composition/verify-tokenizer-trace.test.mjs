import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,cpSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {verifyTokenizerPackages} from './verify-tokenizer-trace.mjs';
import {reviewedAgentPackaging as reviewed} from './agent-packaging.mjs';

function fixture(t){
 const root=mkdtempSync(join(tmpdir(),'tokenizer-trace-')),source=join(root,'source'),output=join(root,'output');
 t.after(()=>rmSync(root,{recursive:true,force:true}));
 const packages={
  'node_modules/js-tiktoken':{name:'js-tiktoken',version:reviewed.dependency.version,main:'index.js',dependencies:{'encoding-data':'1.0.0'}},
  'node_modules/encoding-data':{name:'encoding-data',version:'1.0.0',main:'index.js'},
 };
 for(const [path,metadata] of Object.entries(packages)){
  mkdirSync(join(source,path),{recursive:true});
  writeFileSync(join(source,path,'package.json'),JSON.stringify(metadata)+'\n');
  writeFileSync(join(source,path,'index.js'),'module.exports = [1,2,3];\n');
 }
 writeFileSync(join(source,'package.json'),'{}');
 writeFileSync(join(source,'package-lock.json'),JSON.stringify({packages:Object.fromEntries(Object.entries(packages).map(([path,metadata])=>[path,{version:metadata.version,integrity:path.endsWith('js-tiktoken')?reviewed.dependency.integrity:'fixture-integrity'}]))}));
 cpSync(source,output,{recursive:true});
 return {source,output,root};
}
function mutateJSON(path,change){const value=JSON.parse(readFileSync(path));change(value);writeFileSync(path,JSON.stringify(value));}

test('trace binds the actual locked package closure with exact runtime bytes',t=>{
 const f=fixture(t);const result=verifyTokenizerPackages(f.source,f.output);
 assert.equal(Object.keys(result.packages).length,2);
 assert.equal(result.packages['node_modules/js-tiktoken'].version,'1.0.21');
});
test('two equally substituted installed versions cannot satisfy the lock',t=>{
 const f=fixture(t);
 for(const root of [f.source,f.output])mutateJSON(join(root,'node_modules/js-tiktoken/package.json'),value=>{value.version='1.0.20';});
 assert.throws(()=>verifyTokenizerPackages(f.source,f.output),/differs from lock/);
});
test('missing, altered and extra encoding runtime files fail closed',t=>{
 const f=fixture(t),path=join(f.output,'node_modules/encoding-data/index.js'),original=readFileSync(path);
 rmSync(path);assert.throws(()=>verifyTokenizerPackages(f.source,f.output),/Cannot find module|file set/);
 writeFileSync(path,'module.exports = [99];');assert.throws(()=>verifyTokenizerPackages(f.source,f.output),/runtime bytes/);
 writeFileSync(path,original);writeFileSync(join(f.output,'node_modules/encoding-data/extra.js'),'throw 1');
 assert.throws(()=>verifyTokenizerPackages(f.source,f.output),/file set/);
});
test('output dependency symlinks cannot escape the traced artifact',t=>{
 const f=fixture(t),path=join(f.output,'node_modules/encoding-data');rmSync(path,{recursive:true});
 symlinkSync(join(f.source,'node_modules/encoding-data'),path,'dir');
 assert.throws(()=>verifyTokenizerPackages(f.source,f.output),/escaped output/);
});
test('runtime-file symlinks inside an otherwise matching package fail closed',t=>{
 const f=fixture(t),path=join(f.output,'node_modules/encoding-data/index.js');rmSync(path);
 symlinkSync(join(f.source,'node_modules/encoding-data/index.js'),path);
 assert.throws(()=>verifyTokenizerPackages(f.source,f.output),/escaped output|Symlink/);
});
test('nested dependency resolution is checked from its actual parent',t=>{
 const f=fixture(t),path=join(f.output,'node_modules/js-tiktoken/node_modules/encoding-data');
 mkdirSync(path,{recursive:true});writeFileSync(join(path,'package.json'),JSON.stringify({name:'encoding-data',version:'2.0.0',main:'index.js'}));
 writeFileSync(join(path,'index.js'),'module.exports = [99];');
 assert.throws(()=>verifyTokenizerPackages(f.source,f.output),/Changed traced package metadata/);
});
