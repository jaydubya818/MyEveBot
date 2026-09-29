import assert from 'node:assert/strict';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {Client} from 'pg';
import {loadMigrations,runMigrations} from '../scripts/migration-runner.ts';
import {adminURL,poolFor,fixture,golden} from './factory-receipt-fixture.mjs';
import {admitFactoryResult} from '../lib/engineering/factory-result-consumer.ts';
const admin=new Client({connectionString:adminURL});await admin.connect();
const name='q37_gatec_'+randomBytes(8).toString('hex');await admin.query('CREATE DATABASE '+name);
const pool=poolFor(adminURL.replace('/postgres','/'+name)),roles=[];let count=0;
const pass=label=>{count++;console.log('PASS '+label);};
const sha=x=>createHash('sha256').update(x).digest('hex');
const db={query:async(s,p)=>(await pool.query(s,p)).rows,transaction:async statements=>{
 const c=await pool.connect();try{await c.query('BEGIN');for(const s of statements)await c.query(s.sql,s.params);await c.query('COMMIT');}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}};
async function snapshot(includeLedger=true){
 const tables=(await pool.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows;
 const result={};for(const {tablename:t} of tables){if(!includeLedger&&t==='sofie_schema_migrations')continue;result[t]=(await pool.query('SELECT to_jsonb(t) row FROM "'+t+'" t ORDER BY to_jsonb(t)::text')).rows;}return result;
}
try {
 const migrations=(await loadMigrations()).slice(0,55);assert.equal(migrations.length,55);assert.equal(migrations.at(-1).name,'0055_engineering_factory_results.sql');
 assert.equal(migrations[52].checksum,'1f3fd2316758e547608fb4e23480105d1ce3a1dcb93a04a4c5be69841f2c5a53');
 assert.equal(migrations[53].checksum,'722f6b24052f53cda67da755011438ceacf65aa0dfc0579d5afde998f64a6634');
 assert.equal(migrations[54].checksum,'a431db228036cc6fd07128db861c99ee4add2de6afe43f1ec5a4c32b83df2141');
 await runMigrations(db,migrations.slice(0,54),()=>{});
 const f=await fixture(pool);const accepted=await admitFactoryResult(f.store,f.request.id,golden.result,{keys:async()=>golden.expected.keys});assert.equal(accepted.status,'ADMITTED');
 const before=await snapshot(),functionBefore=(await pool.query("SELECT pg_get_functiondef('engineering_factory_receipt(jsonb)'::regprocedure) definition")).rows[0].definition;
 await assert.rejects(runMigrations(db,[...migrations.slice(0,54),{...migrations[54],statements:[...migrations[54].statements,'SELECT integration_injected_failure()']}],()=>{}),/integration_injected_failure/);
 assert.deepEqual(await snapshot(),before);assert.equal((await pool.query("SELECT to_regclass('engineering_factory_results') value")).rows[0].value,null);
 pass('0055 injected failure rolls back every new object and ledger row; existing authenticated Gate C history unchanged');
 await runMigrations(db,migrations,()=>{});
 const after=await snapshot(false);for(const [table,rows] of Object.entries(before)){if(table!=='sofie_schema_migrations')assert.deepEqual(after[table],rows,table);}
 assert.equal((await pool.query("SELECT pg_get_functiondef('engineering_factory_receipt(jsonb)'::regprocedure) definition")).rows[0].definition,functionBefore);
 pass('populated 0054 to 0055 preserves all historical tables and the existing Gate C function');
 const stable=await snapshot();await runMigrations(db,migrations,()=>{});assert.deepEqual(await snapshot(),stable);pass('0055 rerun is an exact data/ledger no-op');
 const replay=await admitFactoryResult(f.store,f.request.id,golden.result,{keys:async()=>golden.expected.keys});assert.equal(replay.receiptId,accepted.receiptId);assert.equal(replay.factoryGrantedAuthority,0);assert.equal(replay.readiness,'NOT_READY');pass('qualified 0054 signed receipt replays unchanged after 0055');
 const data=()=>({receiptId:randomUUID(),scopeId:f.principal.scopeId,scopeKind:'personal',workId:f.binding.workId,workVersion:1,workGeneration:1,criteriaVersion:1,agentId:f.binding.agentId,factoryRequestId:randomUUID(),factoryId:'legacy-fixture',factorySourceCommit:'a'.repeat(40),factorySourceTree:'b'.repeat(40),factoryConfigurationDigest:sha('config'),workOrderId:randomUUID(),runId:randomUUID(),attemptNumber:1,producerStatus:'ready_for_review',protocolVersion:1,signingKeyId:'fixture',signingKeyVersion:'ed25519-v1',operationId:sha(randomUUID()),manifestDigest:sha('legacy-manifest'),candidateCommit:'c'.repeat(40),candidateTree:'d'.repeat(40),evidenceManifestDigest:sha('checks'),artifactManifestDigest:sha('artifacts'),signedEnvelope:'synthetic-sql-boundary-fixture',signedEnvelopeDigest:sha('synthetic-sql-boundary-fixture')});
 const call=async(fn,p,client=pool)=>(await client.query('SELECT '+fn+'($1::jsonb) value',[JSON.stringify(p)])).rows[0].value;
 const legacy=data(),results=await Promise.all(Array.from({length:6},()=>call('engineering_factory_receive',{...legacy,receiptId:randomUUID()})));
 assert(results.every(x=>x.receiptId===results[0].receiptId));pass('renumbered legacy SQL six concurrent exact deliveries create one receipt');
 const receiptId=results[0].receiptId,conflict=await call('engineering_factory_receive',{...legacy,receiptId:randomUUID(),manifestDigest:sha('different')});assert.equal(conflict.state,'CONFLICT');pass('legacy changed manifest retains explicit conflict without replacing first receipt');
 let expected='RECEIVED';for(const target of ['AUTHENTICATED','ATTESTED','INTEGRITY_VERIFIED','ADMITTED']){
  // A new connection resumes the stored stage; this tests SQL custody only,
  // never claims the incompatible legacy envelope is current-producer qualified.
  const c=await pool.connect();try{const output=await call('engineering_factory_advance',{scopeId:legacy.scopeId,scopeKind:'personal',workId:legacy.workId,receiptId,expected,target,proofDigest:legacy.signedEnvelopeDigest,trustStatus:'CURRENT'},c);assert.equal(output.state,target);}finally{c.release();}expected=target;
 }
 pass('renumbered legacy stage transitions resume from durable state');
 for(const kind of ['application','worker']){
  const role='dwi_'+kind+'_'+randomBytes(5).toString('hex');roles.push(role);await pool.query('CREATE ROLE '+role);
  const c=await pool.connect();try{
   await c.query('SET ROLE '+role);await assert.rejects(call('engineering_factory_receive',data(),c),e=>e.code==='42501');await c.query('RESET ROLE');
   await pool.query('GRANT EXECUTE ON FUNCTION engineering_factory_receive(jsonb),engineering_factory_advance(jsonb) TO '+role);
   await c.query('SET ROLE '+role);assert.equal((await call('engineering_factory_receive',data(),c)).state,'RECEIVED');
   for(const sql of ["UPDATE engineering_work SET version=version+1",'DELETE FROM engineering_factory_results','DELETE FROM engineering_factory_receipts','CREATE TABLE public.unapproved(id int)'])await assert.rejects(c.query(sql),e=>e.code==='42501');
   pass('restricted '+kind+' role: PUBLIC execute denied; explicit legacy function grant works; direct Work/receipt/DDL writes denied');
  }finally{await c.query('RESET ROLE');c.release();}
 }
 assert.equal((await pool.query('SELECT count(*)::int n FROM engineering_native_runtime')).rows[0].n,0);
 assert.equal((await pool.query('SELECT count(*)::int n FROM engineering_route_runs')).rows[0].n,0);
 assert.equal((await pool.query('SELECT count(*)::int n FROM engineering_work_model_budget')).rows[0].n,0);
 pass('legacy custody creates zero writers, Runs or budgets');
 const fresh='q37_gatec_'+randomBytes(8).toString('hex');await admin.query('CREATE DATABASE '+fresh);const c=new Client({connectionString:adminURL.replace('/postgres','/'+fresh)});await c.connect();
 try{await runMigrations({query:async(s,p)=>(await c.query(s,p)).rows,transaction:async ss=>{await c.query('BEGIN');try{for(const s of ss)await c.query(s.sql,s.params);await c.query('COMMIT');}catch(e){await c.query('ROLLBACK');throw e;}}},migrations,()=>{});assert.equal((await c.query('SELECT count(*)::int n FROM sofie_schema_migrations')).rows[0].n,55);pass('fresh complete 55 migration chain installs both disjoint schemas');}finally{await c.end();await admin.query('DROP DATABASE '+fresh);}
 console.log(JSON.stringify({checks:count,migration0055:'PASS',originalSQLBytesChanged:0,authorityViolations:0,falseReady:0,legacyProtocolQualification:'NOT_CLAIMED'}));
}finally{
 for(const role of roles){await pool.query('DROP OWNED BY '+role);await pool.query('DROP ROLE '+role);}
 await pool.end();await admin.query('DROP DATABASE '+name);await admin.end();
}
