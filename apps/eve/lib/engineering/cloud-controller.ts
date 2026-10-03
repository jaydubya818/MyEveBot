import {createRequire} from 'node:module';
import {cloudRuntimeConfiguration} from './cloud-runtime-guard.ts';
import {consumeFactoryCommands} from './factory-commands.ts';
import {executeFactoryCommand} from './factory-api.ts';
import {factoryRuntime} from './factory-runtime.ts';
import {WorkStore} from './store.ts';
import type {ControllerMessage} from './cloud-controller-delivery.ts';
/** Sofie owns only its canonical Work database. Factory allocation/custody and
 * verifier credentials never enter this controller. A session lock is held on
 * an unpooled TLS connection for every command and reconciliation step. */
export async function runCloudController(message:ControllerMessage){
 cloudRuntimeConfiguration();
 const owner=process.env.MYEVE_OWNER_ID;
 const url=new URL(process.env.DATABASE_URL_UNPOOLED??'invalid:');
 if(!owner||!['postgres:','postgresql:'].includes(url.protocol)||!url.hostname.endsWith('.neon.tech')||url.hostname.includes('-pooler.'))throw Error('CLOUD_CONTROLLER_DATABASE');
 for(const key of ['sslmode','channel_binding','sslcert','sslkey','sslrootcert','uselibpqcompat'])url.searchParams.delete(key);
 const {Client}=createRequire(import.meta.url)('pg');
 const client=new Client({connectionString:url.href,ssl:{rejectUnauthorized:true},connectionTimeoutMillis:10000,query_timeout:15000});
 client.on('error',()=>{}); // errors are surfaced by awaited operations without credential-bearing driver logs
 try{
  await client.connect();
  const store=new WorkStore({scopeKind:'personal',scopeId:owner,actorId:owner},{query:async(q,p)=>(await client.query(q,p)).rows});
  const [command]=await store.database.query("SELECT id,created_at FROM engineering_factory_commands WHERE id=$1 AND scope_id=$2 AND scope_kind='personal'",[message.commandId,owner]);
  if(!command||new Date(command.created_at).getTime()+600_000!==message.expiresAt)throw Error('CLOUD_CONTROLLER_COMMAND');
  const [lock]=await store.database.query("SELECT pg_try_advisory_lock(hashtextextended('myeve:factory-worker:' || $1,0)) AS acquired",[owner]);
  if(!lock?.acquired)return;
  await consumeFactoryCommands(store,(id,input)=>executeFactoryCommand(store,id,input));
  const rows=await store.database.query(`SELECT d.work_id,w.version,w.generation FROM engineering_routing_decisions d
   JOIN engineering_work w ON w.id=d.work_id AND w.scope_id=d.scope_id AND w.scope_kind=d.scope_kind
   WHERE d.scope_id=$1 AND d.scope_kind='personal' AND d.work_version=w.version AND d.factory_preparation IS NOT NULL
   AND coalesce(d.factory_observation#>>'{value,verification}','') NOT IN ('PARTIAL','FAILED')
   AND coalesce(d.factory_observation#>>'{value,state}','') NOT IN ('CANCELLED','FAILED')
   ORDER BY d.created_at LIMIT 8`,[owner]);
  for(const row of rows){
   const driver=await factoryRuntime(store);
   const stops=await store.database.query("SELECT operation FROM engineering_factory_commands WHERE scope_id=$1 AND scope_kind='personal' AND work_id=$2 AND work_version=$3 AND work_generation=$4 AND operation IN ('stop','takeover') ORDER BY created_at DESC LIMIT 1",[owner,row.work_id,row.version,row.generation]);
   try{if(stops.length)await driver.stop(row.work_id,stops[0].operation==='takeover'?'takeover':'cancel');await driver.step(row.work_id);}
   catch{/* Canonical driver retains blocked state. Next delivery only reconciles the same attempt. */}
  }
 }catch{throw Error('CLOUD_CONTROLLER_RECONCILIATION_REQUIRED');}
 finally{await client.end().catch(()=>{});}
}
