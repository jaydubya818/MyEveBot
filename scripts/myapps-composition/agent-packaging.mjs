import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
export const reviewedAgentPackaging=JSON.parse(readFileSync(new URL('../../docs/myapps/phase3/agent-packaging-source.json',import.meta.url)));
const digest=source=>createHash('sha256').update(source).digest('hex');

/** Supported Eve package tracing only, after the unchanged canonical governance checks. */
export function applyAgentPackaging({integration,canonical,read,readComposed,inventory,put}) {
 const m=reviewedAgentPackaging;
 assert.equal(integration,m.integration,'Unreviewed agent packaging integration');
 assert.equal(canonical,m.canonical,'Unreviewed agent packaging source');
 for(const bytes of [read(integration,m.path),read(canonical,m.path),readComposed(m.path)])
  assert.equal(digest(bytes),m.beforeSha256,'Changed agent packaging preimage');
 const lock=JSON.parse(readComposed('package-lock.json')).packages['node_modules/'+m.dependency.name];
 assert.equal(lock.version,m.dependency.version,'Changed tokenizer version');
 assert.equal(lock.integrity,m.dependency.integrity,'Changed tokenizer integrity');
 assert.deepEqual(inventory.executors[m.inventory.path],m.inventory.before,'Changed canonical agent review');
 assert.equal(m.inventory.after.classification,m.inventory.before.classification);
 assert.equal(m.inventory.after.disposition,m.inventory.before.disposition);
 const before=readComposed(m.path);
 assert.equal(before.split(m.hunk.from).length,2,'Changed agent packaging anchor');
 const after=before.replace(m.hunk.from,m.hunk.to);
 assert.equal(digest(after),m.afterSha256,'Changed agent packaging output');
 assert.equal(m.inventory.after.sha256,m.afterSha256);
 put(m.path,after);
 inventory.executors[m.inventory.path]=structuredClone(m.inventory.after);
 return {canonical,path:m.path,beforeSha256:m.beforeSha256,afterSha256:m.afterSha256,dependency:m.dependency,scope:'SOURCE_PACKAGING_ONLY',executionAuthority:'UNCHANGED'};
}
