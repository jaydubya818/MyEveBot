import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

const digest=value=>value===null?null:createHash('sha256').update(value).digest('hex');
export function replaceExactFixtureHunks(bytes,hunks,reverse=false) {
  for(const hunk of reverse?[...hunks].reverse():hunks) {
    const from=reverse?hunk.to:hunk.from,to=reverse?hunk.from:hunk.to;
    assert(from.length>0,'Empty fixture hunk');
    assert.equal(bytes.split(from).length,2,'Changed or ambiguous main fixture hunk');
    bytes=bytes.replace(from,to);
  }
  return bytes;
}

/** Explicit two-lineage proof: canonical fixture bytes plus pinned current-main changes. */
export function mainFixtureAdapter({main,manifest,read,readComposed}) {
  assert.equal(main,manifest.main,'Unreviewed fixture main source');
  const touched=[];
  function entry(path) {
    const expected=manifest.files?.[path];
    if(expected)assert.equal(digest(read(main,path)),expected.mainSha256,`Changed main fixture: ${path}`);
    return expected;
  }
  return {
    before(path,bytes) {
      const expected=entry(path);if(!expected)return bytes;
      assert.equal(digest(bytes),expected.composedSha256,`Changed main composed fixture: ${path}`);
      const baseline=replaceExactFixtureHunks(bytes,expected.preimageHunks,true);
      assert.equal(digest(baseline),expected.baselineSha256,`Changed main fixture baseline: ${path}`);
      return baseline;
    },
    after(path,bytes) {
      const expected=entry(path);if(!expected)return bytes;
      assert.equal(digest(bytes),expected.canonicalOutputSha256,`Changed canonical fixture output: ${path}`);
      const output=replaceExactFixtureHunks(bytes,expected.outputHunks);
      assert.equal(digest(output),expected.outputSha256,`Changed main fixture output: ${path}`);
      touched.push(path);return output;
    },
    inventory({path,file,current,canonical,before,after,integration,source}) {
      const expected=manifest.inventory?.records?.[file];if(!expected)return null;
      assert.equal(path,manifest.inventory.path,'Changed main inventory path');
      const upstream=JSON.parse(read(main,path)).sources[file];
      assert.deepEqual(upstream,expected.mainRecord,`Changed main producer record: ${file}`);
      assert.equal(digest(read(main,file)),expected.mainRecord.sha256,`Changed main producer source: ${file}`);
      assert.deepEqual(current,expected.composedRecord,`Changed combined producer record: ${file}`);
      assert.deepEqual(canonical,after,`Changed canonical fixture producer record: ${file}`);
      assert.equal(digest(read(integration,file)),after.sha256,`Changed integration producer source: ${file}`);
      assert.equal(digest(read(source,file)),after.sha256,`Changed canonical fixture producer source: ${file}`);
      assert.equal(digest(replaceExactFixtureHunks(read(integration,file),expected.runtimeMainHunks)),expected.outputRecord.sha256,`Changed combined producer union: ${file}`);
      assert.equal(digest(readComposed(file)),expected.outputRecord.sha256,`Changed combined producer source: ${file}`);
      assert.equal(expected.outputRecord.classification,before.classification,`Changed combined producer classification: ${file}`);
      assert.equal(expected.outputRecord.classification,upstream.classification,`Changed main producer classification: ${file}`);
      assert(expected.outputRecord.authorityBoundary.includes(after.authorityBoundary),'Missing canonical fixture review boundary');
      assert(expected.outputRecord.authorityBoundary.includes(upstream.authorityBoundary),'Missing main producer review boundary');
      touched.push(file);return structuredClone(expected.outputRecord);
    },
    provenance(){return {main,files:touched,scope:'EXACT_MAIN_AND_CANONICAL_FIXTURE_UNION'};},
  };
}
