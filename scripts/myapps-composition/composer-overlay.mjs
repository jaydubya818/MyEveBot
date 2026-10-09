import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';

export const reviewedComposer=JSON.parse(readFileSync(new URL('../../docs/myapps/phase3/composer-source.json',import.meta.url)));
const digest=value=>value===null?null:createHash('sha256').update(value).digest('hex');
function patch(text) {
  for(const {from,to} of reviewedComposer.changes) {
    assert.equal(text.split(from).length,2,'Composer patch anchor changed or duplicated');
    text=text.replace(from,to);
  }
  return text;
}

/** Apply only exact canonical focus hunks after the existing MyApps composition. */
export function applyComposerOverlay({name,integration,source,read,put,readComposed}) {
  const manifest=reviewedComposer;
  assert.equal(name,'myeve','Composer is owned by MyEve');
  assert.equal(integration,manifest.integration,'Unreviewed composer integration');
  assert.equal(source,manifest.source,'Unreviewed composer source');
  const base=read(manifest.base,manifest.path),canonical=read(source,manifest.path),composed=readComposed(manifest.path);
  assert.equal(digest(base),manifest.baseSha256,'Changed canonical composer base');
  assert.equal(digest(canonical),manifest.sourceSha256,'Changed canonical composer source');
  assert.equal(patch(base),canonical,'Patch differs from exact reviewed canonical correction');
  assert.equal(digest(composed),manifest.composedSha256,'Changed MyApps composer; reconcile lifecycle changes explicitly');
  const result=patch(composed);
  assert.equal(digest(result),manifest.outputSha256,'Unreviewed composed composer output');
  const outputs=new Map([[manifest.path,result]]);
  for(const [path,expected] of Object.entries(manifest.files)) {
    assert.equal(digest(readComposed(path)),expected.composedSha256,`Changed composed browser source: ${path}`);
    const bytes=read(source,path);
    assert.equal(digest(bytes),expected.sourceSha256,`Changed canonical browser source: ${path}`);
    outputs.set(path,bytes);
  }
  for(const [path,bytes] of outputs)put(path,bytes);
  return {source,base:manifest.base,files:[...outputs.keys()],method:'EXACT_CANONICAL_PATCH',outputSha256:manifest.outputSha256};
}
