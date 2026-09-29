import {Client,Pool} from 'pg';
import {randomBytes,createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {loadMigrations,runMigrations} from '../scripts/migration-runner.ts';
const adminURL='postgresql://postgres@127.0.0.1:55468/postgres';
const admin=new Client({connectionString:adminURL});await admin.connect();
const migrations=await loadMigrations();assert.equal(migrations.length,52);
assert.equal(migrations[50].checksum,'49806249a1b105cda3724372d9bc9b6afd66d1292e5c461eccbb31581a094fce');
for(const mode of ['fresh','checkpoint']){
 const name=`gap2_migration_${randomBytes(6).toString('hex')}`;let pool;
 try{
  await admin.query(`CREATE DATABASE ${name}`);const url=new URL(adminURL);url.pathname=`/${name}`;
  if(mode==='checkpoint')execFileSync('/opt/homebrew/opt/postgresql@17/bin/pg_restore',['--no-owner','--no-acl','--dbname',url.href,'/private/tmp/gap2-retained-0051-checkpoint.dump']);
  pool=new Pool({connectionString:url.href});const client=await pool.connect();
  const db={query:async(s,p)=>(await client.query(s,p)).rows,transaction:async statements=>{await client.query('BEGIN');try{for(const s of statements)await client.query(s.sql,s.params);await client.query('COMMIT');}catch(e){await client.query('ROLLBACK');throw e;}}};
  const tables=mode==='checkpoint'?(await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename<>'sofie_schema_migrations' ORDER BY tablename")).rows.map(x=>x.tablename):[];
  async function hashes(){const out={};for(const table of tables){const rows=(await client.query(`SELECT to_jsonb(t)::text AS row FROM public."${table}" t ORDER BY to_jsonb(t)::text`)).rows;out[table]={count:rows.length,hash:createHash('sha256').update(JSON.stringify(rows)).digest('hex')};}return out;}
  const before=await hashes();await runMigrations(db,migrations,()=>{});await runMigrations(db,migrations,()=>{});const after=await hashes();assert.deepEqual(after,before);
  assert.equal((await client.query('SELECT count(*)::int n FROM sofie_schema_migrations')).rows[0].n,52);
  assert.equal((await client.query("SELECT checksum FROM sofie_schema_migrations WHERE name LIKE '0051%'")).rows[0].checksum,migrations[50].checksum);
  const constraints=(await client.query("SELECT count(*)::int n FROM pg_constraint WHERE conrelid='engineering_work_model_calls'::regclass")).rows[0].n;assert(constraints>=10);
  console.log(JSON.stringify({mode,status:'PASS',historicalTablesPreserved:tables.length,constraints,applied0051Checksum:migrations[50].checksum,checkpointHash:mode==='checkpoint'?createHash('sha256').update(await readFile('/private/tmp/gap2-retained-0051-checkpoint.dump')).digest('hex'):null}));
  client.release();
 }finally{await pool?.end();await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);}
}
await admin.end();
