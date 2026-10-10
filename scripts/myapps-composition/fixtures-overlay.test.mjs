import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {readFileSync} from 'node:fs';
import {replaceExactFixtureHunks} from './fixture-main-overlay.mjs';
import {applyFixturesOverlay,reviewedFixtures} from './fixtures-overlay.mjs';

const root=fileURLToPath(new URL('../..',import.meta.url));
const digest=value=>value===null?null:createHash('sha256').update(value).digest('hex');
function fixture(name) {
  const manifest=reviewedFixtures[name],repo=name==='myeve'?root:process.env.MYFACTORY_SOURCE_ROOT;
  assert(repo,'MYFACTORY_SOURCE_ROOT must point to the pinned local Factory checkout');
  const read=(sha,path)=>{
    const result=spawnSync('git',['-C',repo,'show',`${sha}:${path}`],{encoding:'utf8',maxBuffer:32*1024*1024});
    if(result.status!==0){assert.match(result.stderr,/does not exist in|exists on disk, but not in/);return null;}
    return result.stdout;
  };
  const current=new Map();
  for(const [path,expected] of Object.entries(manifest.files)) {
    const canonical=read(manifest.source,path);
    // Preparation retains the reviewed preimage when the canonical fixture advances.
    // Every candidate still has to match the unchanged composed SHA exactly.
    const possibilities=[null,read('HEAD',path),read(manifest.integration,path),canonical];
    const main=JSON.parse(readFileSync(new URL(`../../docs/myapps/phase3/${name==='myeve'?'myeve':'factory'}-main-fixture-sources.json`,import.meta.url)));
    const entry=main.files[path],head=read('HEAD',path);
    if(entry&&digest(head)===entry.composedSha256)possibilities.push(replaceExactFixtureHunks(head,entry.preimageHunks,true));
    if(expected.preserveLedger)possibilities.push(canonical.replace(expected.preserveLedger.from,expected.preserveLedger.to));
    const matching=possibilities.find(value=>digest(value)===expected.composedSha256);
    assert.notEqual(matching,undefined,`Missing exact composed fixture input: ${path}`);
    current.set(path,matching);
  }
  if(manifest.inventory) {
    const inventory=JSON.parse(read(manifest.integration,manifest.inventory.path));
    inventory.sources['myapps/retained-lifecycle.ts']={classification:'RETAINED_TEST_SENTINEL',sha256:'unchanged'};
    current.set(manifest.inventory.path,JSON.stringify(inventory));
  }
  const writes=new Map(),readComposed=path=>current.has(path)?current.get(path):read(manifest.integration,path);
  return {manifest,writes,current,args:{name,integration:manifest.integration,source:manifest.source,read,readComposed,put:(path,bytes)=>writes.set(path,bytes)}};
}

for(const name of ['myeve','myfactory']) {
  test(`${name}: exact fixture inputs preserve assertions, ownership and unrelated runtime`,()=>{
    const {manifest,writes,args}=fixture(name),result=applyFixturesOverlay(args);
    assert.deepEqual([...writes.keys()].sort(),[...Object.keys(manifest.files),...(manifest.inventory?[manifest.inventory.path]:[])].sort());
    for(const [path,expected] of Object.entries(manifest.files))assert.equal(digest(writes.get(path)),expected.outputSha256);
    assert.equal(result.scope,'DISPOSABLE_TEST_QUALIFICATION_ONLY');
    if(name==='myeve') {
      const ledger=Object.entries(manifest.files).find(([,value])=>value.preserveLedger);
      assert(writes.get(ledger[0]).includes(ledger[1].preserveLedger.to));
      assert(writes.get(ledger[0]).includes("rejects.toThrow('Qualified pricing has expired')"));
    } else {
      const inventory=JSON.parse(writes.get(manifest.inventory.path));
      assert.equal(inventory.sources['myapps/retained-lifecycle.ts'].sha256,'unchanged');
      assert.equal(result.inventorySources.length,3);
      for(const path of Object.keys(manifest.inventory.records))assert(!writes.has(path),'Must not rewrite runtime to match metadata');
    }
  });
  test(`${name}: changed pins, reviewed bytes or composed fixtures fail atomically`,()=>{
    const path=Object.keys(reviewedFixtures[name].files)[0];
    for(const kind of ['source','integration','canonicalBytes','composedBytes']) {
      const {writes,args}=fixture(name);
      const patch=kind==='source'||kind==='integration'?{[kind]:'0'.repeat(40)}:
        kind==='canonicalBytes'?{read:(sha,file)=>args.read(sha,file)+(file===path?'\n':'')}:
          {readComposed:file=>file===path?args.readComposed(file)+'\n':args.readComposed(file)};
      assert.throws(()=>applyFixturesOverlay({...args,...patch}),/Unreviewed|Changed composed/);
      assert.equal(writes.size,0);
    }
  });
}

test('producer metadata requires exact unchanged runtime and preserves its classification',()=>{
  for(const kind of ['runtime','record','classification']) {
    const {manifest,writes,args}=fixture('myfactory'),path=Object.keys(manifest.inventory.records)[0];
    const original=args.readComposed;
    args.readComposed=file=>{
      if(kind==='runtime'&&file===path)return original(file)+'\n';
      if(kind!=='runtime'&&file===manifest.inventory.path){const value=JSON.parse(original(file));value.sources[path][kind==='record'?'authorityBoundary':'classification']='changed';return JSON.stringify(value);}
      return original(file);
    };
    assert.throws(()=>applyFixturesOverlay(args),/Changed producer record|Changed composed producer/);
    assert.equal(writes.size,0);
  }
});

test('superseded Eve fixture approval cannot replace the qualified cleanup source',()=>{
  const {writes,args}=fixture('myeve');
  assert.throws(()=>applyFixturesOverlay({...args,source:'977438094ad830f6cb80523a890ca9188f32febe'}),/Unreviewed fixture source/);
  assert.equal(writes.size,0);
});
