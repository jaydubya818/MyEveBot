import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';

export const reviewedMain=JSON.parse(readFileSync(new URL('../../docs/myapps/phase3/current-main-source.json',import.meta.url)));
const digest=value=>value===null?null:createHash('sha256').update(value).digest('hex');

export function verifyMainSource(main,readRaw) {
  assert.equal(main,reviewedMain.main,'Unreviewed current main');
  for(const [path,{sourceSha256}] of Object.entries(reviewedMain.files))
    assert.equal(digest(readRaw(main,path)),sourceSha256,`Changed current-main source: ${path}`);
}

/** Preserve canonical preference declarations; this does not alter availability. */
export function retainMainCatalog({main,read,readRaw,catalog,preparationCatalog}) {
  verifyMainSource(main,readRaw);
  const {path,anchor,added}=reviewedMain.catalog;
  assert.equal(read(main,path).replace(added,''),read(reviewedMain.previousMain,path),'Changed canonical catalog delta');
  assert.equal(preparationCatalog.split(added).length,2,'Missing current-main declarations in preparation');
  assert(!catalog.includes(added),'Duplicate current-main declarations');
  assert.equal(catalog.split(anchor).length,2,'Changed canonical catalog anchor');
  return catalog.replace(anchor,added+anchor);
}

/** Exact main-owned classifications only; preserve all unrelated canonical records. */
export function retainMainInventory({main,read,readRaw,readComposed,inventory}) {
  verifyMainSource(main,readRaw);
  const canonical=JSON.parse(read(main,'apps/eve/scripts/executor-inventory.json'));
  const entries=new Map();
  for(const [path,{after}] of Object.entries(reviewedMain.inventory)) {
    assert.deepEqual(canonical.executors[path],after,`Changed main record: ${path}`);
    const existing=inventory.executors[path];
    if(existing)assert.equal(existing.classification,after.classification,`Main classification conflict: ${path}`);
    if(path===reviewedMain.catalog.path.replace('apps/eve/','')) {
      assert(existing,'Missing transformed catalog record');
      assert.equal(existing.sha256,digest(readComposed('apps/eve/'+path)));
      entries.set(path,{...existing,reason:existing.reason+' Current-main owner preference declarations preserved: '+after.reason});
    } else {
      assert.equal(readComposed('apps/eve/'+path),read(main,'apps/eve/'+path),`Lost current-main runtime: ${path}`);
      assert.equal(after.sha256,digest(readComposed('apps/eve/'+path)),`Stale current-main classification: ${path}`);
      entries.set(path,structuredClone(after));
    }
  }
  for(const [path,entry] of entries)inventory.executors[path]=entry;
}

/** Bind every upstream changed path, including exact reviewed reconciliations. */
export function verifyPackagingPreserved(readComposedRaw) {
  for(const [path,sha256] of Object.entries(reviewedMain.packaging.files))
    assert.equal(digest(readComposedRaw(path)),sha256,`Changed reviewed standalone packaging source: ${path}`);
  return reviewedMain.packaging;
}

export function verifyMainPreserved({main,readRaw,readComposedRaw}) {
  verifyMainSource(main,readRaw);
  const mismatches=[];
  for(const [path,{outputSha256}] of Object.entries(reviewedMain.files)) {
    const actual=digest(readComposedRaw(path));
    if(!/^[a-f0-9]{64}$/.test(outputSha256??'')||actual!==outputSha256)
      mismatches.push({path,expected:outputSha256,actual});
  }
  assert.deepEqual(mismatches,[],'Current-main output changed or unqualified reconciliation');
  const packaging=verifyPackagingPreserved(readComposedRaw);
  return {source:main,previousMain:reviewedMain.previousMain,files:Object.keys(reviewedMain.files),packaging,scope:'EXACT_CURRENT_MAIN_PRESERVATION'};
}
