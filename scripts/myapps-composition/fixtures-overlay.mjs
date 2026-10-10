import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {mainFixtureAdapter} from './fixture-main-overlay.mjs';

export const reviewedFixtures=JSON.parse(readFileSync(new URL('../../docs/myapps/phase3/fixture-sources.json',import.meta.url)));
const digest=value=>value===null?null:createHash('sha256').update(value).digest('hex');

/** Independently reviewed disposable test fixtures; no production pricing adoption. */
export function applyFixturesOverlay({name,integration,source,read,put,readComposed,main,mainManifest}) {
  const manifest=reviewedFixtures[name];
  assert(manifest,'Unknown fixture repository');
  assert.equal(integration,manifest.integration,'Unreviewed fixture integration');
  assert.equal(source,manifest.source,'Unreviewed fixture source');
  const mainAdapter=mainManifest?mainFixtureAdapter({main,manifest:mainManifest,read,readComposed}):null;
  const outputs=new Map();
  for(const [path,expected] of Object.entries(manifest.files)) {
    assert.equal(digest(mainAdapter?mainAdapter.before(path,readComposed(path)):readComposed(path)),expected.composedSha256,`Changed composed fixture: ${path}`);
    let bytes=read(source,path);
    assert.equal(digest(bytes),expected.sourceSha256,`Unreviewed fixture bytes: ${path}`);
    if(expected.preserveLedger) {
      const {from,to}=expected.preserveLedger;
      assert.equal(bytes.split(from).length,2,'Changed canonical migration assertion');
      assert(readComposed(path).includes(to),'Missing complete MyApps migration ledger assertion');
      bytes=bytes.replace(from,to);
    }
    assert.equal(digest(bytes),expected.outputSha256,`Changed fixture transformation: ${path}`);
    outputs.set(path,mainAdapter?mainAdapter.after(path,bytes):bytes);
  }
  const inventorySources=[];
  if(manifest.inventory) {
    const {path,records}=manifest.inventory;
    const composed=JSON.parse(readComposed(path)),canonical=JSON.parse(read(source,path));
    for(const [file,{before,after}] of Object.entries(records)) {
      const combined=mainAdapter?.inventory({path,file,current:composed.sources[file],canonical:canonical.sources[file],before,after,integration,source});
      if(combined){composed.sources[file]=combined;inventorySources.push(file);continue;}
      assert.deepEqual(composed.sources[file],before,`Changed producer record: ${file}`);
      assert.deepEqual(canonical.sources[file],after,`Unreviewed producer record: ${file}`);
      assert.equal(before.classification,after.classification,`Changed producer classification: ${file}`);
      assert.equal(digest(read(integration,file)),after.sha256,`Changed canonical producer source: ${file}`);
      assert.equal(digest(read(source,file)),after.sha256,`Changed fixture producer source: ${file}`);
      assert.equal(digest(readComposed(file)),after.sha256,`Changed composed producer source: ${file}`);
      composed.sources[file]=structuredClone(after);
      inventorySources.push(file);
    }
    outputs.set(path,JSON.stringify(composed,null,2)+'\n');
  }
  // Validate the complete bundle before publishing any output.
  for(const [path,bytes] of outputs)put(path,bytes);
  return {source,files:[...outputs.keys()],inventorySources,...(mainAdapter?{currentMain:mainAdapter.provenance()}:{}),scope:'DISPOSABLE_TEST_QUALIFICATION_ONLY'};
}
