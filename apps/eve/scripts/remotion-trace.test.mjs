import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import config, {createRemotionTraceHooks} from '../nitro.config.mjs';

const write = (path, value) => {mkdirSync(dirname(path), {recursive:true});writeFileSync(path, value);};
function fixture(t, parentCount = 2) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'remotion-public-trace-')));
  t.after(() => rmSync(root, {recursive:true, force:true}));
  const studioRoot = join(root, 'node_modules/@remotion/studio');
  const files = {};
  const chain = {};
  const add = (path, name, version, dependencies = {}) => {
    const pkgJSON = {name,version,dependencies,main:'index.js'};
    write(join(path,'package.json'),JSON.stringify(pkgJSON));
    write(join(path,'index.js'),'throw Error("synthetic dependency must never execute")');
    for (const subpath of ['package.json','index.js']) {
      const file=join(path,subpath);
      files[file]={path:file,subpath,parents:[],pkgPath:path,pkgName:name,pkgVersion:version};
    }
    return {path,pkgJSON};
  };
  add(studioRoot,'@remotion/studio','4.0.499',{semver:'7.5.3'});
  const rootSemver=add(join(root,'node_modules/semver'),'semver','7.8.5');
  for (let index=0;index<parentCount;index++) {
    const parent=join(root,`node_modules/existing-parent-${index}/index.js`);
    files[parent]={path:parent,subpath:'index.js',parents:[],pkgPath:dirname(parent),pkgName:`existing-parent-${index}`,pkgVersion:'1.0.0'};
    files[join(rootSemver.path,'index.js')].parents.push(parent);
  }
  for (const [name,version,dependencies] of [
    ['semver','7.5.3',{'lru-cache':'^6.0.0'}],['lru-cache','6.0.0',{yallist:'^4.0.0'}],['yallist','4.0.0',{}],
  ]) chain[name]=add(join(studioRoot,'node_modules',name),name,version,dependencies);
  files[join(chain['lru-cache'].path,'index.js')].parents=[join(chain.semver.path,'index.js')];
  files[join(chain.yallist.path,'index.js')].parents=[join(chain['lru-cache'].path,'index.js')];
  const hooks=createRemotionTraceHooks(root);
  const inputs=[];
  return {root,studioRoot,files,chain,hooks,inputs,entry:join(chain.semver.path,'index.js'),
    start:()=>hooks.traceStart(inputs),finish:()=>hooks.tracedFiles(files)};
}

test('canonical config exposes only supported public hooks and leaves SDK nft options unspecified',()=>{
  assert.deepEqual(Object.keys(config),['traceOpts']);
  assert.deepEqual(Object.keys(config.traceOpts),['hooks']);
  assert.deepEqual(Object.keys(config.traceOpts.hooks).sort(),['traceStart','tracedFiles']);
});

test('adds exactly the Studio-resolved absolute entry, executing no installed package',t=>{
  const f=fixture(t);f.inputs.push('/synthetic-original-input');f.start();
  assert.deepEqual(f.inputs,['/synthetic-original-input',f.entry]);
  // All package entry bodies throw if executed; resolution and reads succeed.
  f.finish();
});

test('an existing absolute input is not duplicated',t=>{
  const f=fixture(t);f.inputs.push(f.entry);f.start();assert.deepEqual(f.inputs,[f.entry]);f.finish();
});

test('adds only a declared packaging parent, preserving original records and transitive links',t=>{
  const f=fixture(t);const original=structuredClone(f.files);
  f.start();f.finish();
  for(const [path,value] of Object.entries(original)) {
    if(path===f.entry)assert.deepEqual(f.files[path],{...value,parents:[join(f.studioRoot,'package.json')]});
    else assert.deepEqual(f.files[path],value);
  }
  assert.equal(Object.keys(f.files).length,Object.keys(original).length);
});

test('missing Studio metadata record gets an explicit declared anchor without asserting an observed import',t=>{
  const f=fixture(t);const path=join(f.studioRoot,'package.json');delete f.files[path];f.start();f.finish();
  assert.deepEqual(f.files[path],{path,subpath:'package.json',parents:[],pkgPath:f.studioRoot,pkgName:'@remotion/studio',pkgVersion:'4.0.499'});
  assert.deepEqual(f.files[f.entry].parents,[path]);
});

for(const count of [0,1,3])test(`pinned writer's ordering inputs preserve root 7.8.5 with ${count} existing parents`,t=>{
  const f=fixture(t,count);f.start();f.finish();
  // Pure model of the pinned writer's public graph ordering, not an SDK run.
  const parents=version=>[...new Set(Object.values(f.files).filter(file=>file.pkgName==='semver'&&file.pkgVersion===version)
    .flatMap(file=>file.parents.map(path=>f.files[path]).filter(parent=>parent&&parent.pkgName!=='semver')
      .map(parent=>`${parent.pkgName}@${parent.pkgVersion}`)))];
  const rows=['7.8.5','7.5.3'].map(version=>({version,parents:parents(version)}));
  rows.sort((a,b)=>{const ca=a.parents.length||Infinity,cb=b.parents.length||Infinity;
    return ca===cb?b.version.localeCompare(a.version,undefined,{numeric:true}):cb-ca;});
  assert.equal(rows[0].version,'7.8.5');
  assert.deepEqual(rows[1].parents,['@remotion/studio@4.0.499']);
});

for(const [label,mutate,pattern] of [
  ['wrong Studio version',f=>rewrite(join(f.studioRoot,'package.json'),j=>j.version='4.0.500'),/STUDIO_VERSION/],
  ['wrong Studio name',f=>rewrite(join(f.studioRoot,'package.json'),j=>j.name='foreign'),/STUDIO_NAME/],
  ['changed declaration',f=>rewrite(join(f.studioRoot,'package.json'),j=>j.dependencies.semver='*'),/DECLARATION/],
  ['wrong nested version',f=>rewrite(join(f.chain.semver.path,'package.json'),j=>j.version='7.5.4'),/DEPENDENCY_VERSION/],
  ['wrong nested name',f=>rewrite(join(f.chain.yallist.path,'package.json'),j=>j.name='foreign'),/DEPENDENCY_NAME/],
  ['changed transitive dependency',f=>rewrite(join(f.chain.yallist.path,'package.json'),j=>j.dependencies={extra:'*'}),/DEPENDENCY_DECLARATIONS/],
  ['optional dependency',f=>rewrite(join(f.chain.yallist.path,'package.json'),j=>j.optionalDependencies={extra:'*'}),/OPTIONAL_DEPENDENCY/],
  ['peer dependency',f=>rewrite(join(f.chain.yallist.path,'package.json'),j=>j.peerDependencies={extra:'*'}),/PEER_DEPENDENCY/],
  ['missing chain metadata',f=>rmSync(join(f.chain.yallist.path,'package.json')),/ENOENT/],
  ['aliased entry',f=>{rmSync(f.entry);symlinkSync('../yallist/index.js',f.entry);},/INPUT_ALIAS/],
  ['changed entry point',f=>{write(join(f.chain.semver.path,'other.js'),'throw Error("never execute")');rewrite(join(f.chain.semver.path,'package.json'),j=>j.main='other.js');},/DEPENDENCY_ENTRY/],
  ['oversized metadata',f=>write(join(f.chain.yallist.path,'package.json'),' '.repeat(1024*1024+1)),/METADATA_LIMIT/],
])test(`${label} rejects before changing NFT input list`,t=>{
  const f=fixture(t);mutate(f);assert.throws(f.start,pattern);assert.deepEqual(f.inputs,[]);
});
function rewrite(path,mutate){const value=JSON.parse(readFileSync(path));mutate(value);write(path,JSON.stringify(value));}

for(const [label,mutate,pattern] of [
  ['missing Studio context',f=>{for(const [path,value]of Object.entries(f.files))if(value.pkgName==='@remotion/studio')delete f.files[path];},/STUDIO_CONTEXT/],
  ['foreign Studio context',f=>{f.files[join(f.studioRoot,'package.json')].pkgPath=f.root;},/STUDIO_CONTEXT/],
  ['missing transitive result',f=>{for(const [path,value]of Object.entries(f.files))if(value.pkgName==='yallist')delete f.files[path];},/CHAIN_MISSING/],
  ['missing baseline version',f=>{for(const [path,value]of Object.entries(f.files))if(value.pkgName==='semver'&&value.pkgVersion==='7.8.5')delete f.files[path];},/BASELINE_SEMVER_CONTEXT/],
  ['unexpected third version',f=>{f.files.extra={pkgName:'semver',pkgVersion:'9.0.0'};},/BASELINE_SEMVER_CONTEXT/],
  ['foreign nested origin',f=>{f.files[f.entry].pkgPath=f.root;},/CHAIN_MISSING|NESTED_ORIGIN/],
  ['unexpected importing parent',f=>{const path=join(f.root,'node_modules/foreign/index.js');f.files[path]={pkgName:'foreign'};f.files[f.entry].parents.push(path);},/UNEXPECTED_PARENT/],
  ['invalid parents',f=>{f.files[f.entry].parents=null;},/PARENT_LIST/],
  ['missing traced entry',f=>{delete f.files[f.entry];},/ENTRY_MISSING/],
])test(`${label} rejects before changing the processed graph`,t=>{
  const f=fixture(t);f.start();mutate(f);const before=structuredClone(f.files);
  assert.throws(f.finish,pattern);assert.deepEqual(f.files,before);
});

test('hook order and concurrent use fail closed; successful traces can run sequentially',t=>{
  const f=fixture(t);assert.throws(f.finish,/HOOK_ORDER/);f.start();assert.throws(f.start,/CONCURRENT_OR_INCOMPLETE/);f.finish();
  assert.throws(f.finish,/HOOK_ORDER/);f.start();f.finish();
  assert.deepEqual(f.files[f.entry].parents,[join(f.studioRoot,'package.json')]);
});
