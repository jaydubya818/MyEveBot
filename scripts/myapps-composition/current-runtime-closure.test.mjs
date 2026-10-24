import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {validateCurrentLoadedClosure} from './current-runtime-closure.mjs';
function fixture(){
 const root='/synthetic/copied/apps/eve/.output/server';
 const entries=['index.mjs','_libs/eve.mjs','node_modules/runtime/package.mjs'].map((path,index)=>({path,type:'file',mode:0o644,sha256:String(index).repeat(64)}));
 const build={output:{root:{path:root},entries},external:{packages:[{path:'node_modules/runtime',files:[{path:'package.mjs',mode:0o644,sha256:'2'.repeat(64)}]}]}};
 const witness={kind:'eve',loads:entries.map(row=>({url:pathToFileURL(root+'/'+row.path).href,role:'OUTPUT',sha256:row.sha256,mode:row.mode,observation:'RETURNED_SOURCE_BYTES_VERIFIED'})),
  resolutions:[{url:pathToFileURL(root+'/node_modules/runtime/package.mjs').href,parentURL:pathToFileURL(root+'/_libs/eve.mjs').href,role:'OUTPUT'}]};
 return {build,witness};
}
test('only loaded current output paths and body-verified externals produce limited closure evidence',()=>{
 const {build,witness}=fixture();const value=validateCurrentLoadedClosure(build,witness);
 assert.equal(value.loadedOutputFiles.length,3);assert.equal(value.unexecutedToolOrDynamicPaths,'NOT_ATTESTED');
});
for(const [name,mutate] of [
 ['Eve module has no loaded-source witness',({witness})=>witness.loads[1].observation='FILE_AND_RESOLUTION_ONLY'],
 ['source dependency fallback',({witness})=>witness.resolutions[0].url='file:///synthetic/copied/node_modules/runtime/package.mjs'],
 ['uncompared external',({build})=>build.external.packages=[]],
 ['external body drift',({build})=>build.external.packages[0].files[0].sha256='f'.repeat(64)],
 ['foreign loaded file',({witness})=>witness.loads.push({role:'INPUT_OR_CONTROL',url:'file:///foreign.js'})],
 ['unsealed output',({witness})=>witness.loads[2].url='file:///synthetic/copied/apps/eve/.output/server/extra.mjs'],
])test('reject '+name,()=>{const value=fixture();mutate(value);assert.throws(()=>validateCurrentLoadedClosure(value.build,value.witness));});
