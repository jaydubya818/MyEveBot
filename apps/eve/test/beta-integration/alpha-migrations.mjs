import {betaTestPort} from './test-postgres.mjs';
import assert from 'node:assert/strict';
import {Client} from 'pg';
import {randomBytes,createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {loadMigrations,runMigrations} from '../../scripts/migration-runner.ts';
const prefix=`postgresql://postgres@127.0.0.1:${betaTestPort}/`;const admin=new Client(prefix+'postgres');await admin.connect();const name='myeve_beta_upgrade_'+randomBytes(5).toString('hex');await admin.query('CREATE DATABASE '+name);const c=new Client(prefix+name);await c.connect();
const driver={query:async(s,p)=>(await c.query(s,p)).rows,transaction:async ss=>{await c.query('BEGIN');try{for(const s of ss)await c.query(s.sql,s.params);await c.query('COMMIT');}catch(e){await c.query('ROLLBACK');throw e;}}};const checks=[];
try{
 const migrations=await loadMigrations();const prefix=migrations.filter(m=>m.name<'0068');const bridge=migrations.find(m=>m.name.startsWith('0068_'));assert(bridge);
 for(const migration of prefix){const old=execFileSync('git',['show','9ef5a95:apps/eve/migrations/'+migration.name]);const current=await readFile('migrations/'+migration.name);assert.deepEqual(current,old);}
 checks.push('Every preserved migration through 0067 remains byte-identical to accepted 9ef5a95');
 await runMigrations(driver,prefix,()=>{});
 await c.query("INSERT INTO memory_records(id,owner_id,scope_type,scope_id,content,provider) VALUES('upgrade-memory','upgrade-owner','owner','upgrade-owner','Preserved owner Memory','local')");
 const before=(await c.query('SELECT * FROM sofie_schema_migrations ORDER BY name')).rows;const memory=(await c.query('SELECT * FROM memory_records')).rows;
 const next=bridge;await assert.rejects(runMigrations(driver,[...prefix,{...next,statements:[...next.statements,'SELECT alpha_injected_migration_failure()']}],()=>{}));
 assert.equal((await c.query("SELECT to_regclass('sofie_published_main_bridge') AS r")).rows[0].r,null);assert.deepEqual((await c.query('SELECT * FROM sofie_schema_migrations ORDER BY name')).rows,before);checks.push('0068 injected failure rolls back all DDL and leaves the ledger untouched');
 await runMigrations(driver,migrations,()=>{});await runMigrations(driver,migrations,()=>{});assert.deepEqual((await c.query('SELECT * FROM memory_records')).rows,memory);assert.deepEqual((await c.query('SELECT * FROM sofie_schema_migrations ORDER BY name')).rows.slice(0,before.length),before);checks.push('Populated accepted-chain upgrade preserves Memory, prefix checksums and applied timestamps; no-op replay passes');
 await writeFile(`../../docs/verification/beta-integration/${process.env.MYEVE_BETA_EVIDENCE_PHASE ?? "alpha"}/migrations.json`,JSON.stringify({status:'PASS',latest:migrations.at(-1).name,count:migrations.length,checks},null,2)+'\n');console.log(checks.join('\n'));
}finally{await c.end();await admin.query('DROP DATABASE '+name);await admin.end();}
