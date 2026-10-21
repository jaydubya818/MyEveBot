import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test, type TestContext } from 'node:test';
import { prepareTemplateTrace, templateTraceExcludes } from './template-build';
import { TEMPLATE_SOURCE_MANIFEST, templateSourceFiles, readTemplateSource } from './template-source';

async function fixture(t: TestContext) {
  const repo=await mkdtemp(path.join(tmpdir(),'builder-source-'));
  t.after(()=>rm(repo,{recursive:true,force:true}));
  const root=path.join(repo,'apps/eve');await mkdir(root,{recursive:true});
  const put=async(file:string)=>{await mkdir(path.dirname(path.join(root,file)),{recursive:true});await writeFile(path.join(root,file),'SYNTHETIC_FIXTURE_ONLY');};
  return {repo,root,put,git:(...args:string[])=>execFileSync('git',args,{cwd:repo,stdio:'pipe'})};
}

test('developer assembly excludes untracked files and nested local data, even when force tracked',async t=>{
  const {root,put,git}=await fixture(t);git('init','-q');
  for(const file of ['agent/agent.ts','lib/valid.ts','lib/.env.fixture','lib/output/evidence.txt','.local-computer/state','output/result'])await put(file);
  git('add','--all');
  await put('lib/untracked.ts');await put('lib/.env.untracked');
  assert.deepEqual(await templateSourceFiles(root),['agent/agent.ts','lib/valid.ts']);
  assert.equal((await readTemplateSource(root,'lib/valid.ts')).toString(),'SYNTHETIC_FIXTURE_ONLY');
});

test('sealed traced bundle preserves tracked source without Git and rejects changed bytes',async t=>{
  const {repo,root,put,git}=await fixture(t);git('init','-q');
  for(const file of ['agent/agent.ts','lib/valid.ts','package.json','.eve-template-release'])await put(file);
  git('add','--all');
  const files=await prepareTemplateTrace(root);
  assert.deepEqual(files,['.eve-template-release','agent/agent.ts','lib/valid.ts','package.json',TEMPLATE_SOURCE_MANIFEST]);
  await rm(path.join(repo,'.git'),{recursive:true});
  for(const file of ['lib/.env.fixture','lib/private-custody.json','agent/output/evidence','lib/.local-computer/state','output/result','unreviewed.txt'])await put(file);
  assert.deepEqual(await templateSourceFiles(root),files.slice(0,-1));
  assert.equal((await readTemplateSource(root,'lib/valid.ts')).toString(),'SYNTHETIC_FIXTURE_ONLY');
  await assert.rejects(readTemplateSource(root,'lib/private-custody.json'),/inventory mismatch/);
  await writeFile(path.join(root,'lib/valid.ts'),'SYNTHETIC_CHANGED');
  await assert.rejects(readTemplateSource(root,'lib/valid.ts'),/inventory mismatch/);
});

test('a bundle cannot use missing, malformed or unsafe provenance',async t=>{
  const {root,put}=await fixture(t);await put('lib/untracked.ts');
  await assert.rejects(templateSourceFiles(root));
  for(const value of [{format:'unknown',files:{}},{format:'myeve.builder-source.v1',files:{'../outside':'a'.repeat(64)}},{format:'myeve.builder-source.v1',files:{'lib/.env.fixture':'a'.repeat(64)}},{format:'myeve.builder-source.v1',files:{'lib/untracked.ts':'invalid'}}]){
    await writeFile(path.join(root,TEMPLATE_SOURCE_MANIFEST),JSON.stringify(value));
    await assert.rejects(templateSourceFiles(root),/Invalid Builder source inventory/);
  }
  await assert.rejects(prepareTemplateTrace(root),/requires tracked template source/);
});

test('broken checkout metadata never falls back to a bundle filesystem walk',async t=>{
  const {repo,root,put}=await fixture(t);await put('lib/untracked.ts');await writeFile(path.join(repo,'.git'),'invalid metadata');
  await assert.rejects(templateSourceFiles(root));
});

test('tracked deletion and symlink substitution fail closed at read time',async t=>{
  const {repo,root,put,git}=await fixture(t);git('init','-q');await put('lib/source.ts');git('add','--all');
  await rm(path.join(root,'lib/source.ts'));await assert.rejects(readTemplateSource(root,'lib/source.ts'));
  await writeFile(path.join(repo,'synthetic.txt'),'SYNTHETIC_OUTSIDE');
  await symlink(path.join(repo,'synthetic.txt'),path.join(root,'lib/source.ts'));
  await assert.rejects(readTemplateSource(root,'lib/source.ts'),/Invalid template source/);
  await rm(path.join(root,'lib'),{recursive:true});await symlink(repo,path.join(root,'lib'));
  await assert.rejects(readTemplateSource(root,'lib/synthetic.txt'),/Invalid template source/);
});

test('invalid and excluded paths cannot be read through the template reader',async t=>{
  const {root,put}=await fixture(t);await put('lib/.env.fixture');
  for(const file of ['../synthetic','/synthetic','lib/../synthetic','lib\\synthetic','lib//synthetic','lib/.env.fixture'])await assert.rejects(readTemplateSource(root,file),/Invalid template source/);
});

test('a symlinked template root cannot substitute outside source',async t=>{
  const {repo,root}=await fixture(t);const outside=path.join(repo,'outside');await mkdir(outside);
  await writeFile(path.join(outside,'package.json'),'SYNTHETIC_OUTSIDE');
  await rm(root,{recursive:true});await symlink(outside,root);
  await assert.rejects(templateSourceFiles(root),/Invalid template source root/);
  await assert.rejects(readTemplateSource(root,'package.json'),/Invalid template source root/);
});

test('build exclusions close ordinary untracked files and whole unrelated directories',async t=>{
  const {root,put}=await fixture(t);
  for(const file of ['lib/valid.ts','lib/private-custody.json','lib/nested/untracked.txt','output/fixture.txt'])await put(file);
  assert.deepEqual(await templateTraceExcludes(root,['lib/valid.ts']),['../eve/lib/nested/**','../eve/lib/private-custody.json','../eve/output/**']);
});
