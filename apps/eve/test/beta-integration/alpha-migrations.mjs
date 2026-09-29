import assert from 'node:assert/strict';
import {Client} from 'pg';
import {randomBytes,createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {loadMigrations,runMigrations} from '../../scripts/migration-runner.ts';
const prefix='postgresql://postgres@127.0.0.1:55489/';const admin=new Client(prefix+'postgres');await admin.connect();const name='myeve_beta_upgrade_'+randomBytes(5).toString('hex');await admin.query('CREATE DATABASE '+name);const c=new Client(prefix+name);await c.connect();
const driver={query:async(s,p)=>(await c.query(s,p)).rows,transaction:async ss=>{await c.query('BEGIN');try{for(const s of ss)await c.query(s.sql,s.params);await c.query('COMMIT');}catch(e){await c.query('ROLLBACK');throw e;}}};const checks=[];
try{
 const migrations=await loadMigrations();assert.equal(migrations.at(-1).name,'0067_capsule_canonical_memory.sql');
 for(const migration of migrations.slice(0,-1)){const old=execFileSync('git',['show','7f86aca:apps/eve/migrations/'+migration.name]);const current=await readFile('migrations/'+migration.name);assert.deepEqual(current,old);}
 checks.push('Every preserved migration through 0066 remains byte-identical to accepted 7f86aca');
 await runMigrations(driver,migrations.slice(0,-1),()=>{});
 await c.query("INSERT INTO memory_records(id,owner_id,scope_type,scope_id,content,provider) VALUES('upgrade-memory','upgrade-owner','owner','upgrade-owner','Preserved owner Memory','local')");
 const before=(await c.query('SELECT * FROM sofie_schema_migrations ORDER BY name')).rows;const memory=(await c.query('SELECT * FROM memory_records')).rows;
 const next=migrations.at(-1);await assert.rejects(runMigrations(driver,[...migrations.slice(0,-1),{...next,statements:[...next.statements,'SELECT alpha_injected_migration_failure()']}],()=>{}));
 assert.equal((await c.query("SELECT to_regclass('capsule_memory_policy') AS r")).rows[0].r,null);assert.deepEqual((await c.query('SELECT * FROM sofie_schema_migrations ORDER BY name')).rows,before);checks.push('0067 injected failure rolls back all DDL and leaves the ledger untouched');
 await runMigrations(driver,migrations,()=>{});await runMigrations(driver,migrations,()=>{});assert.deepEqual((await c.query('SELECT * FROM memory_records')).rows,memory);assert.deepEqual((await c.query('SELECT * FROM sofie_schema_migrations ORDER BY name')).rows.slice(0,-1),before);checks.push('Populated accepted-chain upgrade preserves Memory, prefix checksums and applied timestamps; no-op replay passes');
 await writeFile('../../docs/verification/beta-integration/alpha/migrations.json',JSON.stringify({status:'PASS',latest:next.name,count:migrations.length,checks},null,2)+'\n');console.log(checks.join('\n'));
}finally{await c.end();await admin.query('DROP DATABASE '+name);await admin.end();}
