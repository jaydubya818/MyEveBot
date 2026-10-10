import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
export const reviewedBrowserRunner=JSON.parse(readFileSync(new URL('../../docs/myapps/phase3/browser-runner-source.json',import.meta.url)));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');

/** Resolve the frozen workspace CLI through the package's published bin contract. */
export function applyBrowserRunnerPackaging({source,read,readComposed,put}){
 const m=reviewedBrowserRunner;
 assert.equal(source,m.source,'Unreviewed browser runner source');
 const before=readComposed(m.path);
 for(const bytes of [read(source,m.path),before])assert.equal(hash(bytes),m.beforeSha256,'Changed browser runner preimage');
 let after=before;
 for(const hunk of m.hunks){
  assert.equal(after.split(hunk.from).length-1,hunk.occurrences??1,'Changed browser runner anchor');
  after=after.split(hunk.from).join(hunk.to);
 }
 assert.equal(hash(after),m.afterSha256,'Changed browser runner output');
 put(m.path,after);
 return {source,path:m.path,beforeSha256:m.beforeSha256,afterSha256:m.afterSha256,scope:m.scope,assertions:m.assertions};
}
