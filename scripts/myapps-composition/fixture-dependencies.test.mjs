/** Tiny owned filesystem fixtures only; never copies/loads installed packages,
 * launches a process, executes the app/SDK or performs a build/network request. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {existsSync,lstatSync,mkdtempSync,mkdirSync,readFileSync,readlinkSync,realpathSync,rmSync,symlinkSync,writeFileSync} from 'node:fs';
import {dirname,join,relative,resolve,sep} from 'node:path';
import {tmpdir} from 'node:os';
import vm from 'node:vm';
import {materializeFixtureDependencies} from './fixture-dependencies.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
const guardSource=readFileSync(new URL('../../apps/eve/nitro.config.mjs',import.meta.url),'utf8');
assert.equal(hash(guardSource),'536432bfc8f7a2fffe4a96d86126070583a35460e19748f8f62f7d90100369bc');
const start=guardSource.indexOf('export function createRemotionTraceHooks('),end=guardSource.indexOf('\nexport default',start);assert(start>0&&end>start);
const hooks=vm.runInNewContext(guardSource.slice(start,end).replace('export function','function')+'\ncreateRemotionTraceHooks',
 {assert,lstatSync,readFileSync,realpathSync,createRequire,join,relative,resolve,sep,STUDIO:'@remotion/studio'});
const file=(path,bytes)=>{mkdirSync(dirname(path),{recursive:true});writeFileSync(path,bytes);};
function fixture(t){
 const root=realpathSync(mkdtempSync(join(tmpdir(),'fixture-dependency-materialization-')));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const source=join(root,'source'),target=join(root,'isolated');
 for(const dir of [source,target]){
  mkdirSync(join(dir,'apps/eve'),{recursive:true});file(join(dir,'package.json'),'{}\n');file(join(dir,'package-lock.json'),'{"lockfileVersion":3}\n');
 }
 file(join(source,'node_modules/sdk/index.js'),'throw Error("synthetic package must never execute");\n');
 file(join(source,'apps/eve/node_modules/nested/index.js'),'// synthetic nested package\n');
 return {root,source,target};
}
function studio(source){
 const base=join(source,'node_modules/@remotion/studio');
 file(join(base,'package.json'),JSON.stringify({name:'@remotion/studio',version:'4.0.499',dependencies:{semver:'7.5.3'}}));
 for(const [name,version,dependencies] of [['semver','7.5.3',{'lru-cache':'^6.0.0'}],['lru-cache','6.0.0',{yallist:'^4.0.0'}],['yallist','4.0.0',{}]]){
  file(join(base,'node_modules',name,'package.json'),JSON.stringify({name,version,main:'index.js',dependencies}));
  file(join(base,'node_modules',name,'index.js'),'throw Error("synthetic dependency must never execute");\n');
 }
}
test('root and app dependency bytes become independent physical copies',t=>{
 const f=fixture(t),sourceFile=join(f.source,'node_modules/sdk/index.js'),before=readFileSync(sourceFile);
 const result=materializeFixtureDependencies(f.source,f.target);assert.deepEqual(result.materialized,['node_modules','apps/eve/node_modules']);
 const output=join(f.target,'node_modules/sdk/index.js');assert.deepEqual(readFileSync(output),before);assert.notEqual(lstatSync(output).ino,lstatSync(sourceFile).ino);assert.equal(realpathSync(output),output);
 writeFileSync(output,'changed owned fixture');assert.deepEqual(readFileSync(sourceFile),before);
});
test('an explicitly borrowed dependency root is copied rather than retained as an alias',t=>{
 const f=fixture(t),shared=join(f.root,'shared');mkdirSync(shared);file(join(shared,'sdk/index.js'),'// shared synthetic bytes');rmSync(join(f.source,'node_modules'),{recursive:true});symlinkSync(shared,join(f.source,'node_modules'),'dir');
 materializeFixtureDependencies(f.source,f.target);assert(!lstatSync(join(f.target,'node_modules')).isSymbolicLink());assert.equal(realpathSync(join(f.target,'node_modules')),join(f.target,'node_modules'));
});
test('fully hoisted installation needs no invented app dependency directory',t=>{
 const f=fixture(t);rmSync(join(f.source,'apps/eve/node_modules'),{recursive:true});assert.deepEqual(materializeFixtureDependencies(f.source,f.target).materialized,['node_modules']);
});
test('relative workspace and bin aliases stay relative and resolve inside the fixture',t=>{
 const f=fixture(t);mkdirSync(join(f.source,'node_modules/.bin'));file(join(f.source,'node_modules/sdk/cli.js'),'// synthetic');symlinkSync('../sdk/cli.js',join(f.source,'node_modules/.bin/sdk'));
 symlinkSync('../apps/eve',join(f.source,'node_modules/workspace'),'dir');materializeFixtureDependencies(f.source,f.target);
 assert.equal(readlinkSync(join(f.target,'node_modules/.bin/sdk')),'../sdk/cli.js');assert.equal(realpathSync(join(f.target,'node_modules/workspace')),join(f.target,'apps/eve'));
});
test('changed source lock fails before any dependency copy',t=>{
 const f=fixture(t);file(join(f.target,'package-lock.json'),'changed');assert.throws(()=>materializeFixtureDependencies(f.source,f.target),/SOURCE_CHANGED/);assert(!existsSync(join(f.target,'node_modules')));
});
test('overlapping source and target never copy',t=>{
 const f=fixture(t);assert.throws(()=>materializeFixtureDependencies(f.source,f.source),/ROOT_OVERLAP/);
});
test('existing target dependencies are never overwritten',t=>{
 const f=fixture(t);file(join(f.target,'node_modules/retained'),'keep');assert.throws(()=>materializeFixtureDependencies(f.source,f.target),/TARGET_EXISTS/);assert.equal(readFileSync(join(f.target,'node_modules/retained'),'utf8'),'keep');
});
test('dangling target aliases are not treated as absent',t=>{
 const f=fixture(t);symlinkSync(join(f.root,'absent'),join(f.target,'node_modules'),'dir');assert.throws(()=>materializeFixtureDependencies(f.source,f.target),/TARGET_EXISTS/);assert(lstatSync(join(f.target,'node_modules')).isSymbolicLink());
});
for(const [name,target] of [['absolute',f=>join(f.source,'node_modules/sdk/index.js')],['escaping-relative',()=> '../../../../foreign']])test(name+' dependency alias fails before copying',t=>{
 const f=fixture(t);symlinkSync(target(f),join(f.source,'node_modules/bad'));assert.throws(()=>materializeFixtureDependencies(f.source,f.target),/LINK_ESCAPE/);assert(!existsSync(join(f.target,'node_modules')));
});
test('a target parent alias cannot redirect a nested dependency copy',t=>{
 const f=fixture(t),outside=join(f.root,'other-app');mkdirSync(outside);rmSync(join(f.target,'apps/eve'),{recursive:true});symlinkSync(outside,join(f.target,'apps/eve'),'dir');
 assert.throws(()=>materializeFixtureDependencies(f.source,f.target),/TARGET_PARENT_ALIAS/);assert(!existsSync(join(f.target,'node_modules')));
});
test('a dangling copied dependency remains a failure, never a qualified tree',t=>{
 const f=fixture(t);symlinkSync('./missing',join(f.source,'node_modules/dangling'));assert.throws(()=>materializeFixtureDependencies(f.source,f.target),/ENOENT/);
});
test('unchanged strict Nitro guard rejects old borrowed topology and accepts physical materialization',t=>{
 const f=fixture(t);studio(f.source);const old=join(f.root,'old');mkdirSync(old);symlinkSync(join(f.source,'node_modules'),join(old,'node_modules'),'dir');
 assert.throws(()=>hooks(old).traceStart([]),/REMOTION_TRACE_INPUT_ALIAS/);
 materializeFixtureDependencies(f.source,f.target);const inputs=[];hooks(f.target).traceStart(inputs);assert.deepEqual(inputs,[join(f.target,'node_modules/@remotion/studio/node_modules/semver/index.js')]);
});
test('both ordinary fixture producers materialize before build/instrumentation and use no host dependency links',()=>{
 const runner=readFileSync(new URL('../../apps/eve/test/owner-journey/runner-prod.ts',import.meta.url),'utf8'),enterprise=readFileSync(new URL('../../apps/eve/test/browser/prepare-enterprise.mjs',import.meta.url),'utf8');
 assert(runner.includes('materializeFixtureDependencies(root,isolated);'));assert(enterprise.includes('materializeFixtureDependencies(source,target);'));
 assert(!runner.includes('await symlink(')&&!enterprise.includes('await symlink('));
 assert(runner.indexOf('materializeFixtureDependencies(')<runner.indexOf("execFileSync(process.execPath,[eveCli,'build']"));
 assert(runner.includes("const eveCli=join(isolated,'node_modules/eve/bin/eve.js');"));
 const seam=readFileSync(new URL('./current-qe-seams.mjs',import.meta.url),'utf8');assert(seam.includes(hash(runner)),'Exact reviewed runner fingerprint must be refreshed');
});
