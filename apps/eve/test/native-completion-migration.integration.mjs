import assert from 'node:assert/strict';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {Client} from 'pg';
import {loadMigrations,runMigrations} from '../scripts/migration-runner.ts';
import {WorkStore} from '../lib/engineering/store.ts';
import {digest} from '../lib/engineering/contract.ts';

// Never accepts the retained database as a destination. Only the approved
// quiescent checkpoint is read, then restored into newly created local clones.
const checkpoint=process.env.GAP2B_CHECKPOINT;
assert(checkpoint,'GAP2B_CHECKPOINT must identify the approved offline checkpoint.');
const adminURL='postgresql://postgres@127.0.0.1:55468/postgres';
const bin='/opt/homebrew/opt/postgresql@17/bin/';
const migrations=await loadMigrations();
assert.equal(migrations.length,53);
assert.equal(migrations[50].checksum,'49806249a1b105cda3724372d9bc9b6afd66d1292e5c461eccbb31581a094fce');
assert.equal(migrations[51].checksum,'a6958d75de012f257c5a4378cd2828b422806f776bc9462689077a93dd9fe106');
const hash=value=>createHash('sha256').update(value).digest('hex');
const checkpointHash=hash(await readFile(checkpoint));
const admin=new Client({connectionString:adminURL});await admin.connect();
function database(client){return {query:async(sql,params)=>(await client.query(sql,params)).rows,
 transaction:async statements=>{await client.query('BEGIN');try{for(const s of statements)await client.query(s.sql,s.params);await client.query('COMMIT');}catch(error){await client.query('ROLLBACK');throw error;}}};}
async function snapshot(client,includeLedger=false){
 const tables=(await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map(r=>r.tablename).filter(t=>includeLedger||t!=='sofie_schema_migrations');
 const result={};for(const table of tables){const identifier='"'+table.replaceAll('"','""')+'"';
  const rows=(await client.query(`SELECT to_jsonb(t)::text row FROM public.${identifier} t ORDER BY to_jsonb(t)::text`)).rows;
  result[table]={count:rows.length,sha256:hash(JSON.stringify(rows))};}
 return result;
}
function schema(url){return hash(execFileSync(bin+'pg_dump',['--schema-only','--no-owner','--no-acl','--dbname',url],{encoding:'utf8'}).split('\n').filter(line=>!line.startsWith('\\restrict ')&&!line.startsWith('\\unrestrict ')).join('\n'));}
async function authorityCounts(client){return (await client.query(`SELECT
 (SELECT count(*)::int FROM engineering_work_model_budget) budgets,
 (SELECT count(*)::int FROM engineering_work_model_calls) calls,
 (SELECT count(*)::int FROM engineering_native_runtime) writers,
 (SELECT count(*)::int FROM engineering_route_runs) runs,
 (SELECT count(*)::int FROM engineering_routing_decisions WHERE admission_authority_snapshot ? 'completion') completions`)).rows[0];}
async function requestFixture(client,label){
 const owner='migration-'+label+'-'+randomBytes(4).toString('hex'),agent=owner+'-sofie';
 await client.query(`INSERT INTO agents(id,owner_id,name,slug,role,instructions,is_primary,status,max_estimated_cost_usd,max_runtime_seconds,max_steps)
 VALUES($1,$2,'Sofie','sofie','engineer','Synthetic migration fixture',true,'active',1.3,3600,30)`,[agent,owner]);
 const store=new WorkStore({scopeId:owner,scopeKind:'personal',actorId:owner},database(client));
 const {work}=await store.create({title:'Migration qualification',objective:'Preserve exact local accounting.',repository:'fixture/parser',criteria:[{id:randomUUID(),statement:'Preserve accounting',method:'test'}],maxCostUsd:1.3,maxDurationSeconds:3600,idempotencyKey:randomUUID()});
 const revision=(await client.query('SELECT updated_at::text revision FROM agents WHERE id=$1',[agent])).rows[0].revision;
 return {id:randomUUID(),token:randomUUID(),scope:owner,actor:owner,work:work.id,version:work.version,generation:work.generation,
  agent,agentRevision:revision,policyHash:digest({label}),policyVersion:1,budgetVersion:1,ceiling:1300000,deadline:new Date(Date.now()+3600000).toISOString(),maxCalls:30,
  session:label,step:label+':0',request:digest({label,work:work.id}),purpose:'CONVERSATION_REASONING',provider:'vercel-gateway/anthropic',model:'anthropic/claude-sonnet-5',exposure:70000,
  pricing:{input:'0.000002',output:'0.000010',cachedInputTokens:'0.0000002',cacheCreationInputTokens:'0.0000025'},bounds:{inputBytes:5000,maxOutputTokens:2048}};
}
async function reserve(client,p){return (await client.query('SELECT engineering_model_reserve($1::jsonb) receipt',[JSON.stringify(p)])).rows[0].receipt;}
async function transition(client,p,operation,extra={}){return (await client.query('SELECT engineering_model_transition($1::jsonb) receipt',[JSON.stringify({id:p.id,token:p.token,scope:p.scope,actor:p.actor,request:p.request,policyHash:p.policyHash,operation,...extra})])).rows[0].receipt;}
async function settle(client,p){const result={content:[{type:'text',text:'Controlled local receipt'}]};await transition(client,p,'dispatch');await transition(client,p,'retain',{result,resultHash:digest(result),receipt:{microUsd:1000},semantics:'INCREMENTAL'});await transition(client,p,'reconcile',{actual:1000,note:'Local exact-call receipt'});}
async function restrictedRoles(client){
 for(const kind of ['application','worker']){
  const role='gap2b_'+kind+'_'+randomBytes(5).toString('hex');const p=await requestFixture(client,kind);
  await client.query(`CREATE ROLE ${role} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE`);
  try{
   await client.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
   await client.query(`GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${role}`);
   await client.query(`GRANT EXECUTE ON FUNCTION engineering_model_reserve(jsonb),engineering_model_transition(jsonb),engineering_completion_remaining(text,uuid) TO ${role}`);
   await client.query(`SET ROLE ${role}`);
   assert.equal((await client.query('SELECT current_user role')).rows[0].role,role);
   await reserve(client,p);await settle(client,p);
   assert.equal((await reserve(client,p)).status,'RECONCILED');
   assert.equal(Number((await client.query('SELECT engineering_completion_remaining($1,$2) held',[p.scope,p.work])).rows[0].held),0);
   // Admission/dispatch triggers ran under the restricted role's normal ledger
   // function path. Direct economic writes and DDL remain unavailable.
   await assert.rejects(client.query('UPDATE engineering_work_model_budget SET spent_microusd=0'),/permission denied/);
   await assert.rejects(client.query('DELETE FROM engineering_work_model_calls'),/permission denied/);
   await assert.rejects(client.query('ALTER TABLE engineering_work_model_calls DISABLE TRIGGER ALL'),/must be owner|permission denied/);
   const b=(await client.query('SELECT spent_microusd,reserved_microusd FROM engineering_work_model_budget WHERE work_id=$1',[p.work])).rows[0];
   assert.equal(Number(b.spent_microusd),1000);assert.equal(Number(b.reserved_microusd),0);
   console.log(JSON.stringify({gate:'restricted-'+kind,status:'PASS',scope:'canonical conversation reserve/dispatch/reconcile through 0053 triggers; replay; direct economic writes and DDL denied'}));
  }finally{await client.query('RESET ROLE');await client.query(`DROP OWNED BY ${role}`);await client.query(`DROP ROLE ${role}`);}
 }
}
try{
 for(const mode of ['fresh','populated-0052','checkpoint-clone']){
  const name='gap2b_migration_'+randomBytes(8).toString('hex');let client;
  try{
   await admin.query('CREATE DATABASE '+name);const url='postgresql://postgres@127.0.0.1:55468/'+name;
   if(mode==='checkpoint-clone')execFileSync(bin+'pg_restore',['--no-owner','--no-acl','--dbname',url,checkpoint],{stdio:'pipe'});
   client=new Client({connectionString:url});await client.connect();const db=database(client);
   let before,authorityBefore;
   if(mode==='fresh'){
    await runMigrations(db,migrations,()=>{});
    assert.deepEqual(await authorityCounts(client),{budgets:0,calls:0,writers:0,runs:0,completions:0});
   }else{
    const restored=mode==='checkpoint-clone'?await snapshot(client):null;
    await runMigrations(db,migrations.slice(0,52),()=>{});
    if(restored){const after52=await snapshot(client);for(const [table,value] of Object.entries(restored))assert.deepEqual(after52[table],value,'0052 clone preservation '+table);}
    if(mode==='populated-0052'){
     const p=await requestFixture(client,'populated');await reserve(client,p);await settle(client,p);
     const pending={...p,id:randomUUID(),token:randomUUID(),step:'populated:1',request:digest('uncertain')};
     await reserve(client,pending);await transition(client,pending,'dispatch');await transition(client,pending,'unknown',{note:'Synthetic uncertain pre-0053 effect'});
    }
    before=await snapshot(client);authorityBefore=await authorityCounts(client);
    const schema52=schema(url),ledger52=(await client.query('SELECT * FROM sofie_schema_migrations ORDER BY name')).rows;
    const broken=[...migrations.slice(0,52),{...migrations[52],statements:[...migrations[52].statements,'SELECT gap2b_injected_migration_failure()']}];
    await assert.rejects(runMigrations(db,broken,()=>{}),/gap2b_injected_migration_failure/);
    assert.equal(schema(url),schema52,'failed migration left schema drift');
    assert.deepEqual(await snapshot(client),before,'failed migration changed data');
    assert.deepEqual((await client.query('SELECT * FROM sofie_schema_migrations ORDER BY name')).rows,ledger52);
    assert.equal((await client.query("SELECT to_regprocedure('engineering_completion_remaining(text,uuid)') present")).rows[0].present,null);
    await runMigrations(db,migrations,()=>{});
    assert.deepEqual(await snapshot(client),before,'0053 changed historical data or added a second balance table');
    assert.deepEqual(await authorityCounts(client),authorityBefore,'0053 fabricated authority');
    if(mode==='checkpoint-clone'){
     const b=(await client.query("SELECT spent_microusd,reserved_microusd FROM engineering_conversation_budget WHERE work_id='fb5a3dd2-e601-404c-8321-81f44ac2973d'")).rows[0];
     assert.equal(Number(b.spent_microusd),777654);assert.equal(Number(b.reserved_microusd),0);
    }
   }
   const beforeRerun=await snapshot(client,true),schema53=schema(url);await runMigrations(db,migrations,()=>{});
   assert.deepEqual(await snapshot(client,true),beforeRerun);assert.equal(schema(url),schema53);
   assert.equal((await client.query('SELECT count(*)::int n FROM sofie_schema_migrations')).rows[0].n,53);
   console.log(JSON.stringify({gate:mode,status:'PASS',migration0053:migrations[52].checksum,historicalTablesPreserved:before?Object.keys(before).length:0,rollback:mode==='fresh'?'covered by other origins':'PASS',rerun:'PASS',authorityCreatedByMigration:0,checkpointHash:mode==='checkpoint-clone'?checkpointHash:null}));
   if(mode==='fresh')await restrictedRoles(client);
  }finally{await client?.end();await admin.query('DROP DATABASE IF EXISTS '+name+' WITH (FORCE)');}
 }
}finally{await admin.end();}
assert.equal(hash(await readFile(checkpoint)),checkpointHash,'Checkpoint changed');
console.log('PASS: immutable 0051/0052; fresh53, populated52 upgrade, checkpoint clone, transactional rollback, exact rerun, historical rows/receipts/spend preserved, restricted roles; retained database never connected; external provider calls=0');
