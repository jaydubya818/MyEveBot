import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chmodSync,lstatSync,mkdirSync,mkdtempSync,readFileSync,readdirSync,realpathSync,rmSync,symlinkSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,join,relative,sep} from 'node:path';
import {runInNewContext} from 'node:vm';
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
 function vendor(owner,member,name='vendored',fields={},body='// inert vendored source'){
  const key=owner+'/'+member,value={name,version:'1.0.0',...fields};
  write(join(source,key,'package.json'),JSON.stringify(value)+'\n');write(join(source,key,'index.js'),body);return key;
 }
 function emitVendor(key,traceKey=key){
  write(join(server,traceKey,'package.json'),readFileSync(join(source,key,'package.json')));
  write(join(server,traceKey,'index.js'),readFileSync(join(source,key,'index.js')));return join(server,traceKey);
 }
 return {base,source,server,packages,add,emit,vendor,emitVendor,verify:()=>verifyEmittedPackages(source,server)};
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

for(const [owner,name,member,vendorName] of [
 ['node_modules/@fixture/core','@fixture/core','compiled/browserslist-load-config','browserslist-load-config'],
 ['node_modules/@fixture/core','@fixture/core','compiled/tinypool','tinypool'],
 ['node_modules/@fixture/core','@fixture/core','compiled/watchpack','watchpack'],
 ['node_modules/@fixture/core','@fixture/core','compiled/webpack-sources','webpack-sources'],
 ['node_modules/terser','terser','dist','dist']
])test('vendored metadata is bound to its locked container: '+member,t=>{
 const f=fixture(t);f.add(owner,name);const key=f.vendor(owner,member,vendorName,{type:'commonjs'});f.emit(owner);f.emitVendor(key);
 const value=f.verify().packages.find(p=>p.path===key);
 assert.equal(value.sourceProvenance.kind,'VENDORED_METADATA_MEMBER_OF_LOCKED_PACKAGE');
 assert.equal(value.integrity,null,'No fictional separately locked child integrity');
 assert.deepEqual(value.installedEquivalenceClass,[key]);
 assert.equal(value.sourceProvenance.installedAuthorities[0].lockedPackage,owner);
 assert.equal(value.sourceProvenance.installedAuthorities[0].memberPath,member);
 assert.equal(value.sourceProvenance.installedAuthorities[0].integrity,f.packages[owner].integrity);
 assert.equal(value.originBinding,'LOCKED_CONTAINER_SELECTED_VENDORED_INPUT_MEMBER');
 assert(value.incomingParentEvidence.some(e=>e.observation==='EXACT_NON_NODE_MODULES_VENDORED_INPUT_MEMBER'));
});
for(const kind of ['changed','native','executable','relocated'])test('vendored member '+kind+' cannot escape full file checks',t=>{
 const f=fixture(t),owner='node_modules/owner';f.add(owner,'owner');const key=f.vendor(owner,'compiled/member');f.emit(owner);const output=f.emitVendor(key);
 if(kind==='changed')write(join(output,'index.js'),'changed');
 if(kind==='native'){write(join(f.source,key,'native.node'),Buffer.from([0,255]));write(join(output,'native.node'),Buffer.from([0,254]));}
 if(kind==='executable')chmodSync(join(output,'index.js'),0o755);
 if(kind==='relocated')f.emitVendor(key,owner+'/different/member');
 assert.throws(f.verify,/EMITTED_BODY_MISMATCH/);
});
test('orphan vendor metadata cannot use a global vendored-name body as package authority',t=>{
 const f=fixture(t),owner='node_modules/owner';f.add(owner,'owner');const key=f.vendor(owner,'compiled/member');f.emitVendor(key,'node_modules/vendored');
 assert.throws(f.verify,/NO_LOCKED_METADATA_MATCH/);
});
test('physical vendored membership cannot select an unrelated independently locked metadata-equal package',t=>{
 const f=fixture(t),owner='node_modules/owner';f.add(owner,'owner');const key=f.vendor(owner,'compiled/member','vendored',{dependencies:{}},'same vendor body');
 f.add('node_modules/vendored','vendored','1.0.0',{},'same vendor body');f.emit(owner);f.emitVendor(key);
 const value=f.verify().packages.find(p=>p.path===key);assert.deepEqual(value.installedEquivalenceClass,[key]);assert.equal(value.integrity,null);
});
for(const field of ['dependencies','optionalDependencies','peerDependencies'])test('vendored '+field+' retains actual importer context',t=>{
 const f=fixture(t),owner='node_modules/owner';f.add(owner,'owner');const key=f.vendor(owner,'compiled/member','vendored',{[field]:{child:'*'}});
 f.add(owner+'/node_modules/child','child','2.0.0');f.add('node_modules/child','child','1.0.0');f.emit(owner);f.emitVendor(key);f.emit('node_modules/child');
 assert.throws(f.verify,/PARENT_RESOLUTION_MISMATCH/);
});
test('same container SRI and emitted vendor subset cannot hide different full native/data bodies',t=>{
 const f=fixture(t),a='node_modules/a/node_modules/owner',b='node_modules/b/node_modules/owner';f.add(a,'owner');f.add(b,'owner');
 const av=f.vendor(a,'compiled/member'),bv=f.vendor(b,'compiled/member');write(join(f.source,bv,'unemitted-native'),Buffer.from([1,255]));
 f.emit(a,'node_modules/owner');f.emitVendor(av,'node_modules/owner/compiled/member');
 assert.throws(f.verify,/EQUIVALENCE_COMPLETE_SOURCE_BODY/);
});
test('ambiguous full container bodies still compare the vendored optional peer context',t=>{
 const f=fixture(t),a='node_modules/a/node_modules/owner',b='node_modules/b/node_modules/owner';f.add(a,'owner');f.add(b,'owner');
 const fields={peerDependencies:{child:'*'},peerDependenciesMeta:{child:{optional:true}}};
 const av=f.vendor(a,'compiled/member','vendored',fields);f.vendor(b,'compiled/member','vendored',fields);
 f.add(a+'/node_modules/child','child','1.0.0');f.add(b+'/node_modules/child','child','2.0.0');
 f.emit(a,'node_modules/owner');f.emitVendor(av,'node_modules/owner/compiled/member');
 assert.throws(f.verify,/EQUIVALENCE_EFFECTIVE_PARENT_METADATA|EQUIVALENCE_INTEGRITY/);
});
test('actual importing parent selects container and its vendor together without a body-only origin guess',t=>{
 const f=fixture(t),a='node_modules/importer/node_modules/owner',b='node_modules/other/node_modules/owner';f.add(a,'owner');f.add(b,'owner');
 const av=f.vendor(a,'compiled/member');f.vendor(b,'compiled/member');write(join(f.source,a,'unemitted-native'),'actual selected data');
 f.add('node_modules/importer','importer','1.0.0',{owner:'*'});f.emit('node_modules/importer');f.emit(a,'node_modules/owner');f.emitVendor(av,'node_modules/owner/compiled/member');
 const value=f.verify().packages.find(p=>p.path==='node_modules/owner/compiled/member');
 assert.deepEqual(value.installedEquivalenceClass,[av]);assert.equal(value.sourceProvenance.installedAuthorities[0].lockedPackage,a);
});
test('unlocked nested node_modules cannot be reclassified as a vendored body member',t=>{
 const f=fixture(t),owner='node_modules/owner';f.add(owner,'owner');const key=f.vendor(owner,'node_modules/unlocked');f.emit(owner);f.emitVendor(key);
 assert.throws(f.verify,/NO_LOCKED_METADATA_MATCH/);
});
test('nested non-node_modules metadata members keep the same locked container authority',t=>{
 const f=fixture(t),owner='node_modules/owner';f.add(owner,'owner');const a=f.vendor(owner,'compiled/outer','outer'),b=f.vendor(a,'nested','inner');
 f.emit(owner);f.emitVendor(a);f.emitVendor(b);const value=f.verify().packages.find(p=>p.path===b);
 assert.deepEqual(value.installedEquivalenceClass,[b]);assert.equal(value.sourceProvenance.installedAuthorities[0].lockedPackage,owner);
 assert.equal(value.sourceProvenance.installedAuthorities[0].memberPath,'compiled/outer/nested');
});
for(const where of ['container','member'])for(const kind of ['file','symlink'])
 test('reserved node_modules '+kind+' at '+where+' cannot bypass ambiguous body comparison',t=>{
  const f=fixture(t),a='node_modules/a/node_modules/owner',b='node_modules/b/node_modules/owner';f.add(a,'owner');f.add(b,'owner');
  const av=f.vendor(a,'compiled/member'),bv=f.vendor(b,'compiled/member');
  const left=where==='container'?a:av,right=where==='container'?b:bv;
  if(kind==='file'){write(join(f.source,left,'node_modules'),'left native/data');write(join(f.source,right,'node_modules'),'different right native/data');}
  else{symlinkSync('index.js',join(f.source,left,'node_modules'));symlinkSync('index.js',join(f.source,right,'node_modules'));}
  f.emit(a,'node_modules/owner');f.emitVendor(av,'node_modules/owner/compiled/member');
  assert.throws(f.verify,/EQUIVALENCE_COMPLETE_SOURCE_BODY|EQUIVALENCE_BODY_ALIAS_UNREVIEWED/);
 });
const verifierText=readFileSync(new URL('./verify-emitted-packages.mjs',import.meta.url),'utf8');
const bodyStart=verifierText.indexOf('function completePackageBody('),bodyEnd=verifierText.indexOf('\n/** Full intrinsic',bodyStart);
assert(bodyStart>=0&&bodyEnd>bodyStart);
const actualCompleteBody=runInNewContext(verifierText.slice(bodyStart,bodyEnd)+'\ncompletePackageBody;',{
 assert,join,relative,readdirSync,lstatSync,readFileSync,realpathSync,portable:value=>value.split(sep).join('/'),
 digest:value=>createHash('sha256').update(value).digest('hex')},{timeout:1000});
for(const kind of ['file','symlink'])test('reserved node_modules '+kind+' is checked by the actual member body walk',t=>{
 const f=fixture(t),owner='node_modules/owner';f.add(owner,'owner');const key=f.vendor(owner,'compiled/member');
 const root=join(f.source,key),path=join(root,'node_modules');
 if(kind==='file'){
  write(path,'intrinsic member native/data');const entries=actualCompleteBody(root),record=entries.find(row=>row.path==='node_modules');
  assert(record&&record.type==='file');assert.equal(record.sha256,createHash('sha256').update('intrinsic member native/data').digest('hex'));
 }else{symlinkSync('index.js',path);assert.throws(()=>actualCompleteBody(root),/EQUIVALENCE_BODY_ALIAS_UNREVIEWED/);}
});
test('reserved node_modules real directories remain separately resolved package boundaries',t=>{
 const f=fixture(t),a='node_modules/a/node_modules/owner',b='node_modules/b/node_modules/owner';f.add(a,'owner');f.add(b,'owner');
 const av=f.vendor(a,'compiled/member');f.vendor(b,'compiled/member');
 f.add(a+'/node_modules/unemitted','unemitted','1.0.0');f.add(b+'/node_modules/unemitted','unemitted','2.0.0');
 f.emit(a,'node_modules/owner');f.emitVendor(av,'node_modules/owner/compiled/member');
 const value=f.verify().packages.find(p=>p.path==='node_modules/owner');assert.equal(value.installedEquivalenceClass.length,2);
 assert(!actualCompleteBody(join(f.source,a)).some(row=>row.path.startsWith('node_modules')));
});
test('reserved node_modules nonregular objects fail before body reads in container and member walks',()=>{
 for(const root of ['/synthetic/owner','/synthetic/owner/compiled/member']){
  let reads=0;
  const walk=runInNewContext(verifierText.slice(bodyStart,bodyEnd)+'\ncompletePackageBody;',{
   assert,join,relative,portable:value=>value.split(sep).join('/'),
   readdirSync:path=>{assert.equal(path,root);return ['node_modules'];},
   lstatSync:path=>{assert.equal(path,join(root,'node_modules'));return {isSymbolicLink:()=>false,isDirectory:()=>false,isFile:()=>false};},
   readFileSync:()=>{reads++;throw Error('UNEXPECTED_BODY_READ');}
  },{timeout:1000});
  assert.throws(()=>walk(root),/EQUIVALENCE_NONREGULAR_FILE/);assert.equal(reads,0);
 }
});
