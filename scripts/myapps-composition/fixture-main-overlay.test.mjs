import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {applyFixturesOverlay,reviewedFixtures} from './fixtures-overlay.mjs';
import {replaceExactFixtureHunks} from './fixture-main-overlay.mjs';
const mainManifest=JSON.parse(readFileSync(new URL('../../docs/myapps/phase3/factory-main-fixture-sources.json',import.meta.url)));
const digest=s=>s===null?null:createHash('sha256').update(s).digest('hex');
function fixture(){
 const repo=process.env.MYFACTORY_SOURCE_ROOT;assert(repo,'MYFACTORY_SOURCE_ROOT required');
 const read=(sha,path)=>{const result=spawnSync('git',['-C',repo,'show',`${sha}:${path}`],{encoding:'utf8',maxBuffer:32*1024*1024});if(result.status!==0){assert.match(result.stderr,/does not exist in|exists on disk, but not in/);return null;}return result.stdout;};
 const baseline=reviewedFixtures.myfactory,current=new Map(),writes=new Map();
 for(const [path,entry] of Object.entries(baseline.files)){
  const candidates=[read(baseline.source,path),read(baseline.integration,path)];
  const bytes=candidates.find(bytes=>digest(bytes)===entry.composedSha256);assert.notEqual(bytes,undefined,path);
  current.set(path,mainManifest.files[path]?replaceExactFixtureHunks(bytes,mainManifest.files[path].preimageHunks):bytes);
 }
 const inventory=JSON.parse(read(baseline.integration,baseline.inventory.path));inventory.sources['myapps/lifecycle']={classification:'RETAINED',sha256:'exact'};
 for(const [file,entry] of Object.entries(mainManifest.inventory.records)){inventory.sources[file]=entry.composedRecord;current.set(file,replaceExactFixtureHunks(read(baseline.integration,file),entry.runtimeMainHunks));}
 current.set(baseline.inventory.path,JSON.stringify(inventory));
 return {writes,current,args:{name:'myfactory',integration:baseline.integration,source:baseline.source,main:mainManifest.main,mainManifest,read,readComposed:path=>current.has(path)?current.get(path):read(baseline.integration,path),put:(p,s)=>writes.set(p,s)}};
}
test('canonical fixtures retain exact main capability policy and both producer review boundaries',()=>{
 const {args,writes}=fixture();const provenance=applyFixturesOverlay(args);
 for(const [path,entry] of Object.entries(mainManifest.files))assert.equal(digest(writes.get(path)),entry.outputSha256);
 const inventory=JSON.parse(writes.get(mainManifest.inventory.path));
 assert.equal(inventory.sources['myapps/lifecycle'].sha256,'exact');
 for(const [path,entry] of Object.entries(mainManifest.inventory.records))assert.deepEqual(inventory.sources[path],entry.outputRecord);
 assert.equal(provenance.currentMain.main,mainManifest.main);
 assert(!writes.has('apps/cloud-control/src/postgres-verification.mjs'));
});
test('changed main pin, fixture source, composed assertions and runtime fail before any output',()=>{
 const path=Object.keys(mainManifest.files)[0],runtime=Object.keys(mainManifest.inventory.records)[0];
 for(const kind of ['pin','upstream','composed','runtime','record']){
  const {args,current,writes}=fixture();
  if(kind==='pin')args.main='0'.repeat(40);
  if(kind==='upstream'){const read=args.read;args.read=(sha,p)=>read(sha,p)+(sha===args.main&&p===path?'\n':'');}
  if(kind==='composed')current.set(path,current.get(path)+'\n');
  if(kind==='runtime')current.set(runtime,current.get(runtime)+'\n');
  if(kind==='record'){const p=mainManifest.inventory.path,value=JSON.parse(current.get(p));value.sources[runtime].classification='UNREVIEWED';current.set(p,JSON.stringify(value));}
  assert.throws(()=>applyFixturesOverlay(args),/Unreviewed|Changed/);assert.equal(writes.size,0);
 }
});
test('ambiguous or absent exact hunks cannot silently discard main assertions',()=>{
 assert.throws(()=>replaceExactFixtureHunks('x x',[{from:'x',to:'y'}]),/ambiguous/);
 assert.throws(()=>replaceExactFixtureHunks('x',[{from:'missing',to:'y'}]),/ambiguous/);
 assert.throws(()=>replaceExactFixtureHunks('x',[{from:'',to:'y'}]),/Empty/);
});

test('Eve main capability denials coexist with canonical cleanup and the complete migration ledger',()=>{
 const manifest=JSON.parse(readFileSync(new URL('../../docs/myapps/phase3/myeve-main-fixture-sources.json',import.meta.url)));
 const baseline=reviewedFixtures.myeve,writes=new Map(),current=new Map();
 const repo=new URL('../..',import.meta.url).pathname;
 const read=(sha,path)=>{const r=spawnSync('git',['-C',repo,'show',`${sha}:${path}`],{encoding:'utf8',maxBuffer:32*1024*1024});if(r.status!==0){assert.match(r.stderr,/does not exist in|exists on disk, but not in/);return null;}return r.stdout;};
 for(const [path,expected] of Object.entries(baseline.files)){
  let bytes=read('HEAD',path);
  if(manifest.files[path])assert.equal(digest(bytes),manifest.files[path].composedSha256);
  else {const options=[bytes,null,read(baseline.integration,path),read(baseline.source,path)];bytes=options.find(s=>digest(s)===expected.composedSha256);assert.notEqual(bytes,undefined,path);}
  current.set(path,bytes);
 }
 const args={name:'myeve',integration:baseline.integration,source:baseline.source,main:manifest.main,mainManifest:manifest,read,readComposed:p=>current.get(p),put:(p,s)=>writes.set(p,s)};
 applyFixturesOverlay(args);
 for(const [path,entry] of Object.entries(manifest.files)){
  const result=writes.get(path);assert.equal(digest(result),entry.outputSha256);
  assert(result.includes(baseline.files[path].preserveLedger.to));
  assert(result.includes('terminateOwnedConnection'));assert(result.includes('capabilityPolicyFixture'));
 }
 current.set(Object.keys(manifest.files)[0],current.get(Object.keys(manifest.files)[0])+'\n');writes.clear();
 assert.throws(()=>applyFixturesOverlay(args),/Changed main composed fixture/);assert.equal(writes.size,0);
});
