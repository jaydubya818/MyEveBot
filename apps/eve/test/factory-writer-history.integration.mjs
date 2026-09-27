import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash,randomBytes} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {Client} from 'pg';
import {loadMigrations,runMigrations} from '../scripts/migration-runner.ts';

// Read an offline retained checkpoint only; restore into a new task-owned database.
// Never connect to or alter the retained fixture's database or dump.
const dump=process.env.GATE_B_HISTORICAL_DUMP;
assert(dump,'GATE_B_HISTORICAL_DUMP must identify the offline qualified checkpoint');
const bytes=await readFile(dump),hash=createHash('sha256').update(bytes).digest('hex');
const admin=new Client('postgresql://postgres@127.0.0.1:55479/postgres');await admin.connect();
const name='gateb_history_'+randomBytes(8).toString('hex');await admin.query('CREATE DATABASE '+name);
const client=new Client('postgresql://postgres@127.0.0.1:55479/'+name);await client.connect();
try {
 execFileSync('/opt/homebrew/opt/postgresql@17/bin/pg_restore',['--no-owner','--no-acl','--exit-on-error','--host=127.0.0.1','--port=55479','--username=postgres','--dbname='+name,dump],{stdio:'pipe'});
 const db={query:async(s,p)=>(await client.query(s,p)).rows,transaction:async statements=>{await client.query('BEGIN');try{for(const s of statements)await client.query(s.sql,s.params);await client.query('COMMIT');}catch(e){await client.query('ROLLBACK');throw e;}}};
 const migrations=await loadMigrations();await runMigrations(db,migrations.slice(0,55),()=>{});
 const tables=['engineering_work','engineering_routing_decisions','engineering_route_runs','engineering_native_runtime','engineering_direct_workspaces','engineering_direct_verification_jobs','engineering_native_results','engineering_work_model_calls'];
 const rows={},columns={};
 for(const t of tables){columns[t]=(await client.query('SELECT column_name FROM information_schema.columns WHERE table_schema=\'public\' AND table_name=$1 ORDER BY ordinal_position',[t])).rows.map(r=>r.column_name);rows[t]=(await client.query('SELECT to_jsonb(t) row FROM '+t+' t ORDER BY to_jsonb(t)::text')).rows;}
 assert(rows.engineering_route_runs.length>0);assert(rows.engineering_native_runtime.length>0);assert(rows.engineering_direct_workspaces[0].row.candidates.length>0);assert(rows.engineering_direct_workspaces[0].row.evidence.length>0);
 await runMigrations(db,migrations,()=>{});
 for(const t of tables){const after=(await client.query('SELECT to_jsonb(t) row FROM (SELECT '+columns[t].map(c=>'"'+c+'"').join(',')+' FROM '+t+') t ORDER BY to_jsonb(t)::text')).rows;assert.deepEqual(after,rows[t],t);}
 assert.equal((await client.query('SELECT count(*)::int n FROM engineering_route_runs WHERE writer_generation IS NULL OR writer_generation<1')).rows[0].n,0);
 assert.equal((await client.query('SELECT count(*)::int n FROM engineering_route_runs WHERE factory_request_id IS NOT NULL OR factory_candidate IS NOT NULL')).rows[0].n,0);
 assert.equal(createHash('sha256').update(await readFile(dump)).digest('hex'),hash);
 const report={status:'PASS',checkpointSha256:hash,checkpointModified:false,migrationChecksum:migrations[55].checksum,preservedRows:Object.fromEntries(tables.map(t=>[t,rows[t].length])),oldColumnsChanged:0,factoryAuthorityAdded:0};
 if(process.env.GATE_B_HISTORY_EVIDENCE)await writeFile(process.env.GATE_B_HISTORY_EVIDENCE,JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report,null,2));
}finally{await client.end();await admin.query('DROP DATABASE '+name+' WITH (FORCE)');await admin.end();}
