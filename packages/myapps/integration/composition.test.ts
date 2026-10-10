import {test,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {execFileSync,spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {loadMigrations,runMigrations} from '../../../apps/eve/scripts/migration-runner.ts';
import {requiredDatabaseMigration} from '../../../apps/eve/lib/database-schema.ts';
import {localAppsAllowed} from '../../../apps/eve/lib/myapps/hosting.ts';
const composed=process.env.MYAPPS_COMPOSITION_REHEARSAL==='1';
const pins=JSON.parse(readFileSync(resolve('docs/myapps/phase3/sources.json'),'utf8'));
const source=(sha:string,path:string)=>execFileSync('git',['show',`${sha}:${path}`],{encoding:'utf8'});
test.skipIf(!composed)('composition preserves qualified app runtime and existing alpha authority bytes',async()=>{
 for(const path of ['runtime.ts','api.ts','workflow.ts','hosting.ts']){
  const name='apps/eve/lib/myapps/'+path;
  expect(readFileSync(name,'utf8')).toBe(source(pins.myeve.phase2,name));
 }
 for(const path of ['allowance-postgres.test.ts','policy.ts','allowance.ts','shared-accounting.ts','shared-accounting.sql','shared-accounting-recovery.sql','work-authority.ts','private-acceptance.ts','result-ingestion.ts','tool-authority.ts']){
  const name='apps/eve/lib/external-alpha/'+path;
  expect(readFileSync(name,'utf8')).toBe(source(pins.myeve.integration,name));
 }
 for(const branch of ['codex/myapps-phase3-readiness','codex/myapps-phase3b-reconciliation',pins.preparationBranch])
  expect(JSON.parse(readFileSync('apps/eve/vercel.json','utf8')).git.deploymentEnabled[branch]).toBe(false);
 expect(readFileSync('.gitignore','utf8')).toContain('/output/owner-ux/');
 expect(readFileSync('.gitignore','utf8')).toContain('/output/playwright/myapps/');
 const envelope=JSON.parse(readFileSync('../authorization-envelope.json','utf8'));
 expect(envelope.executable).toBe(false);expect(envelope.authorization).toBe('NOT_GRANTED');
 expect(Object.values(envelope.permissions).every(value=>value===false)).toBe(true);
 expect(Object.values(envelope.targets).every(value=>value===null)).toBe(true);
 const {externalAlphaIngress,externalAlphaCapabilityAllowed,ALLOWED_FAMILIES}=await import('../../../apps/eve/lib/external-alpha/features.ts');
 expect(ALLOWED_FAMILIES).not.toContain('MYAPPS');
 for(const method of ['GET','POST','PUT','DELETE'])for(const path of ['/apps/installed','/api/myapps/ui','/api/myapps/app','/api/myapps/agent','/api/myapps/unknown/deeper'])
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
  const migrations=await loadMigrations();expect(migrations.at(-1)?.name).toBe(pins.migration.rehearsal);
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
  expect((await pool.query("SELECT name FROM sofie_schema_migrations ORDER BY name DESC LIMIT 1")).rows[0].name).toBe(pins.migration.rehearsal);
 }finally{if(pool)await pool.end();await admin.query('DROP DATABASE IF EXISTS '+name+' WITH (FORCE)');await admin.end();}
});

test.skipIf(!composed)('combined Factory source cannot inherit the installed production source identity',()=>{
 const root=process.env.MYFACTORY_SOURCE_ROOT;expect(root).toBeTruthy();
 const check=spawnSync(process.execPath,['apps/cloud-control/scripts/cloud-source-identity.mjs'],{cwd:root,encoding:'utf8'});
 expect(check.status).toBe(1);
 expect(check.stderr).toContain('SOURCE_IDENTITY_CHANGED_REVIEW_AND_REPIN');
});
