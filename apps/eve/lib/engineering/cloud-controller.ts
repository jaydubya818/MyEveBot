import {productionCloudEnabled,productionCloudConfiguration} from './production-runtime-guard.ts';
import {createRequire} from 'node:module';
import {cloudRuntimeConfiguration} from './cloud-runtime-guard.ts';
import {consumeFactoryCommands} from './factory-commands.ts';
import {executeFactoryCommand} from './factory-api.ts';
import {factoryRuntime} from './factory-runtime.ts';
import {WorkStore,type WorkDatabase} from './store.ts';
import type {ControllerMessage} from './cloud-controller-delivery.ts';
/** Sofie owns only its canonical Work database. Factory allocation/custody and
 * verifier credentials never enter this controller. A session lock is held on
 * an unpooled TLS connection for every command and reconciliation step. */
export async function runCloudController(message:ControllerMessage){
 const production=productionCloudEnabled()?productionCloudConfiguration():null;
 if(!production)cloudRuntimeConfiguration();
 const owner=process.env.MYEVE_OWNER_ID;
 const url=new URL(process.env.DATABASE_URL_UNPOOLED??'invalid:');
 if(!owner||!['postgres:','postgresql:'].includes(url.protocol)||!url.hostname.endsWith('.neon.tech')||url.hostname.includes('-pooler.'))throw Error('CLOUD_CONTROLLER_DATABASE');
 for(const key of ['sslmode','channel_binding','sslcert','sslkey','sslrootcert','uselibpqcompat'])url.searchParams.delete(key);
 const {Client}=createRequire(import.meta.url)('pg');
 const client=new Client({connectionString:url.href,ssl:{rejectUnauthorized:true},connectionTimeoutMillis:10000,query_timeout:15000});
 client.on('error',()=>{}); // errors are surfaced by awaited operations without credential-bearing driver logs
 try{
  await client.connect();
  const database:WorkDatabase={query:async(q,p)=>(await client.query(q,p)).rows,atomic:async action=>{
   await client.query('BEGIN');try{const result=await action({query:database.query});await client.query('COMMIT');return result;}catch(error){await client.query('ROLLBACK');throw error;}
  }};
  const store=new WorkStore({scopeKind:'personal',scopeId:owner,actorId:owner},database);
  const [command]=await store.database.query("SELECT id,created_at,work_id FROM engineering_factory_commands WHERE id=$1 AND scope_id=$2 AND scope_kind='personal'",[message.commandId,owner]);
  if(!command||(production&&command.work_id!==production.work.id)||new Date(command.created_at).getTime()+600_000!==message.expiresAt)throw Error('CLOUD_CONTROLLER_COMMAND');
  const [lock]=await store.database.query("SELECT pg_try_advisory_lock(hashtextextended('myeve:factory-worker:' || $1,0)) AS acquired",[owner]);
  if(!lock?.acquired)return;
  await consumeFactoryCommands(store,(id,input)=>executeFactoryCommand(store,id,input),production?.work);
  const rows=await store.database.query(`SELECT d.work_id,w.version,w.generation,l.state AS validation_state FROM engineering_routing_decisions d
   LEFT JOIN engineering_factory_validation_lifecycle l ON l.decision_id=d.id AND l.scope_id=d.scope_id AND l.scope_kind=d.scope_kind
   JOIN engineering_work w ON w.id=d.work_id AND w.scope_id=d.scope_id AND w.scope_kind=d.scope_kind
   WHERE d.scope_id=$1 AND d.scope_kind='personal' AND d.work_version=w.version AND d.factory_preparation IS NOT NULL
   AND ($2::uuid IS NULL OR (w.id=$2 AND w.generation=$3))
   AND coalesce(d.factory_observation#>>'{value,verification}','') NOT IN ('PARTIAL','FAILED')
   AND coalesce(d.factory_observation#>>'{value,state}','') NOT IN ('CANCELLED','FAILED')
   ORDER BY d.created_at LIMIT 8`,[owner,production?.work.id??null,production?.work.generation??null]);
  for(const row of rows){
   if(production&&row.work_id!==production.work.id)continue;
   const driver=await factoryRuntime(store);
   if(row.validation_state==='COMPLETED')continue;
   if(row.validation_state==='HALTED'){try{await driver.stop(row.work_id,'cancel');}catch{}continue;}
   const stops=await store.database.query("SELECT operation FROM engineering_factory_commands WHERE scope_id=$1 AND scope_kind='personal' AND work_id=$2 AND work_version=$3 AND work_generation=$4 AND operation IN ('stop','takeover') ORDER BY created_at DESC LIMIT 1",[owner,row.work_id,row.version,row.generation]);
   try{if(stops.length)await driver.stop(row.work_id,stops[0].operation==='takeover'?'takeover':'cancel');await driver.step(row.work_id);}
   catch{/* Canonical driver retains blocked state. Next delivery only reconciles the same attempt. */}
  }
 }catch{throw Error('CLOUD_CONTROLLER_RECONCILIATION_REQUIRED');}
 finally{await client.end().catch(()=>{});}
}
