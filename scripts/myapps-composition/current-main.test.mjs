import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {reviewedMain,verifyMainSource,retainMainCatalog,retainMainInventory,verifyMainPreserved,verifyPackagingPreserved} from './current-main.mjs';
const root=fileURLToPath(new URL('../..',import.meta.url));
const read=(sha,path)=>{const r=spawnSync('git',['-C',root,'show',`${sha}:${path}`],{encoding:'utf8',maxBuffer:32*1024*1024});assert.equal(r.status,0,r.stderr);return r.stdout;};

const readRaw=(sha,path)=>{const r=spawnSync('git',['-C',root,'show',`${sha}:${path}`],{maxBuffer:32*1024*1024});assert.equal(r.status,0);return r.stdout;};

test('main preference declarations retain disabled MyApps catalog ownership',()=>{
 const main=reviewedMain.main,preparationCatalog=read('HEAD',reviewedMain.catalog.path);
 const catalog=preparationCatalog.replace(reviewedMain.catalog.added,'');
 const output=retainMainCatalog({main,read,readRaw,catalog,preparationCatalog});
 assert.equal(output,preparationCatalog);
 assert(output.includes('MyApps requires separately authorized trusted local composition.'));
 assert.equal(output.split('tool("installed_apps",').length,2);
 assert.throws(()=>retainMainCatalog({main,read,readRaw,catalog:output,preparationCatalog}),/Duplicate/);
});

test('current-main records preserve MyApps classifications and reject changed runtime atomically',()=>{
 const inventoryPath='apps/eve/scripts/executor-inventory.json';
 const original=JSON.parse(read('HEAD',inventoryPath));
 const inventory=structuredClone(original),readComposed=path=>read('HEAD',path);
 retainMainInventory({main:reviewedMain.main,read,readRaw,readComposed,inventory});
 for(const [path,entry] of Object.entries(original.executors))if(!reviewedMain.inventory[path])assert.deepEqual(inventory.executors[path],entry,path);
 for(const path of ['lib/capability-control/store.ts','agent/channels/eve.ts']) {
  const failed=structuredClone(original);
  assert.throws(()=>retainMainInventory({main:reviewedMain.main,read,readRaw,readComposed:file=>readComposed(file)+(file==='apps/eve/'+path?'\n':''),inventory:failed}),/Lost current-main runtime/);
  assert.deepEqual(failed,original);
 }
});

test('main pin and source mutation cannot inherit previous qualification',()=>{
 assert.throws(()=>verifyMainSource('0'.repeat(40),readRaw),/Unreviewed/);
 const file='packages/capability-enforcement/src/recovery-witness.ts';
 assert.throws(()=>verifyMainSource(reviewedMain.main,(sha,path)=>Buffer.concat([readRaw(sha,path),Buffer.from(path===file?'\n':'')])),/Changed current-main source/);
 assert.throws(()=>verifyMainPreserved({main:reviewedMain.main,readRaw,readComposedRaw:path=>Buffer.concat([readRaw('HEAD',path),Buffer.from('\n')])}),/Unqualified current-main reconciliation|Current-main output changed/);
});

test('reviewed standalone source and trace metadata reject missing or substituted inputs',()=>{
 const readComposedRaw=path=>{
  let bytes=readRaw('HEAD',path);
  if(path==='apps/builder/lib/manifest.ts')for(const name of ['browser','connection-reporting','jev','knowledge'])
   bytes=Buffer.from(bytes.toString().replace(`agent/instructions/${name}.md`,`agent/instructions/${name}.ts`));
  return bytes;
 };
 assert.equal(verifyPackagingPreserved(readComposedRaw).source,'bc9d595b130d72e51d738ecb18898406f31940f7');
 for(const changed of Object.keys(reviewedMain.packaging.files))for(const missing of [false,true])
  assert.throws(()=>verifyPackagingPreserved(path=>path===changed?(missing?null:Buffer.concat([readComposedRaw(path),Buffer.from('\n')])):readComposedRaw(path)),/Changed reviewed standalone packaging source/);
});
