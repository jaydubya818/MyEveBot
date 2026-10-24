import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chmodSync,mkdirSync,mkdtempSync,readFileSync,realpathSync,rmSync,symlinkSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,join} from 'node:path';
import {resolvePackageDirectory,verifyEmittedPackages} from './verify-emitted-packages.mjs';

const write=(path,value)=>{mkdirSync(dirname(path),{recursive:true});writeFileSync(path,value);};
function fixture(t){
 const base=realpathSync(mkdtempSync(join(tmpdir(),'emitted-package-')));
 t.after(()=>rmSync(base,{recursive:true,force:true}));
 const source=join(base,'source'),server=join(base,'server'),packages={};
 mkdirSync(source);mkdirSync(server);write(join(server,'index.mjs'),'// synthetic, never executed');
 function add(key,name,version='1.0.0',dependencies={},body='// throw if executed'){
  const value={name,version,dependencies},root=join(source,key);
  write(join(root,'package.json'),JSON.stringify(value)+'\n');write(join(root,'index.js'),body);
  packages[key]={version,integrity:'sha512-'+createHash('sha512').update(JSON.stringify(value)+body).digest('base64')};
  write(join(source,'package-lock.json'),JSON.stringify({lockfileVersion:3,packages}));
  return root;
 }
 function emit(sourceKey,traceKey=sourceKey){
  const path=join(server,traceKey);
  write(join(path,'package.json'),readFileSync(join(source,sourceKey,'package.json'),'utf8').trim());
  write(join(path,'index.js'),readFileSync(join(source,sourceKey,'index.js')));
  return path;
 }
 return {base,source,server,packages,add,emit,verify:()=>verifyEmittedPackages(source,server)};
}

test('every emitted body is compared; JSON-only metadata serialization is explicit, no PASS',t=>{
 const f=fixture(t);f.add('node_modules/fixture','fixture');f.emit('node_modules/fixture');
 const value=f.verify();
 assert.equal(value.status,'EMITTED_BODIES_AND_PRESENT_PARENT_EDGES_ONLY');
 assert.deepEqual(value.packages[0].installedEquivalenceClass,['node_modules/fixture']);
 assert.equal(value.packages[0].packageMetadataComparison,'JSON_IDENTICAL');
 assert.equal(value.packages[0].originBinding,'UNIQUE_LOCKED_BODY_MATCH');
 assert.deepEqual(value.packages[0].incomingParentEvidence,[]);
});
for(const kind of ['changed','extra','native','executable'])test(`emitted ${kind} body mismatch fails`,t=>{
 const f=fixture(t),key='node_modules/fixture';const original=f.add(key,'fixture'),emitted=f.emit(key);
 if(kind==='changed')write(join(emitted,'index.js'),'changed');
 if(kind==='extra')write(join(emitted,'unexpected.dat'),'extra');
 if(kind==='native'){write(join(original,'binary'),Buffer.from([0,255]));write(join(emitted,'binary'),Buffer.from([0,254]));}
 if(kind==='executable')chmodSync(join(emitted,'index.js'),0o755);
 assert.throws(f.verify,/EMITTED_BODY_MISMATCH/);
});
test('an installed version drift cannot pass matching output metadata',t=>{
 const f=fixture(t),key='node_modules/fixture';f.add(key,'fixture');f.emit(key);
 f.packages[key].version='2.0.0';write(join(f.source,'package-lock.json'),JSON.stringify({lockfileVersion:3,packages:f.packages}));
 assert.throws(f.verify,/INSTALLED_VERSION_DIFFERS_FROM_LOCK/);
});
test('metadata-equal duplicate source paths retain their full byte-verified equivalence class',t=>{
 const f=fixture(t);f.add('node_modules/first/node_modules/fixture','fixture');
 f.add('node_modules/second/node_modules/fixture','fixture');f.emit('node_modules/first/node_modules/fixture','node_modules/fixture');
 assert.deepEqual(f.verify().packages[0].installedEquivalenceClass,
  ['node_modules/first/node_modules/fixture','node_modules/second/node_modules/fixture']);
});
test('different locked published bodies cannot be called an equivalent class',t=>{
 const f=fixture(t);f.add('node_modules/first/node_modules/fixture','fixture');
 f.add('node_modules/second/node_modules/fixture','fixture');f.emit('node_modules/first/node_modules/fixture','node_modules/fixture');
 f.packages['node_modules/second/node_modules/fixture'].integrity='sha512-'+Buffer.alloc(64).toString('base64');
 write(join(f.source,'package-lock.json'),JSON.stringify({lockfileVersion:3,packages:f.packages}));
 assert.throws(f.verify,/AMBIGUOUS_DISTINCT_PUBLISHED_BODIES/);
});
test('actual importing-parent dependency version is checked even when global version matches',t=>{
 const f=fixture(t);f.add('node_modules/parent','parent','1.0.0',{child:'*'});
 f.add('node_modules/child','child','1.0.0',{},'global one');
 f.add('node_modules/parent/node_modules/child','child','2.0.0',{},'nested two');
 f.emit('node_modules/parent');f.emit('node_modules/child');
 assert.equal(resolvePackageDirectory(f.source,join(f.source,'node_modules/parent'),'child'),
  join(f.source,'node_modules/parent/node_modules/child'));
 assert.throws(f.verify,/PARENT_RESOLUTION_MISMATCH/);
 f.emit('node_modules/parent/node_modules/child');
 const parent=f.verify().packages.find(p=>p.name==='parent');
 assert.equal(parent.edges[0].dependency,'node_modules/parent/node_modules/child');
});
test('required source edge missing from installed input fails a present emitted edge',t=>{
 const f=fixture(t);f.add('node_modules/outer/node_modules/parent','parent','1.0.0',{child:'*'});
 f.add('node_modules/other/node_modules/child','child');
 f.emit('node_modules/outer/node_modules/parent','node_modules/parent');
 f.emit('node_modules/other/node_modules/child','node_modules/child');
 assert.throws(f.verify,/SOURCE_REQUIRED_EDGE_MISSING/);
});
test('a pruned declared dependency is honestly NOT_ATTESTED and cannot award closure PASS',t=>{
 const f=fixture(t);f.add('node_modules/parent','parent','1.0.0',{unused:'*'});f.emit('node_modules/parent');
 const value=f.verify();
 assert.equal(value.packages[0].edges[0].status,'DECLARED_NOT_EMITTED_NOT_ATTESTED');
 assert.match(value.scope,/required closure.*not attested/);
});
test('escaping package alias fails full output seal before package lookup',t=>{
 const f=fixture(t);f.add('node_modules/fixture','fixture');f.emit('node_modules/fixture');
 symlinkSync(join(f.source,'node_modules/fixture'),join(f.server,'node_modules/foreign'),'dir');
 assert.throws(f.verify,/RUNTIME_SEAL_ALIAS_TEXT/);
});
test('relative in-output Nitro aliases bind actual canonical version from parent',t=>{
 const f=fixture(t);f.add('node_modules/child','child');
 f.emit('node_modules/child','node_modules/.nf3/child@1.0.0');
 symlinkSync('.nf3/child@1.0.0',join(f.server,'node_modules/child'),'dir');
 assert.equal(resolvePackageDirectory(f.server,f.server,'child'),join(f.server,'node_modules/.nf3/child@1.0.0'));
 assert.equal(f.verify().packages[0].path,'node_modules/.nf3/child@1.0.0');
});
test('a compiled output without any external packages cannot falsely pass this primitive',t=>{
 const f=fixture(t);f.add('node_modules/fixture','fixture');
 assert.throws(f.verify,/NO_EMITTED_PACKAGES/);
});
test('an outer package cannot claim an unregistered nested node_modules file by prefix',t=>{
 const f=fixture(t);f.add('node_modules/outer','outer');f.emit('node_modules/outer');
 write(join(f.server,'node_modules/outer/node_modules/unregistered/index.js'),'uncompared nested bytes');
 assert.throws(f.verify,/TRACE_UNCOMPARED_EMITTED_FILE/);
});
test('an ambiguous emitted subset cannot hide unequal complete native/data source bodies',t=>{
 const f=fixture(t);const a=f.add('node_modules/first/node_modules/fixture','fixture');
 const b=f.add('node_modules/second/node_modules/fixture','fixture');
 f.emit('node_modules/first/node_modules/fixture','node_modules/fixture');
 write(join(a,'unemitted-native'),Buffer.from([0,255]));write(join(b,'unemitted-native'),Buffer.from([0,254]));
 assert.throws(f.verify,/EQUIVALENCE_COMPLETE_SOURCE_BODY/);
});
test('same complete parent bodies cannot hide different effective dependency contexts',t=>{
 const f=fixture(t);f.add('node_modules/first/node_modules/parent','parent','1.0.0',{child:'*'});
 f.add('node_modules/second/node_modules/parent','parent','1.0.0',{child:'*'});
 f.add('node_modules/first/node_modules/parent/node_modules/child','child','1.0.0');
 f.add('node_modules/second/node_modules/parent/node_modules/child','child','2.0.0');
 f.emit('node_modules/first/node_modules/parent','node_modules/parent');
 assert.throws(f.verify,/EQUIVALENCE_EFFECTIVE_PARENT_METADATA|EQUIVALENCE_INTEGRITY/);
});
test('an actual verified importing parent selects its locked source origin without a first-match guess',t=>{
 const f=fixture(t);f.add('node_modules/other/node_modules/fixture','fixture');
 const actual=f.add('node_modules/outer/node_modules/fixture','fixture');
 write(join(actual,'extra-native'),'authenticated selected source data');
 f.add('node_modules/outer','outer','1.0.0',{fixture:'*'});
 f.emit('node_modules/outer');f.emit('node_modules/outer/node_modules/fixture','node_modules/fixture');
 const value=f.verify().packages.find(p=>p.name==='fixture');
 assert.deepEqual(value.installedEquivalenceClass,['node_modules/outer/node_modules/fixture']);
 assert.equal(value.originBinding,'ACTUAL_PARENT_SELECTED_LOCKED_ORIGINS');
 assert.deepEqual(value.incomingParentEvidence,[{traceParent:'node_modules/outer',sourceParent:'node_modules/outer',
  name:'fixture',sourceDependency:'node_modules/outer/node_modules/fixture',observation:'PRESENT_DECLARED_PARENT_DIRECTORY_LOOKUP'}]);
});
