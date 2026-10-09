import assert from 'node:assert/strict';
import {Client} from 'pg';
import {execFileSync} from 'node:child_process';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomBytes} from 'node:crypto';
import {loadMigrations,runMigrations} from '../../../apps/eve/scripts/migration-runner.ts';
const original='d64f2f96003818b2f51341b54a2edd6f426a0dae';
const dir=await mkdtemp(join(tmpdir(),'consolidation-main-migrations-'));
const names=execFileSync('git',['ls-tree','-r','--name-only',original,'apps/eve/migrations'],{encoding:'utf8'}).trim().split('\n');
for(const name of names)await writeFile(join(dir,name.split('/').at(-1)),execFileSync('git',['show',original+':'+name]));
const prior=await loadMigrations(pathToFileURL(dir+'/')),candidate=await loadMigrations();
const admin=new Client('postgresql://postgres@127.0.0.1:55489/postgres');await admin.connect();
const report={source:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),original,priorCount:prior.length,candidateCount:candidate.length,candidateHead:candidate.at(-1).name,checks:[]};
for(const upgrade of [false,true]){
 const name='consolidation_migration_'+randomBytes(5).toString('hex');await admin.query('CREATE DATABASE '+name);
 const c=new Client('postgresql://postgres@127.0.0.1:55489/'+name);await c.connect();
 const driver={query:async(s,p)=>(await c.query(s,p)).rows,transaction:async statements=>{await c.query('BEGIN');try{for(const s of statements)await c.query(s.sql,s.params);await c.query('COMMIT');}catch(e){await c.query('ROLLBACK');throw e;}}};
 try{
  if(!upgrade){await runMigrations(driver,candidate,()=>{});await runMigrations(driver,candidate,()=>{});report.checks.push({fresh:'PASS',replay:'PASS'});}
  else{
   await runMigrations(driver,prior,()=>{});
   await c.query("INSERT INTO app_settings(name,value) VALUES('consolidation-preserved-setting','keep')");
   const before=(await c.query('SELECT * FROM sofie_schema_migrations ORDER BY name')).rows;
   let failure;try{await runMigrations(driver,candidate,()=>{});}catch(e){failure=String(e);}
   assert(failure,'Expected the known unbridged main lineage to fail closed');
   assert.deepEqual((await c.query('SELECT * FROM sofie_schema_migrations ORDER BY name')).rows,before);
   assert.equal((await c.query("SELECT value FROM app_settings WHERE name='consolidation-preserved-setting'")).rows[0].value,'keep');
   report.checks.push({upgradeFromRemoteMain:'BLOCKED',error:failure,ledgerAndDataPreserved:true,required:'Forward bridge that preserves applied 0039_app_settings and 0040_relay_message_delegations; do not rewrite their checksums.'});
  }
 }finally{await c.end();await admin.query('DROP DATABASE '+name);}
}
await admin.end();await rm(dir,{recursive:true});
await writeFile(new URL('./migration-probe.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
