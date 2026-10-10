/** Offline, pinned composition rehearsal. Never merges or updates branch refs.
 * Creates parentless snapshot commits and detached disposable worktrees only.
 * All source repositories and an absent output directory must be supplied explicitly.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
const [eve, factory, output] = process.argv.slice(2).map(p => resolve(p));
assert(eve && factory && output, 'Usage: materialize.mjs MYEVE_SOURCE MYFACTORY_SOURCE ABSENT_OUTPUT');
assert(!existsSync(output), 'Output must not exist; no checkout may be overwritten');
const pins = JSON.parse(readFileSync(new URL('../../docs/myapps/phase3/sources.json', import.meta.url)));
const git = (repo, args, options = {}) => execFileSync('git', ['-C', repo, ...args], {encoding:'utf8',maxBuffer:32*1024*1024,...options}).trimEnd();
const show = (repo, sha, path) => execFileSync('git',['-C',repo,'show',`${sha}:${path}`],{encoding:'utf8',maxBuffer:32*1024*1024});
const replacement = (text, from, to) => { assert.equal(text.split(from).length,2,`Expected one exact source anchor: ${from}`);return text.replace(from,to); };
const evidence = { format:pins.format, pins, snapshots:{}, production:'NOT_RUN', adoption:'NOT_AUTHORIZED' };
mkdirSync(output);
for (const [name, repo, integration] of [['myeve',eve,pins.myeve.ux],['myfactory',factory,pins.myfactory.engineering]]) {
  const head = git(repo,['rev-parse','HEAD']);
  git(repo,['merge-base','--is-ancestor',pins[name].phase2,head]);
  assert.equal(git(repo,['status','--porcelain','--untracked-files=no']), '', 'Preparation source must be committed and clean');
  const expected = name==='myeve' ? ['apps/eve/lib/beta-integration/runtime.ts','apps/eve/lib/database-schema.test.ts','apps/eve/lib/database-schema.ts'].sort() : [];
  const attempt = spawnSync('git',['-C',repo,'merge-tree','--write-tree','--name-only',head,integration],{encoding:'utf8'});
  assert([0,1].includes(attempt.status),attempt.stderr);
  const sections=attempt.stdout.trimEnd().split('\n\n');
  const lines=sections[0].split('\n');const initialTree=lines.shift();
  assert.match(initialTree,/^[a-f0-9]{40}$/);
  assert.deepEqual(lines.sort(),expected,'Unreviewed source conflicts: stop and reconcile new pins');
  const temp=mkdtempSync(join(tmpdir(),'myapps-index-'));
  const env={...process.env,GIT_INDEX_FILE:join(temp,'index')};
  const indexGit=(args,options={})=>git(repo,args,{env,...options});
  const put=(path,content)=>{const hash=git(repo,['hash-object','-w','--stdin'],{input:content});indexGit(['update-index','--add','--cacheinfo',`100644,${hash},${path}`]);};
  try {
    indexGit(['read-tree',initialTree]);
    if(name==='myeve') {
      const runtimePath='apps/eve/lib/beta-integration/runtime.ts';
      const phase2Runtime=show(repo,pins.myeve.phase2,runtimePath);
      const hook=phase2Runtime.slice(phase2Runtime.indexOf('        // Local-only MyApps'),phase2Runtime.indexOf('        if (r.workId && !r.goal) return new CanonicalBetaWork'));
      assert(hook.includes('consumeInstalledAppResponse'));
      const uxRuntime=show(repo,integration,runtimePath);
      put(runtimePath,replacement(uxRuntime,'        if (r.workId && !r.goal && r.action.id.startsWith("private-result:"))',hook+'        if (r.workId && !r.goal && r.action.id.startsWith("private-result:"))'));
      let schema=show(repo,integration,'apps/eve/lib/database-schema.ts');
      schema=replacement(schema,`CURRENT_DATABASE_MIGRATION = "${pins.migration.externalAlphaRequired}"`,`CURRENT_DATABASE_MIGRATION = "${pins.migration.rehearsal}"`);
      schema=replacement(schema,'if (env.MYEVE_EXTERNAL_ALPHA_POLICY) return CURRENT_DATABASE_MIGRATION;',`if (env.MYEVE_EXTERNAL_ALPHA_POLICY) return "${pins.migration.externalAlphaRequired}";`);
      put('apps/eve/lib/database-schema.ts',schema);
      let test=show(repo,integration,'apps/eve/lib/database-schema.test.ts');
      test=replacement(test,"MYEVE_EXTERNAL_ALPHA_POLICY:'{}'})).toBe(CURRENT_DATABASE_MIGRATION)",`MYEVE_EXTERNAL_ALPHA_POLICY:'{}'})).toBe('${pins.migration.externalAlphaRequired}')`);
      put('apps/eve/lib/database-schema.test.ts',test);
      indexGit(['update-index','--force-remove','apps/eve/migrations/'+pins.migration.original]);
      put('apps/eve/migrations/'+pins.migration.rehearsal,show(repo,pins.myeve.phase2,'apps/eve/migrations/'+pins.migration.original));
      // Classification is DENIED, never an extension of the external-alpha allowlist.
      let features=show(repo,integration,'apps/eve/lib/external-alpha/features.ts');
      features=replacement(features,'// ---- Pages (app/**/page.tsx)', 'add("EMAIL_CONNECTED_APPS", ["/api/myapps/[...path]", "/apps/installed"]);\n\n// ---- Pages (app/**/page.tsx)');
      put('apps/eve/lib/external-alpha/features.ts',features);
    }
    const tree=indexGit(['write-tree']);
    const snapshot=git(repo,['commit-tree',tree],{input:`MyApps offline composition rehearsal\nPreparation: ${head}\nIntegration snapshot: ${integration}\nNot an adopted release; no branch merge.\n`,env:{...process.env,GIT_AUTHOR_NAME:'MyApps Qualification',GIT_AUTHOR_EMAIL:'qualification@example.invalid',GIT_COMMITTER_NAME:'MyApps Qualification',GIT_COMMITTER_EMAIL:'qualification@example.invalid',GIT_AUTHOR_DATE:'2026-10-09T00:00:00Z',GIT_COMMITTER_DATE:'2026-10-09T00:00:00Z'}});
    const target=join(output,name);
    git(repo,['worktree','add','--no-checkout','--detach',target,snapshot]);
    // Historical browser evidence includes oversized archive fixtures. Keep the
    // complete Git tree identity but materialize only source; tests emit fresh evidence.
    git(target,['sparse-checkout','set','--no-cone','/*','!/output/']);
    git(target,['read-tree','-mu','HEAD']);
    evidence.snapshots[name]={preparation:head,integration,conflicts:expected,tree,snapshot,path:target};
  } finally {rmSync(temp,{recursive:true,force:true});}
}
writeFileSync(join(output,'composition.json'),JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify(evidence,null,2));
