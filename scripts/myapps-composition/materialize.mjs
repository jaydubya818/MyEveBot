/** Offline, pinned composition rehearsal. Never merges or updates branch refs.
 * Creates parentless snapshot commits and detached disposable worktrees only.
 * All source repositories and an absent output directory must be supplied explicitly.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync, mkdtempSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
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
for (const [name, repo, integration] of [['myeve',eve,pins.myeve.integration],['myfactory',factory,pins.myfactory.integration]]) {
  const head = git(repo,['rev-parse','HEAD']);
  git(repo,['merge-base','--is-ancestor',pins[name].phase2,head]);
  assert.equal(git(repo,['status','--porcelain','--untracked-files=no']), '', 'Preparation source must be committed and clean');
  const expected = name==='myeve' ? ['.gitignore','apps/eve/lib/beta-integration/runtime.ts','apps/eve/lib/database-schema.test.ts','apps/eve/lib/database-schema.ts'].sort() : [];
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
      const ignores=show(repo,integration,'.gitignore');
      assert(!ignores.includes('/output/playwright/myapps/'));
      put('.gitignore',ignores+'\n# Synthetic MyApps reference qualification output.\n/output/playwright/myapps/\n');
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
const fileRecord=(name,path)=>({path,sha256:createHash('sha256').update(readFileSync(join(output,name,path))).digest('hex')});
const migrations=(name,path)=>readdirSync(join(output,name,path)).filter(file=>file.endsWith('.sql')).sort().map(file=>fileRecord(name,path+'/'+file));
const envelope={
  format:'myapps.production-authorization-draft.v1',executable:false,authorization:'NOT_GRANTED',readiness:'NOT_READY',
  sources:Object.fromEntries(Object.entries(evidence.snapshots).map(([name,{path,...identity}])=>[name,identity])),
  candidateAdoption:'NOT_AUTHORIZED',
  targets:{myeveProject:null,applicationDatabase:null,factoryInstallation:null,factoryDatabase:null,accountingDatabase:null,custodyStore:null},
  configuration:{factoryVersion:null,verifierPolicy:null,signerKeyIds:[],databaseRole:null,MYAPPS_LOCAL_INTEGRATION:'UNSET',productionGate:'DENIED'},
  applicationMigrations:migrations('myeve','apps/eve/migrations'),
  factoryMigrations:migrations('myfactory','apps/cloud-control/migrations'),
  centralAccountingSql:['shared-accounting.sql','shared-accounting-recovery.sql'].map(file=>fileRecord('myeve','apps/eve/lib/external-alpha/'+file)),
  lockfiles:['myeve','myfactory'].map(name=>({repository:name,...fileRecord(name,'package-lock.json')})),
  ordering:[
    'Verify exact approved non-alpha targets, current ledgers/checksums, roles and tested backups; reject missing identity.',
    'Qualify empty-target central accounting base then recovery SQL separately; existing-target upgrade requires an exact baseline and its own approval. Never apply base SQL over existing accounting history.',
    'Reconcile Factory migration ledger in manifest order without installation registration, production grants or source-identity reuse.',
    'Reconcile application migrations through 0092, then additive 0093; existing Phase2 0085 MyApps ledgers require a separately reviewed transfer.',
    'Keep all execution disabled; qualify successor FactoryVersion, bootstrap, custody/signers, rollback and owner isolation before separate activation approval.'
  ],
  rollback:'Disable admission, fence in-flight Work, reconcile original UNKNOWN resources, retain data/evidence and restore compatible code. Never drop app tables or refund uncertain spend.',
  blockers:['Full composition and independent security gates must pass','Candidate dependency acceptance','Exact target and ledger identities','Successor FactoryVersion and configuration','Production bootstrap/admission/transport/custody/signers','Backup/restore and operational rollback'],
  permissions:{merge:false,deploy:false,migrate:false,activate:false,paidExecution:false,productionGrants:false,externalAlphaChanges:false}
};
writeFileSync(join(output,'authorization-envelope.json'),JSON.stringify(envelope,null,2)+'\n');
console.log(JSON.stringify(evidence,null,2));
