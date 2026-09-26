import assert from 'node:assert/strict';
import {randomBytes,createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {Client,Pool} from 'pg';
import {loadMigrations,runMigrations} from '../scripts/migration-runner.ts';
import {WorkStore} from '../lib/engineering/store.ts';
import {EngineeringWorkerProjectionStore} from '../lib/engineering/worker-projection.ts';
import {currentTruthLines} from '../lib/engineering/current-truth-lines.ts';
const checkpoint=process.env.GAP2B_CHECKPOINT;
assert(checkpoint,'Provide a private retained checkpoint; this test never connects to the retained database.');
const admin=new Client({connectionString:'postgresql://postgres@127.0.0.1:55468/postgres'});
const name=`gap2b_projection_${randomBytes(8).toString('hex')}`;
await admin.connect();let pool;
try{
 await admin.query(`CREATE DATABASE ${name}`);
 const url=`postgresql://postgres@127.0.0.1:55468/${name}`;
 execFileSync('/opt/homebrew/opt/postgresql@17/bin/pg_restore',['--no-owner','--no-acl','--dbname',url,checkpoint]);
 const migration=new Client({connectionString:url});await migration.connect();
 try{await runMigrations({query:async(s,p)=>(await migration.query(s,p)).rows,transaction:async statements=>{await migration.query('BEGIN');try{for(const s of statements)await migration.query(s.sql,s.params);await migration.query('COMMIT');}catch(e){await migration.query('ROLLBACK');throw e;}}},await loadMigrations(),()=>{});}finally{await migration.end();}
 pool=new Pool({connectionString:url,options:'-c default_transaction_read_only=on'});
 const query=async(s,p)=>(await pool.query(s,p)).rows;
 const tables=(await query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).map(r=>r.tablename);
 async function snapshot(){const out={};for(const t of tables){const rows=await query(`SELECT to_jsonb(t)::text row FROM public."${t}" t ORDER BY to_jsonb(t)::text`);out[t]={count:rows.length,sha256:createHash('sha256').update(JSON.stringify(rows)).digest('hex')};}return out;}
 const before=await snapshot();
 const store=new WorkStore({scopeId:'authenticated-native-fixture',scopeKind:'personal',actorId:'authenticated-native-fixture'},{query});
 const {projection:p}=await new EngineeringWorkerProjectionStore(store,'auth-native-sofie').get('fb5a3dd2-e601-404c-8321-81f44ac2973d');
 assert.equal(p.runTruth.activeRun,null);assert.equal(p.runTruth.latestRun.id,'79120f67-1dde-4ebd-b37f-e7c439020192');
 assert.equal(p.runTruth.writerSession.productive,false);assert.equal(p.runTruth.writerSession.recordedId,'wrun_01M3FY7PXDPDH1W316X0TV69XM');
 assert.equal(p.verification.status,'FAIL');assert.equal(p.verification.evidenceCount,10);assert.equal(p.draft.revision,6);assert.equal(p.draft.differsFromCandidate,true);
 assert.equal(p.nativeResult.proof.outcome,'FAILED');assert.equal(p.readiness.ready,false);assert.equal(p.conversationRuntime.spentUsd,0.777654);assert.equal(p.conversationRuntime.reservedUsd,0);assert.equal(p.conversationRuntime.usageUnknown,false);
 assert.equal(p.conversationRuntime.status,'HISTORICAL_RECONCILIATION');
 assert.equal(currentTruthLines(p).some(line=>line.includes('Last Run: none')),false);
 assert.deepEqual(await snapshot(),before);
 console.log(JSON.stringify({status:'PASS',readOnly:true,unchangedTables:tables.length,latestRun:p.runTruth.latestRun,writer:p.runTruth.writerSession,verification:p.verification,draft:p.draft,budget:p.conversationRuntime}));
}finally{await pool?.end();await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);await admin.end();}
