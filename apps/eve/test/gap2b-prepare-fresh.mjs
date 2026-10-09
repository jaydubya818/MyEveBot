// Explicit local preparation only. Never connects to the retained Golden Work DB.
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {Client} from 'pg';
import {loadMigrations,runMigrations} from '../scripts/migration-runner.ts';
import {runtimeSchema} from '../lib/engineering/runtime.ts';
import {WorkStore} from '../lib/engineering/store.ts';
import {nativeProfileHash} from '../lib/engineering/native-routing.ts';
import {digest} from '../lib/engineering/contract.ts';
assert.equal(process.argv[2],'--prepare-paused-fresh-work');
const destination=new URL('../../../docs/verification/2026-09-26-gap2b-qualified/fresh-work.json',import.meta.url);
try {await readFile(destination);throw Error('Fresh Work already prepared; do not duplicate it.');}catch(e){if(e.code!=='ENOENT')throw e;}
const prior=JSON.parse(await readFile(new URL('../../../docs/verification/2026-09-26-m1er1-window/window-issued-config.json',import.meta.url),'utf8'));
const config=runtimeSchema.parse({...prior,nativeQualification:undefined});
const name='gap2b_m1er1_'+randomBytes(8).toString('hex');
const url='postgresql://postgres@127.0.0.1:55468/'+name;
const admin=new Client({connectionString:'postgresql://postgres@127.0.0.1:55468/postgres'});await admin.connect();
let client;
try {
 await admin.query('CREATE DATABASE '+name);client=new Client({connectionString:url});await client.connect();
 const db={query:async(sql,params)=>(await client.query(sql,params)).rows,transaction:async statements=>{await client.query('BEGIN');try{for(const statement of statements)await client.query(statement.sql,statement.params);await client.query('COMMIT');}catch(e){await client.query('ROLLBACK');throw e;}}};
 await runMigrations(db,await loadMigrations(),()=>{});
 await client.query(`INSERT INTO agents(id,owner_id,name,slug,role,instructions,is_primary,status,max_estimated_cost_usd,max_runtime_seconds,max_steps)
 VALUES($1,$2,'Sofie','sofie','engineer','Only the owner-approved isolated quantity qualification Work; current authority is required.',true,'active',1.3,1800,10)`,[config.agentId,config.ownerId]);
 const store=new WorkStore({scopeId:config.ownerId,scopeKind:'personal',actorId:config.ownerId},db);
 const {work}=await store.create({title:'Fresh M1/ER1 — completion budget qualification',objective:config.objective,criteria:config.criteria,repository:config.profile.repository,maxCostUsd:1.3,maxDurationSeconds:1800,idempotencyKey:randomUUID()});
 assert.notEqual(work.control,'agent');
 const counts=(await client.query(`SELECT (SELECT count(*)::int FROM engineering_route_runs) runs,(SELECT count(*)::int FROM engineering_work_model_budget) budgets,(SELECT count(*)::int FROM engineering_work_model_calls) calls,(SELECT count(*)::int FROM engineering_native_runtime) writers,(SELECT count(*)::int FROM engineering_direct_workspaces) workspaces,(SELECT count(*)::int FROM engineering_native_results) results`)).rows[0];
 assert(Object.values(counts).every(n=>n===0));
 const configPath='/private/tmp/'+name+'-unqualified-config.json';await writeFile(configPath,JSON.stringify(config,null,2)+'\n',{mode:0o600});
 const record={preparedAt:new Date().toISOString(),database:name,databaseURL:url,workId:work.id,workVersion:work.version,workGeneration:work.generation,control:work.control,lifecycle:work.lifecycle,ownerId:config.ownerId,agentId:config.agentId,ceilingUsd:1.3,maxProviderCalls:10,maxDurationSeconds:1800,profileHash:nativeProfileHash(config),unqualifiedConfigHash:digest(config),unqualifiedConfigPath:configPath,approvedBase:config.approvedBase,nativeCompletion:config.nativeCompletion,counts,providerAuthority:'NOT_ISSUED',runtime:'NOT_STARTED',schemaVersion:53};
 await writeFile(destination,JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify(record));
} finally {await client?.end();await admin.end();}
