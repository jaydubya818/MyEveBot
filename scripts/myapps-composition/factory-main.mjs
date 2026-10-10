import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {replaceExactFixtureHunks} from './fixture-main-overlay.mjs';
export const reviewedFactoryMain=JSON.parse(readFileSync(new URL('../../docs/myapps/phase3/factory-main-sources.json',import.meta.url)));
export const factoryMainConflicts=[...Object.keys(reviewedFactoryMain.files),reviewedFactoryMain.inventory.path].sort();
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
export function applyFactoryMain({main,head,integration,initialTree,read,readComposed,put}) {
 const manifest=reviewedFactoryMain;
 assert.equal(main,manifest.main,'Unreviewed Factory main');
 assert.equal(integration,manifest.integration,'Unreviewed Factory integration');
 const outputs=new Map();
 for(const [path,expected] of Object.entries(manifest.files)) {
  assert.equal(digest(read(head,path)),expected.preparationSha256,`Changed Factory preparation: ${path}`);
  assert.equal(digest(read(integration,path)),expected.integrationSha256,`Changed Factory integration: ${path}`);
  const initial=read(initialTree,path).replaceAll(`<<<<<<< ${head}\n`,'<<<<<<< PREPARATION\n').replaceAll('<<<<<<< HEAD\n','<<<<<<< PREPARATION\n').replaceAll(`>>>>>>> ${integration}\n`,'>>>>>>> INTEGRATION\n');
  assert.equal(digest(initial),expected.initialSha256,`Changed Factory conflict: ${path}`);
  const resolved=replaceExactFixtureHunks(initial,expected.hunks);
  assert.equal(digest(resolved),expected.outputSha256,`Changed Factory union: ${path}`);
  assert(!resolved.includes('<<<<<<<'),'Unresolved Factory conflict');outputs.set(path,resolved);
 }
 const {path,records}=manifest.inventory,canonical=read(integration,path),preparation=read(head,path);
 assert.equal(digest(canonical),manifest.inventory.integrationSha256,'Changed Factory integration inventory');
 assert.equal(digest(preparation),manifest.inventory.headSha256,'Changed Factory preparation inventory');
 const inventory=JSON.parse(canonical),headInventory=JSON.parse(preparation);
 for(const [file,entry] of Object.entries(records)) {
  assert.deepEqual(headInventory.sources[file]??null,entry.head,`Changed Factory head record: ${file}`);
  assert.deepEqual(inventory.sources[file]??null,entry.integration,`Changed Factory integration record: ${file}`);
  assert.equal(digest(outputs.get(file)??readComposed(file)),entry.composedSourceSha256,`Changed Factory inventoried source: ${file}`);
  inventory.sources[file]=entry.output;
 }
 const inventoryBytes=JSON.stringify(inventory,null,2)+'\n';
 assert.equal(digest(inventoryBytes),manifest.inventory.outputSha256,'Changed Factory inventory union');outputs.set(path,inventoryBytes);
 // This identity was computed by the unchanged canonical generator over the exact
 // reconciled runtime. Final qualification re-runs that generator on the snapshot.
 outputs.set('apps/cloud-control/src/source-identity.json',JSON.stringify(manifest.identity.source,null,2)+'\n');
 const recordPath='docs/myapps/current-main-composition-qualification.json';
 assert.equal(readComposed(recordPath),null,'Unexpected existing composition identity');
 outputs.set(recordPath,JSON.stringify(manifest.identity.record,null,2)+'\n');
 const testPath='apps/cloud-control/test/source-identity-qualification.test.mjs';
 const test=readComposed(testPath);
 assert.equal(digest(test),manifest.identity.testBeforeSha256,'Changed Factory identity qualification');
 const updated=replaceExactFixtureHunks(test,manifest.identity.testHunks);
 assert.equal(digest(updated),manifest.identity.testAfterSha256,'Changed Factory identity lineage');outputs.set(testPath,updated);
 for(const [file,bytes] of outputs)put(file,bytes);
 return {main,integration,files:[...outputs.keys()],sourceDigest:manifest.identity.source.sourceDigest,factoryVersion:manifest.identity.record.factoryVersion,scope:'NONPRODUCTION_EXACT_SOURCE_UNION_ONLY'};
}
