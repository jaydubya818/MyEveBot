import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { applyDependencyPatches } from './apply-dependency-patches.mjs';
const hash = text => createHash('sha256').update(text).digest('hex');
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'reviewed-patches-')), packages = {};
  await mkdir(join(root, 'patches'));
  for (const [name, version, manifest] of [['sprintf-js', '1.1.3', 'sprintf-js-1.1.3.json'], ['eve', '0.66.3', 'eve-node-esm-compat.json']]) {
    const directory = join(root, 'node_modules', name), original = `original-${name}`, fixed = `reviewed-${name}`;
    await mkdir(directory, { recursive: true }); await writeFile(join(directory, 'package.json'), JSON.stringify({ name, version }));
    await writeFile(join(directory, 'module.js'), original); await writeFile(join(root, 'patches', name+'.js'), fixed);
    await writeFile(join(root, 'patches', manifest), JSON.stringify({ package:name, version, replacement:`patches/${name}.js`, patchedSha256:hash(fixed), files:[{path:'module.js',upstreamSha256:hash(original)}] }));
    packages[`node_modules/${name}`] = {version};
  }
  await writeFile(join(root, 'package-lock.json'), JSON.stringify({packages})); return root;
}
test('check does not write; reviewed application is idempotent', async () => {
  const root = await fixture();
  try {
    await assert.rejects(applyDependencyPatches({root,check:true}), /Unapplied/);
    await applyDependencyPatches({root}); await applyDependencyPatches({root});
    assert.equal((await applyDependencyPatches({root,check:true})).length,2);
    assert.equal(await readFile(join(root,'node_modules/eve/module.js'),'utf8'),'reviewed-eve');
  } finally {await rm(root,{recursive:true,force:true});}
});
test('unknown SDK bytes or version fail before any package is patched', async () => {
  for (const changed of ['bytes','version']) {
    const root = await fixture();
    try {
      if(changed==='bytes')await writeFile(join(root,'node_modules/eve/module.js'),'unreviewed');
      else await writeFile(join(root,'node_modules/eve/package.json'),JSON.stringify({name:'eve',version:'0.70.1'}));
      await assert.rejects(applyDependencyPatches({root}), /Unexpected dependency bytes|identity mismatch/);
      assert.equal(await readFile(join(root,'node_modules/sprintf-js/module.js'),'utf8'),'original-sprintf-js');
    } finally {await rm(root,{recursive:true,force:true});}
  }
});
test('a dependency symlink outside the workspace cannot redirect a write', async () => {
  const root = await fixture(), outside = await mkdtemp(join(tmpdir(),'outside-package-'));
  try {
    await rm(join(root,'node_modules/eve'),{recursive:true});await symlink(outside,join(root,'node_modules/eve'));
    await assert.rejects(applyDependencyPatches({root}), /escaped workspace/);
    assert.equal(await readFile(join(root,'node_modules/sprintf-js/module.js'),'utf8'),'original-sprintf-js');
  } finally {await rm(root,{recursive:true,force:true});await rm(outside,{recursive:true,force:true});}
});
