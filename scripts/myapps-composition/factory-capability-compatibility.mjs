import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
export const reviewedFactoryCapabilityCompatibility=JSON.parse(readFileSync(new URL('../../docs/myapps/phase3/factory-capability-compatibility.json',import.meta.url)));
const digest=value=>value===null?null:createHash('sha256').update(value).digest('hex');
/** Exact reviewed source compatibility only; no installed binding or release authority. */
export function applyFactoryCapabilityCompatibility({source,main,integration,read,readComposed,put}) {
 const manifest=reviewedFactoryCapabilityCompatibility;
 assert.equal(source,manifest.source,'Unreviewed Factory capability source');
 assert.equal(main,manifest.main,'Unreviewed Factory capability main');
 assert.equal(integration,manifest.integration,'Unreviewed Factory capability integration');
 const outputs=new Map();
 for(const [path,expected] of Object.entries(manifest.files)) {
  assert.equal(digest(readComposed(path)),expected.composedSha256,`Changed capability composition preimage: ${path}`);
  const bytes=read(source,path);
  assert.equal(digest(bytes),expected.sourceSha256,`Changed reviewed capability source: ${path}`);
  outputs.set(path,bytes);
 }
 const {path,runtime,before,after}=manifest.inventory;
 assert.equal(digest(readComposed(path)),manifest.inventory.composedSha256,'Changed capability inventory preimage');
 const sourceInventory=read(source,path);
 assert.equal(digest(sourceInventory),manifest.inventory.sourceSha256,'Changed reviewed capability inventory');
 const inventory=JSON.parse(readComposed(path)),canonical=JSON.parse(sourceInventory);
 assert.deepEqual(inventory.sources[runtime],before,'Changed capability runtime record');
 assert.deepEqual(canonical.sources[runtime],after,'Changed reviewed capability runtime record');
 assert.equal(after.classification,before.classification,'Changed capability runtime classification');
 assert.equal(digest(outputs.get(runtime)),after.sha256,'Changed capability runtime fingerprint');
 inventory.sources[runtime]=structuredClone(after);
 const inventoryBytes=JSON.stringify(inventory,null,2)+'\n';
 assert.equal(digest(inventoryBytes),manifest.inventory.sourceSha256,'Unexpected capability inventory delta');
 outputs.set(path,inventoryBytes);
 assert.deepEqual(JSON.parse(outputs.get('apps/cloud-control/src/source-identity.json')),manifest.identity,'Changed canonical generator identity');
 for(const [file,bytes] of outputs)put(file,bytes);
 return {source,main,integration,files:[...outputs.keys()],sourceDigest:manifest.identity.sourceDigest,scope:'NONPRODUCTION_EXACT_SERVER_BINDING_COMPATIBILITY_ONLY',installedBindings:'NOT_CONFIGURED',release:'HOLD'};
}
