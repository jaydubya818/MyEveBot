import {test,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {execFileSync,spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {randomUUID,createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {loadMigrations,runMigrations} from '../../../apps/eve/scripts/migration-runner.ts';
import {requiredDatabaseMigration} from '../../../apps/eve/lib/database-schema.ts';
import {localAppsAllowed} from '../../../apps/eve/lib/myapps/hosting.ts';
import {dropIdleCompositionDatabase} from './composition-database-cleanup.ts';
const composed=process.env.MYAPPS_COMPOSITION_REHEARSAL==='1';
const pins=JSON.parse(readFileSync(resolve('docs/myapps/phase3/sources.json'),'utf8'));
const unified=JSON.parse(readFileSync(resolve('docs/myapps/unified-source-successors.json'),'utf8'));
const terminalPointer=JSON.parse(readFileSync(resolve('docs/myapps/terminal-source-qualification-current.json'),'utf8'));
const terminal=JSON.parse(readFileSync(resolve(terminalPointer.record),'utf8'));
import {factory as selectedFactory} from '../../../scripts/myapps-composition/current-pins.mjs';
const source=(sha:string,path:string)=>execFileSync('git',['show',`${sha}:${path}`],{encoding:'utf8'});
test.skipIf(!composed)('composition preserves historical bytes except explicitly pinned unified successors',async()=>{
 expect(unified.myapps).toBe('e907feb1bd026aaa9015fcc26e3e72a6af9e9c05');
 expect(unified.previousMyapps).toBe('ab331cd5b7785632e7c0539ef16aab4338222b31');
 expect(unified.missionControlAuthority).toBe('053751d5aa065c396bf0fdec6a67fd0259e8431c');
 expect(unified.myappsFiles).toEqual(['runtime.ts','hosting.ts']);
 expect(unified.authorityFiles).toEqual(['work-authority.ts']);
 expect(unified.signedPatchScope).toBe('3bec42136d5050ba639ea399e7d304d234265575');
 expect(unified.reviewedExternalAlphaSuccessors).toEqual({
  'apps/eve/lib/external-alpha/shared-accounting.ts':{source:'931487c4db417321c7382285096fd27eaf378558',sha256:'730dd19b733ba4f46a97d3b616530281fd18ad4e4c9ceee2b44e72cb06cd992a',review:'docs/verification/2026-10-23-beta-feedback-review.md'},
  'apps/eve/lib/external-alpha/tool-authority.ts':{source:'65ef3063c88d47956f7b419b4bb3733a79a99f6a',sha256:'c3502cfef60044fcad91bd2daa11d31aedba4aa705323a5466b8e402d4d2acd4',review:'docs/verification/2026-10-23-chat-only-security-review.md'},
 });
 for(const path of ['runtime.ts','api.ts','workflow.ts','hosting.ts']){
  const name='apps/eve/lib/myapps/'+path;
  expect(readFileSync(name,'utf8')).toBe(source(unified.myappsFiles.includes(path)?unified.myapps:pins.myeve.phase2,name));
 }
 for(const path of ['allowance-postgres.test.ts','policy.ts','allowance.ts','shared-accounting.ts','shared-accounting.sql','shared-accounting-recovery.sql','private-acceptance.ts','result-ingestion.ts','tool-authority.ts']){
  const name='apps/eve/lib/external-alpha/'+path;
  // Only exact immutable reviewed successors replace historical bytes. This
  // retains stronger chat-only denials and the qualified read-only usage path.
  const successor=unified.reviewedExternalAlphaSuccessors[name];
  const actual=readFileSync(name,'utf8');
  expect(actual).toBe(source(successor?.source??(path==='result-ingestion.ts'?unified.signedPatchScope:pins.myeve.integration),name));
  if(successor)expect(createHash('sha256').update(actual).digest('hex')).toBe(successor.sha256);
 }
 // The explicit successor changes pre-dispatch refusal handling and adds the
 // central zero-gap upgrade. Compare both against canonical bytes, not the
 // candidate's own receipt, while preserving every original authority check.
 expect(pins.myeve.externalAlphaSuccessor).toBe('4cceb253d21f28b17f645bd88d90a6b764ddc073');
 for(const path of ['work-authority.ts','shared-accounting-zero-gap.sql']){
  const name='apps/eve/lib/external-alpha/'+path;
  expect(readFileSync(name,'utf8')).toBe(source(unified.authorityFiles.includes(path)?unified.missionControlAuthority:pins.myeve.externalAlphaSuccessor,name));
 }
 for(const branch of ['codex/myapps-phase3-readiness','codex/myapps-phase3b-reconciliation',pins.preparationBranch])
  expect(JSON.parse(readFileSync('apps/eve/vercel.json','utf8')).git.deploymentEnabled[branch]).toBe(false);
 expect(readFileSync('.gitignore','utf8')).toContain('/output/owner-ux/');
 expect(readFileSync('.gitignore','utf8')).toContain('/output/playwright/myapps/');
 const envelope=JSON.parse(readFileSync('../authorization-envelope.json','utf8'));
 expect(envelope.executable).toBe(false);expect(envelope.authorization).toBe('NOT_GRANTED');
 expect(Object.values(envelope.permissions).every(value=>value===false)).toBe(true);
 expect(Object.values(envelope.targets).every(value=>value===null)).toBe(true);
 const zeroGapPath='apps/eve/lib/external-alpha/shared-accounting-zero-gap.sql';
 expect(envelope.centralAccountingSql).toContainEqual({path:zeroGapPath,sha256:createHash('sha256').update(readFileSync(zeroGapPath)).digest('hex')});
 expect(Object.values(envelope.capabilityBinding).every(value=>value===null)).toBe(true);
 expect(envelope.capabilityTopology).toMatchObject({qualification:'NOT_QUALIFIED_FOR_INSTALLATION',nativeAdmissionTransactionRequired:true,lockOrder:null,historicalBindingBackfill:'FORBIDDEN',witnessReset:'FORBIDDEN'});
 expect(envelope.capabilityControlSql).toHaveLength(5);
 expect(envelope.capabilityControlSql.map((sql:{path:string})=>sql.path).sort()).toEqual(['decisions.sql','enforcement.sql','lifecycle.sql','migration.sql','ordering.sql'].map(file=>'docs/capability-control/'+file));
 for(const sql of envelope.capabilityControlSql)expect(sql.sha256).toBe(createHash('sha256').update(source(pins.myeve.main,sql.path)).digest('hex'));
 const {externalAlphaIngress,externalAlphaCapabilityAllowed,ALLOWED_FAMILIES}=await import('../../../apps/eve/lib/external-alpha/features.ts');
 expect(ALLOWED_FAMILIES).not.toContain('MYAPPS');
 for(const method of ['GET','HEAD','POST','PUT','DELETE','CONNECT','OPTIONS','TRACE','PATCH'])for(const path of ['/apps/installed','/api/myapps/ui','/api/myapps/app','/api/myapps/agent','/api/myapps/unknown/deeper','/api/capability-control'])
  expect(externalAlphaIngress(path,method,{EVE_PROJECT_NAME:'myeve-alpha-tester-1'} as any)?.allowed).toBe(false);
 expect(externalAlphaCapabilityAllowed('tool.installed_apps')).toBe(false);
 expect(requiredDatabaseMigration({MYEVE_EXTERNAL_ALPHA_POLICY:'{}'} as any)).toBe(pins.migration.externalAlphaRequired);
 const env={...process.env};
 try {process.env.NODE_ENV='production';process.env.MYAPPS_LOCAL_INTEGRATION='1';expect(localAppsAllowed()).toBe(false);}
 finally {if(env.NODE_ENV===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=env.NODE_ENV;if(env.MYAPPS_LOCAL_INTEGRATION===undefined)delete process.env.MYAPPS_LOCAL_INTEGRATION;else process.env.MYAPPS_LOCAL_INTEGRATION=env.MYAPPS_LOCAL_INTEGRATION;}
});
test.skipIf(!composed)('real PostgreSQL upgrades canonical UX schema without activating policy or changing Work',async()=>{
 const connection=process.env.MYAPPS_POSTGRES_URL;
 expect(connection,'Composition database qualification must not silently skip').toBeTruthy();
 const url=new URL(connection!);expect(['localhost','127.0.0.1']).toContain(url.hostname);
 const pg=createRequire(import.meta.url)('pg'),admin=new pg.Pool({connectionString:connection});
 const name='myapps_composition_'+randomUUID().replaceAll('-','');let pool:any;
 try{
  await admin.query('CREATE DATABASE '+name);url.pathname='/'+name;pool=new pg.Pool({connectionString:url.href});
  const db={query:async(s:string,p?:any[])=>(await pool.query(s,p)).rows,transaction:async(statements:any[])=>{
   const c=await pool.connect();try{await c.query('BEGIN');for(const s of statements)await c.query(s.sql,s.params);await c.query('COMMIT');}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
  }};
  const migrations=await loadMigrations();expect(unified.migration).toBe('0105_myapps_execution_admission.sql');expect(terminal.historicalMigration).toBe(unified.migration);expect(terminal.previousTerminalMigration).toBe('0109_external_alpha_chat_only.sql');expect(terminal.currentMigration).toBe('0109_external_alpha_chat_only.sql');expect(migrations.at(-1)?.name).toBe(terminal.currentMigration);
  expect(new Set(migrations.map(m=>m.name.slice(0,4))).size).toBe(migrations.length);
  await runMigrations(db as any,migrations.slice(0,-1),()=>{});
  const {WorkStore}=await import('../../../apps/eve/lib/engineering/store.ts');
  const owner=randomUUID(),store=new WorkStore({scopeId:owner,scopeKind:'personal',actorId:owner},db);
  const work=await store.create({title:'Preserve existing Work',objective:'No new execution',repository:'synthetic/composition',criteria:[{id:randomUUID(),statement:'Retain canonical Work',method:'test'}],maxCostUsd:0.01,maxDurationSeconds:60,idempotencyKey:randomUUID()});
  const before=await store.get(work.work.id);
  const beforeHistory=(await pool.query('SELECT * FROM sofie_schema_migrations ORDER BY name')).rows;
  await runMigrations(db as any,migrations,()=>{});await runMigrations(db as any,migrations,()=>{});
  expect(await store.get(work.work.id)).toEqual(before);
  const afterHistory=(await pool.query('SELECT * FROM sofie_schema_migrations ORDER BY name')).rows;
  expect(afterHistory.slice(0,-1)).toEqual(beforeHistory);
  for(const table of ['myapps_installations','myapps_admissions','myapps_candidates','external_alpha_policy','external_alpha_allowance','external_alpha_operation','external_alpha_work_authority','engineering_factory_requests','engineering_candidate_publications'])
   expect((await pool.query('SELECT count(*) n FROM '+table)).rows[0].n).toBe('0');
  expect((await pool.query("SELECT name FROM sofie_schema_migrations ORDER BY name DESC LIMIT 1")).rows[0].name).toBe(terminal.currentMigration);
 }finally{
  try{if(pool)await pool.end();await dropIdleCompositionDatabase(admin,name);}
  finally{await admin.end();}
 }
});

test.skipIf(!composed)('combined Factory source cannot inherit the installed production source identity',()=>{
 expect(terminalPointer).toEqual({schema:'myapps-terminal-source-pointer/v1',record:'docs/myapps/terminal-source-qualification-20261023-relay-f05a5639.json',previousRecord:'docs/myapps/terminal-source-qualification-20261023-factory-39b68666.json',historicalRecord:'docs/myapps/terminal-source-qualification-20261012.json',authority:'ISOLATED_SOURCE_QUALIFICATION_ONLY'});
 expect(terminal.previousQualificationRecord).toBe(terminalPointer.previousRecord);
 expect(terminal.previousQualificationSha256).toBe('59b7aab9379b07dbdcac20c14a8fd0a81a62d3b366792a2167e40e728b685cd6');
 const factoryQualificationBytes=readFileSync(terminalPointer.previousRecord),factoryQualification=JSON.parse(factoryQualificationBytes.toString());
 expect(createHash('sha256').update(factoryQualificationBytes).digest('hex')).toBe(terminal.previousQualificationSha256);
 expect(terminal.relaySource).toBe('f05a5639e2f95994778753e6021603ca5a1777fb');
 expect(terminal.relayTree).toBe('7ab5ce216f82a3ef6272ed349a1f1730cc3bbdb9');
 expect(terminal.relayQualificationScope).toBe('EXACT_SOURCE_AND_OFFICIAL_CI_FOR_NONDEPLOYING_PEER_ADOPTION_ONLY');
 expect(factoryQualification.factorySource).toBe(terminal.factorySource);
 expect(factoryQualification.factorySourcePredecessor).toBe(terminal.factorySourcePredecessor);
 expect(factoryQualification.currentMigration).toBe(terminal.currentMigration);
 expect(factoryQualification.previousQualificationRecord).toBe('docs/myapps/terminal-source-qualification-20261023.json');
 expect(factoryQualification.previousQualificationSha256).toBe('157a63ba940d85db8d385a1b136e3617ba7bfdcddc6a2a049b3c1390148e145e');
 const previousBytes=readFileSync(factoryQualification.previousQualificationRecord),previous=JSON.parse(previousBytes.toString());
 expect(createHash('sha256').update(previousBytes).digest('hex')).toBe(factoryQualification.previousQualificationSha256);
 expect(terminal.factorySourcePredecessor).toBe(previous.factorySource);
 expect(previous.factorySource).toBe('c5416e65f786f8f9abf14692a984b5a176271b67');
 expect(previous.previousTerminalMigration).toBe('0107_factory_preparation_generation_guard.sql');
 expect(previous.currentMigration).toBe(terminal.previousTerminalMigration);
 expect(previous.previousQualificationRecord).toBe(terminalPointer.historicalRecord);
 expect(previous.previousQualificationSha256).toBe('d1ce504eaad779ad7df41ecb5a20aff76542498db308bd4818f9550c369ea023');
 expect(createHash('sha256').update(readFileSync(terminalPointer.historicalRecord)).digest('hex')).toBe(previous.previousQualificationSha256);
 expect(terminal.installedAuthority).toBe('NONE');expect(terminal.productionIntegration).toBe('NOT_RUN');
 const root=process.env.MYFACTORY_SOURCE_ROOT;expect(root).toBeTruthy();
 const check=spawnSync(process.execPath,['apps/cloud-control/scripts/cloud-source-identity.mjs'],{cwd:root,encoding:'utf8'});
 expect(check.status,check.stderr).toBe(0);
 expect(terminal.authority).toBe('ISOLATED_SOURCE_QUALIFICATION_ONLY');
 expect(terminal.factorySource).toBe(selectedFactory);
 expect(execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim()).toBe(selectedFactory);
 expect(execFileSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'}).trim()).toBe('');
 const selectedRecord=execFileSync('git',['show',`${selectedFactory}:${terminal.factoryRecord}`],{cwd:root,encoding:'utf8'});
 expect(terminal.factoryRecord).toBe('docs/capability-control/source-identity-20261023/qa-remediation-undici-advisory-successor.json');
 expect(createHash('sha256').update(selectedRecord).digest('hex')).toBe(terminal.factoryRecordSha256);
 expect(readFileSync(resolve(root!,terminal.factoryRecord),'utf8')).toBe(selectedRecord);
 const successor=JSON.parse(selectedRecord);
 expect(successor.sourceDigest).toBe(terminal.sourceDigest);expect(successor.factoryVersion).toBe(terminal.factoryVersion);
 expect(successor.configurationDigest).toBe(terminal.configurationDigest);
 expect(successor.executionContractSha256).toBe(terminal.executionContractSha256);
 expect(terminal.externalAlphaFactoryVersion).toBe(successor.externalAlphaFactoryVersion);
 expect(terminal.factoryVersionScope).toBe('SOURCE_RECORD_ONLY; no installed identity or execution authority is inherited');
 expect(successor.authority).toBe('ISOLATED_SOURCE_QUALIFICATION_ONLY');
 expect(JSON.parse(check.stdout).sourceDigest).toBe(successor.sourceDigest);
 expect(successor.sourceDigest).not.toBe(successor.predecessorSourceDigest);
 // A self-consistent identity is not a grant. Run the canonical exact-current
 // positive control and historical source/contract rejection cases unchanged.
 const factoryAdapter=JSON.parse(readFileSync(resolve('docs/myapps/phase3/factory-capability-compatibility.json'),'utf8'));
 expect(factoryAdapter.source).toBe(pins.myfactory.capabilityCompatibility);
 const identityPath='apps/cloud-control/test/source-identity-qualification.test.mjs';
 // Historical fixture provenance remains bound to its original Git object.
 expect(createHash('sha256').update(execFileSync('git',['show',`${factoryAdapter.source}:${identityPath}`],{cwd:root})).digest('hex')).toBe(factoryAdapter.files[identityPath].sourceSha256);
 const currentIdentity=execFileSync('git',['show',`${selectedFactory}:${identityPath}`],{cwd:root});
 expect(readFileSync(resolve(root!,identityPath))).toEqual(currentIdentity);
 expect(createHash('sha256').update(currentIdentity).digest('hex')).toBe(terminal.factoryIdentityTestSha256);
 expect(terminal.factoryIdentityTestCount).toBe(3);
 const grants=spawnSync(process.execPath,['--test','--test-reporter=tap','apps/cloud-control/test/source-identity-qualification.test.mjs'],{cwd:root,encoding:'utf8'});
 expect(grants.status,grants.stderr+grants.stdout).toBe(0);
 expect(grants.stdout).toContain('coherent historical source or contract grants cannot consume successor authority');
 expect(grants.stdout).toMatch(/# pass 3\b/);
 expect(grants.stdout).toMatch(/# fail 0\b/);
 expect(grants.stdout).toMatch(/# skipped 0\b/);
});
