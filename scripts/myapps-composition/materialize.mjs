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
import {applyGovernanceOverlay} from './governance-overlay.mjs';
import {applyFixturesOverlay} from './fixtures-overlay.mjs';
import {applyComposerOverlay} from './composer-overlay.mjs';
import {applyFactoryMain,factoryMainConflicts} from './factory-main.mjs';
import {applyFactoryCapabilityCompatibility} from './factory-capability-compatibility.mjs';
import {retainMainCatalog,retainMainInventory,verifyMainPreserved,verifyMainSource} from './current-main.mjs';
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
  git(repo,['merge-base','--is-ancestor',pins[name].main,head]);
  assert.equal(git(repo,['status','--porcelain','--untracked-files=no']), '', 'Preparation source must be committed and clean');
  const expected = name==='myeve' ? ['.github/workflows/ci.yml','.gitignore','apps/eve/lib/beta-integration/runtime.ts','apps/eve/lib/capability-registry.ts','apps/eve/scripts/executor-inventory.json','apps/eve/lib/database-schema.test.ts','apps/eve/lib/database-schema.ts','apps/eve/lib/engineering/production-validation-postgres.test.ts','apps/eve/vercel.json'].sort() : factoryMainConflicts;
  const attempt = spawnSync('git',['-C',repo,'merge-tree','--write-tree','--name-only',head,integration],{encoding:'utf8'});
  assert([0,1].includes(attempt.status),attempt.stderr);
  const sections=attempt.stdout.trimEnd().split('\n\n');
  const lines=sections[0].split('\n');const initialTree=lines.shift();
  assert.match(initialTree,/^[a-f0-9]{40}$/);
  assert.deepEqual(lines.sort(),expected,'Unreviewed source conflicts: stop and reconcile new pins');
  const temp=mkdtempSync(join(tmpdir(),'myapps-index-'));
  const env={...process.env,GIT_INDEX_FILE:join(temp,'index')};
  const indexGit=(args,options={})=>git(repo,args,{env,...options});
  const reconciledSources=new Map();
  const put=(path,content)=>{reconciledSources.set(path,content);const hash=git(repo,['hash-object','-w','--stdin'],{input:content});indexGit(['update-index','--add','--cacheinfo',`100644,${hash},${path}`]);};
  const read=(sha,path)=>{
    const result=spawnSync('git',['-C',repo,'show',`${sha}:${path}`],{encoding:'utf8',maxBuffer:32*1024*1024});
    if(result.status!==0){
      assert.equal(result.status,128,`Unable to inspect canonical source: ${path}`);
      assert(/does not exist in|exists on disk, but not in/.test(result.stderr),result.stderr);
      return null;
    }
    return result.stdout;
  };
  const readRaw=(sha,path)=>execFileSync('git',['-C',repo,'show',`${sha}:${path}`],{maxBuffer:32*1024*1024});
  const readComposed=(path)=>reconciledSources.get(path)??read(initialTree,path);
  const readComposedRaw=(path)=>reconciledSources.has(path)?Buffer.from(reconciledSources.get(path)):readRaw(initialTree,path);
  try {
    indexGit(['read-tree',initialTree]);
    if(name==='myeve') {
      verifyMainSource(pins.myeve.main,readRaw);
      // Keep canonical CI coverage, resolving only the exact companion-fixture pin.
      const ciPath='.github/workflows/ci.yml',factoryHead=git(factory,['rev-parse','HEAD']);
      assert(show(repo,head,ciPath).includes(`ref: ${factoryHead}`),'Factory preparation must match the CI fixture pin');
      const ciConflict=`<<<<<<< ${head}\n          ref: ${factoryHead}\n=======\n          ref: 388232c3053cdd3f55e9e309b72a9d9d95ded55f\n>>>>>>> ${integration}`;
      let ci=replacement(show(repo,initialTree,ciPath),ciConflict,`          ref: ${factoryHead}`);
      const serialComment='        # Separate test databases share cluster-wide roles; initialize those fixtures serially.\n        # Concurrency and race assertions inside each test file still run unchanged.\n';
      const left=serialComment+show(repo,head,ciPath).split(serialComment)[1].split('\n')[0];
      const right=show(repo,integration,ciPath).match(/          MYRELAY_SOURCE_ROOT:[\s\S]*?        run: npm exec --workspace apps\/eve -- vitest run[^\n]+/)[0];
      ci=replacement(ci,`<<<<<<< ${head}\n${left}\n=======\n${right}\n>>>>>>> ${integration}`,right.replace('        run:',serialComment+'        run:'));
      put(ciPath,ci);
      const deploymentPath='apps/eve/vercel.json';
      const canonicalDeployment=JSON.parse(show(repo,integration,deploymentPath));
      const preparedDeployment=JSON.parse(show(repo,head,deploymentPath));
      const disabled={...canonicalDeployment.git.deploymentEnabled,...preparedDeployment.git.deploymentEnabled};
      assert(Object.values(disabled).every(value=>value===false),'Deployment prevention must remain disabled');
      const withoutGit=value=>{const copy=structuredClone(value);delete copy.git;return copy;};
      assert.deepEqual(withoutGit(canonicalDeployment),withoutGit(preparedDeployment),'Unreviewed hosting configuration');
      canonicalDeployment.git.deploymentEnabled=disabled;
      put(deploymentPath,JSON.stringify(canonicalDeployment,null,2)+'\n');
      // Both inputs used a fixed last-migration name. Checkpoint 4 verifies
      // every applied name/checksum instead, without rewriting any migration.
      const validationPath='apps/eve/lib/engineering/production-validation-postgres.test.ts';
      const ledgerAssertion=`  // Verify the complete applied lineage, including checksums, on both paths.
  const expectedLedger=(await loadMigrations()).map(({name,checksum})=>({name,checksum}));
  for(const migrated of [pool,upgrade])
   expect((await migrated.query('SELECT name,checksum FROM sofie_schema_migrations ORDER BY name')).rows).toEqual(expectedLedger);`;
      const conflict=`<<<<<<< ${head}\n${ledgerAssertion}\n=======\n  expect((await pool.query('SELECT name FROM sofie_schema_migrations ORDER BY name DESC LIMIT 1')).rows[0].name).toBe('0090_external_alpha_terminal_settlement.sql');\n>>>>>>> ${integration}`;
      put(validationPath,replacement(show(repo,initialTree,validationPath),conflict,ledgerAssertion));
      const ignores=show(repo,integration,'.gitignore');
      assert(!ignores.includes('/output/playwright/myapps/'));
      put('.gitignore',ignores+'\n# Synthetic MyApps reference qualification output.\n/output/playwright/myapps/\n\n# Capability browser artifacts are uploaded separately by isolated CI.\n/output/playwright/capability-control/\n');
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
      features=replacement(features,'// ---- Pages (app/**/page.tsx)', 'add("EMAIL_CONNECTED_APPS", ["/api/myapps/[...path]", "/apps/installed"]);\nadd("ADMIN", ["/api/capability-control"]);\n\n// ---- Pages (app/**/page.tsx)');
      put('apps/eve/lib/external-alpha/features.ts',features);
      // Carry only the reviewed dormant catalog entry into canonical discovery;
      // preserve the integration's external-alpha filters and all other entries.
      const catalogPath='apps/eve/lib/capability-registry.ts';
      const preparationCatalog=show(repo,head,catalogPath);
      const digest=(source)=>createHash('sha256').update(source).digest('hex');
      const declaration=preparationCatalog.match(/^  tool\("installed_apps",[^\n]+\n/gm);
      assert.equal(declaration?.length,1,'Expected one reviewed MyApps catalog declaration');
      assert.equal(digest(declaration[0]),'04bab499e91a82c5faf79c2afc66995ad76ef1dd3bd72bb938357bca3d0fc0b9','Unreviewed MyApps declaration');
      const gate=preparationCatalog.match(/  \/\/ Packaging does not make[\s\S]*?\n  }\n/g);
      assert.equal(gate?.length,1,'Expected one disabled MyApps gate');
      assert.equal(digest(gate[0]),'bf7a86af305175d7a796f26ca6d2cd3226ca820d37e34c739be5751c8767dc6d','Unreviewed MyApps gate');
      let catalog=show(repo,integration,catalogPath);
      assert(!catalog.includes('tool("installed_apps"'));
      catalog=replacement(catalog,'  tool("engineering_work",',declaration[0]+'  tool("engineering_work",');
      catalog=replacement(catalog,'  // Discovery is gated; execution retains',gate[0]+'  // Discovery is gated; execution retains');
      catalog=retainMainCatalog({main:pins.myeve.main,read,readRaw,catalog,preparationCatalog});
      put(catalogPath,catalog);
      // Reconcile exact reviewed source metadata, never regenerate the full
      // inventory from arbitrary source. Unrelated canonical records stay intact.
      const inventoryPath='apps/eve/scripts/executor-inventory.json';
      const inventory=JSON.parse(show(repo,integration,inventoryPath));
      const governance=applyGovernanceOverlay({
        integration,source:pins.myeve.governance,inventory,put,read,readComposed,
      });
      evidence.governance=governance;
      const preparationInventory=JSON.parse(show(repo,head,inventoryPath));
      const newSources=['agent/tools/installed_apps.ts','lib/myapps/api.ts','lib/myapps/hosting.ts','lib/myapps/runtime.ts','lib/myapps/workflow.ts','app/api/myapps/[...path]/route.ts'];
      const transformedSources=['lib/database-schema.ts','lib/beta-integration/runtime.ts','lib/capability-registry.ts'];
      // The pinned integration carries stale historical fingerprints for three
      // of these files. Bind independently reviewed input bytes explicitly;
      // never use this reconciliation to refresh unrelated canonical records.
      assert.equal(integration,'afa65bd4c2d3ce26691a07132030cad1a1ef140e','Packaging reconciliation requires the independently reviewed canonical input');
      const reviewedCanonical={
        'lib/database-schema.ts':'ada47474a28dff53c2b570394f1b08d6e0e7edd250a83fea73b68c9b26ac4ead',
        'lib/beta-integration/runtime.ts':'b9967ef2646550deef25c98ec592df6313cddced39844af2f145bf3a3374e576',
        'lib/capability-registry.ts':'afda126015b8540a26572af2c2964b2d0cf3974aa0650c8e4c3bca8544b5cb0b',
        'lib/external-alpha/features.ts':'d1e209614b3abfaf17ec4e1224d435534bcc1efecf4247dc671920bbf4258979',
      };
      for(const file of [...newSources,...transformedSources]) {
        const entry=preparationInventory.executors[file];
        assert(entry && entry.reason.includes('Reviewed MyApps canonical packaging 2026-10-10:'),`Missing independent source classification: ${file}`);
        assert.equal(entry.sha256,digest(show(repo,head,'apps/eve/'+file)),`Stale preparation review: ${file}`);
        if(newSources.includes(file)) {
          assert(!inventory.executors[file],`Duplicate canonical source ownership: ${file}`);
          assert.equal(show(repo,initialTree,'apps/eve/'+file),show(repo,head,'apps/eve/'+file));
          assert.equal(show(repo,head,'apps/eve/'+file),show(repo,pins.myeve.phase2,'apps/eve/'+file),'Qualified lifecycle source must remain unchanged');
          inventory.executors[file]=entry;
        } else {
          const canonicalEntry=inventory.executors[file];
          assert.equal(canonicalEntry.classification,entry.classification);
          assert.equal(reviewedCanonical[file],digest(show(repo,integration,'apps/eve/'+file)),`Unreviewed canonical input: ${file}`);
          const source=reconciledSources.get('apps/eve/'+file);
          assert(source,`Missing exact composition transformation: ${file}`);
          if(canonicalEntry.sha256!==reviewedCanonical[file]) canonicalEntry.reason+=` Stale pinned canonical inventory fingerprint ${canonicalEntry.sha256} reconciled against independently reviewed source ${reviewedCanonical[file]}.`;
          canonicalEntry.sha256=digest(source);
          canonicalEntry.reason+=' Reviewed MyApps packaging composition: pinned canonical source plus the exact local inbox hook, migration catalog expectation, or disabled catalog metadata only; no accounting or activation change.';
        }
      }
      const featureEntry=inventory.executors['lib/external-alpha/features.ts'];
      assert.equal(reviewedCanonical['lib/external-alpha/features.ts'],digest(show(repo,integration,'apps/eve/lib/external-alpha/features.ts')));
      featureEntry.reason+=` Stale pinned canonical inventory fingerprint ${featureEntry.sha256} reconciled against independently reviewed source ${reviewedCanonical['lib/external-alpha/features.ts']}.`;
      featureEntry.sha256=digest(features);
      featureEntry.reason+=' MyApps composition adds both existing routes to the denied EMAIL_CONNECTED_APPS family and the current-main capability preference route to denied ADMIN; the allowlist is unchanged.';
      retainMainInventory({main:pins.myeve.main,read,readRaw,readComposed,inventory});
      put(inventoryPath,JSON.stringify(inventory,null,2)+'\n');
    }
    if(name==='myfactory')evidence.factoryCurrentMain=applyFactoryMain({main:pins.myfactory.main,head,integration,initialTree,read,readComposed,put});
    evidence.qualificationFixtures??={};
    const mainManifest=JSON.parse(readFileSync(new URL(`../../docs/myapps/phase3/${name==='myeve'?'myeve':'factory'}-main-fixture-sources.json`,import.meta.url)));
    evidence.qualificationFixtures[name]=applyFixturesOverlay({name,integration,source:pins[name].qualificationFixtures,main:pins[name].main,mainManifest,read,readComposed,put});
    if(name==='myfactory')evidence.factoryCapabilityCompatibility=applyFactoryCapabilityCompatibility({source:pins.myfactory.capabilityCompatibility,main:pins.myfactory.main,integration,read,readComposed,put});
    if(name==='myeve')evidence.composer=applyComposerOverlay({name,integration,source:pins.myeve.composer,read,readComposed,put});
    if(name==='myeve')evidence.currentMain=verifyMainPreserved({main:pins.myeve.main,readRaw,readComposedRaw});
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
  capabilityControlSql:['migration.sql','enforcement.sql','decisions.sql','ordering.sql','lifecycle.sql'].map(file=>fileRecord('myeve','docs/capability-control/'+file)),
  capabilityBinding:{ownerId:null,organizationId:null,installationId:null,agentId:null,environment:null,policyRevision:null,policyIdentity:null,backendEnrollment:null,backendIncarnation:null,recoveryWitness:null},
  capabilityTopology:{qualification:'NOT_QUALIFIED_FOR_INSTALLATION',sameTransactionRequired:true,lockOrder:null,lockOrderReview:'REQUIRED_WITH_FACTORY_ADVISORY_81427603_AND_CANONICAL_POLICY_AND_ACCOUNTING',historicalBindingBackfill:'FORBIDDEN',witnessReset:'FORBIDDEN'},
  lockfiles:['myeve','myfactory'].map(name=>({repository:name,...fileRecord(name,'package-lock.json')})),
  ordering:[
    'Verify exact approved non-alpha targets, current ledgers/checksums, roles and tested backups; reject missing identity.',
    'Qualify empty-target central accounting base then recovery SQL separately; existing-target upgrade requires an exact baseline and its own approval. Never apply base SQL over existing accounting history.',
    'Reconcile Factory migration ledger in manifest order without installation registration, production grants or source-identity reuse.',
    'Reconcile application migrations through 0092, then additive 0093; existing Phase2 0085 MyApps ledgers require a separately reviewed transfer.',
    'Capability qualification SQL is a separate additive source contract, never automatic application startup. Require exact same-transaction policy/Work topology, trusted enrollment and independently retained witness before any installation claim.',
    'Keep all execution disabled; qualify successor FactoryVersion, bootstrap, custody/signers, rollback and owner isolation before separate activation approval.'
  ],
  rollback:'Disable admission, fence in-flight Work, reconcile original UNKNOWN resources, retain data/evidence and restore compatible code. Never drop app tables or refund uncertain spend.',
  blockers:['Full composition and independent security gates must pass','Candidate dependency acceptance','Exact target and ledger identities','Successor FactoryVersion and configuration','Production bootstrap/admission/transport/custody/signers','Backup/restore and operational rollback','Exact capability bindings, same-transaction topology, monotonic recovery witness and reviewed lock ordering'],
  permissions:{merge:false,deploy:false,migrate:false,activate:false,paidExecution:false,productionGrants:false,externalAlphaChanges:false}
};
writeFileSync(join(output,'authorization-envelope.json'),JSON.stringify(envelope,null,2)+'\n');
console.log(JSON.stringify(evidence,null,2));
