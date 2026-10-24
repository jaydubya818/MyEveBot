import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chmodSync,mkdirSync,mkdtempSync,readFileSync,realpathSync,rmSync,statSync,symlinkSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,join,relative} from 'node:path';
import {captureBuildInputs,verifyBuildInputs} from './build-input-inventory.mjs';
import {assertEveDerivedInputsAbsent,retainFailedBuildInputSnapshot,summarizeInputDifference,validateEveDerivedInputTransition,writePrivateInputInventory} from './eve-derived-inputs.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
const CACHE='apps/eve/node_modules/.cache',EVE=CACHE+'/eve',MODULES=EVE+'/authored-modules';
const META='apps/eve/node_modules/.nitro/last-build.json',MODULE=MODULES+'/'+'e'.repeat(40)+'.mjs';
function fixture(t,{parent=false}={}){
 const root=realpathSync(mkdtempSync(join(tmpdir(),'derived-input-synthetic-')));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const authored={};
 function directory(path){mkdirSync(join(root,path),{recursive:true,mode:0o700});chmodSync(join(root,path),0o700);}
 function file(path,body,mode=0o600){directory(dirname(path));writeFileSync(join(root,path),body,{mode});chmodSync(join(root,path),mode);}
 for(const [path,body] of [['package-lock.json','{}'],['apps/eve/agent/agent.ts','// inert source']]){file(path,body);authored[path]=hash(body);}
 file('node_modules/eve/bin/eve.js','// inert fake SDK file');file('node_modules/other/native.node',Buffer.from([0,255]));
 directory('apps/eve/node_modules');if(parent)file(CACHE+'/unchanged-original.txt','original input');
 const capture=()=>captureBuildInputs(root,authored,['node_modules','apps/eve/node_modules']);
 const before=capture(),node='/synthetic/pinned-node';
 const command={pid:123,processGroupId:123,exitCode:0,groupQuiescent:true,cleanupScope:'OWN_PROCESS_GROUP_ONLY',
  binary:node,args:[join(root,'node_modules/eve/bin/eve.js'),'build'],cwd:join(root,'apps/eve'),logSha256:'a'.repeat(64)};
 function generated(){
  file(MODULE,'// synthetic derived JavaScript, never executed');
  const target=join(root,'apps/eve/.eve/builds/synthetic-generation/output');directory(relative(root,target));
  file(META,JSON.stringify({outputDir:relative(join(root,META),target)}));
 }
 const validate=(after=capture(),observed=command)=>validateEveDerivedInputTransition(root,before,after,observed,node);
 return {root,before,node,command,capture,generated,validate,file,directory};
}
test('precise fresh SDK-derived bytes remain fully captured and sealed after transition',t=>{
 const f=fixture(t);assertEveDerivedInputsAbsent(f.before);f.generated();const after=f.capture(),record=f.validate(after);
 assert.equal(record.status,'DERIVED_BUILD_BYTES_CAPTURED_NOT_QUALIFIED');assert.equal(record.entries.length,6);
 assert.equal(record.moduleCount,1);assert.equal(record.originalEntriesPreserved,f.before.entries.length);
 assert.equal(record.beforeSha256,f.before.sha256);assert.equal(record.afterSha256,after.sha256);
 assert.equal(verifyBuildInputs(f.root,after).status,'BUILD_INPUTS_UNCHANGED_NOT_QUALIFIED');
 assert(after.entries.some(entry=>entry.path===MODULE&&entry.sha256===hash('// synthetic derived JavaScript, never executed')));
 assert.throws(()=>verifyBuildInputs(f.root,f.before),/INPUT_TREE_CHANGED/,'Default verifier must still reject all additions');
});
test('existing unrelated cache parent and its original bytes remain immutable inputs',t=>{
 const f=fixture(t,{parent:true});f.generated();assert.equal(f.validate().entries.length,5);
 f.file(CACHE+'/unchanged-original.txt','changed original');assert.throws(f.validate,/ORIGINAL_INPUT_CHANGED/);
});
for(const path of [EVE,MODULES,META])test('preseeded '+path+' rejects before any trusted transition',t=>{
 const f=fixture(t);if(path===META)f.file(path,'{}');else f.directory(path);
 assert.throws(()=>assertEveDerivedInputsAbsent(f.capture()),/PRESEEDED_NAMESPACE/);
});
for(const kind of ['native-bytes','mode','removal','new-package','new-cache-sibling','cache-native','malformed-name','directory-under-modules','module-mode','module-alias'])
 test('transition rejects '+kind+' without weakening original inputs',t=>{
  const f=fixture(t);f.generated();
  if(kind==='native-bytes')f.file('node_modules/other/native.node','changed');
  if(kind==='mode')chmodSync(join(f.root,'node_modules/other/native.node'),0o700);
  if(kind==='removal')rmSync(join(f.root,'node_modules/other/native.node'));
  if(kind==='new-package')f.file('node_modules/injected/index.js','injected');
  if(kind==='new-cache-sibling')f.file(CACHE+'/unrelated/new.js','injected');
  if(kind==='cache-native')f.file(MODULES+'/native.node','native');
  if(kind==='malformed-name')f.file(MODULES+'/not-a-locked-key.mjs','code');
  if(kind==='directory-under-modules')f.directory(MODULES+'/unexpected');
  if(kind==='module-mode')chmodSync(join(f.root,MODULE),0o700);
  if(kind==='module-alias'){rmSync(join(f.root,MODULE));symlinkSync('../../../../agent/agent.ts',join(f.root,MODULE));}
  assert.throws(f.validate,/DERIVED_|INPUT_ALIAS/);
 });
test('authored lock/code drift still fails during complete capture',t=>{
 const f=fixture(t);f.generated();f.file('apps/eve/agent/agent.ts','changed');assert.throws(f.validate,/AUTHORED_BYTES_CHANGED/);
});
for(const kind of ['extra-key','external-target','not-generation-output','invalid-json','aliased-generation'])test('Nitro metadata rejects '+kind,t=>{
 const f=fixture(t);f.generated();
 if(kind==='extra-key')f.file(META,JSON.stringify({outputDir:'../../../.eve/builds/synthetic-generation/output',ignore:'injected'}));
 if(kind==='external-target')f.file(META,JSON.stringify({outputDir:'/outside/production'}));
 if(kind==='not-generation-output')f.file(META,JSON.stringify({outputDir:'../../../.output'}));
 if(kind==='invalid-json')f.file(META,'not-json');
 if(kind==='aliased-generation'){
  const target=join(f.root,'apps/eve/.eve/builds/synthetic-generation/output');rmSync(target,{recursive:true});
  symlinkSync('../../../../..',target,'dir');
 }
 assert.throws(f.validate);
});
for(const kind of ['wrong-cwd','wrong-node','wrong-command','failed-command','live-group','wrong-group','missing-log'])
 test('derived bytes require the exact owned public build observation: '+kind,t=>{
  const f=fixture(t);f.generated();const command={...f.command,args:[...f.command.args]};
  if(kind==='wrong-cwd')command.cwd='/outside';if(kind==='wrong-node')command.binary='/another/node';
  if(kind==='wrong-command')command.args[1]='dev';if(kind==='failed-command')command.exitCode=1;
  if(kind==='live-group')command.groupQuiescent=false;if(kind==='wrong-group')command.processGroupId=456;
  if(kind==='missing-log')delete command.logSha256;
  assert.throws(()=>f.validate(f.capture(),command),/DERIVED_/);
 });
test('a later generated-byte mutation fails the unchanged full input verifier',t=>{
 const f=fixture(t);f.generated();const after=f.capture();f.validate(after);f.file(MODULE,'later tampering');
 assert.throws(()=>verifyBuildInputs(f.root,after),/INPUT_TREE_CHANGED/);
});
test('structured differences count all paths but cap diagnostic samples and omit contents',t=>{
 const f=fixture(t);f.generated();for(let i=0;i<300;i++)f.file('node_modules/new-'+i,'SYNTHETIC_SECRET_BODY');
 const diff=summarizeInputDifference(f.before,f.capture());assert.equal(diff.added,306);assert.equal(diff.changed,0);assert.equal(diff.removed,0);
 assert.equal(diff.sample.length,256);assert.equal(diff.truncated,true);assert(!JSON.stringify(diff).includes('SYNTHETIC_SECRET_BODY'));
});
test('complete inventories persist privately with exact hashes and never overwrite evidence',t=>{
 const f=fixture(t); // actual output stays outside the sealed synthetic source root
 const output=realpathSync(mkdtempSync(join(tmpdir(),'input-record-synthetic-')));t.after(()=>rmSync(output,{recursive:true,force:true}));
 const target=join(output,'before.json'),record=writePrivateInputInventory(target,f.before);
 assert.equal(statSync(target).mode&0o777,0o600);assert.equal(record.sha256,hash(readFileSync(target)));
 assert.deepEqual(JSON.parse(readFileSync(target)),f.before);assert.throws(()=>writePrivateInputInventory(target,f.before),/EEXIST/);
});
test('forged path/digest/boundary records reject rather than widening filesystem reads',t=>{
 const f=fixture(t);f.generated();const after=f.capture();
 assert.throws(()=>f.validate({...after,sha256:'f'.repeat(64)}),/RECORD_CHANGED/);
 const forged=structuredClone(after);forged.entries[0].path='../outside';delete forged.sha256;forged.sha256=hash(JSON.stringify(forged));
 assert.throws(()=>f.validate(forged),/RECORD_PATH/);
});
test('failed-command diagnostics retain full changed inputs without accepting a transition',t=>{
 const f=fixture(t);f.file('node_modules/other/native.node','changed native');
 const output=realpathSync(mkdtempSync(join(tmpdir(),'failed-input-synthetic-')));t.after(()=>rmSync(output,{recursive:true,force:true}));
 const prefix=join(output,'failed-eve'),result=retainFailedBuildInputSnapshot(f.root,f.before,prefix);
 assert.equal(result.status,'FAILED_BUILD_INPUT_SNAPSHOT_ONLY_NOT_QUALIFIED');assert.equal(result.difference.changed,1);
 assert.equal(JSON.parse(readFileSync(prefix+'-inputs-private.json')).entries.length,f.before.entries.length);
 assert.equal(statSync(prefix+'-difference-private.json').mode&0o777,0o600);
});
test('strict capture failure remains unavailable diagnostic data rather than a forged full vector',t=>{
 const f=fixture(t);f.file('apps/eve/agent/agent.ts','SYNTHETIC_SECRET_CHANGED_BODY');
 const output=realpathSync(mkdtempSync(join(tmpdir(),'unavailable-input-synthetic-')));t.after(()=>rmSync(output,{recursive:true,force:true}));
 const result=retainFailedBuildInputSnapshot(f.root,f.before,join(output,'failed'));
 assert.equal(result.status,'FAILED_BUILD_INPUT_SNAPSHOT_UNAVAILABLE');assert.match(result.messageSha256,/^[a-f0-9]{64}$/);
 assert(!JSON.stringify(result).includes('SYNTHETIC_SECRET_CHANGED_BODY'));
});
