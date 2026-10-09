import {factoryWorkerApproval,assertFactoryWorkerApproval} from '../lib/engineering/factory-worker-approval.ts';
import {createRequire} from 'node:module';
import {factoryConfig} from '../lib/engineering/factory-routing.ts';
import {factoryRuntime} from '../lib/engineering/factory-runtime.ts';
import {factoryAction} from '../lib/engineering/factory-api.ts';
import {consumeFactoryCommands} from '../lib/engineering/factory-commands.ts';
import {WorkStore} from '../lib/engineering/store.ts';
// Existing local executor composition. Hosted processes never run this worker.
const alpha=process.env.MYEVE_BETA_MODE==='private-alpha';
const url=new URL(process.env.MYEVE_FACTORY_DATABASE_URL??'invalid:');
const local=url.hostname==='127.0.0.1'&&url.port==='55479'&&/^\/factory_beta_[a-z0-9_]+$/.test(url.pathname);
if(process.env.MYEVE_ENGINEERING_MODE!=='dogfood'||process.env.VERCEL_ENV==='production'||
 !['postgres:','postgresql:'].includes(url.protocol)||(!local&&!(alpha&&process.env.MYEVE_FACTORY_LOCAL_WORKER==='true'&&url.href===new URL(process.env.DATABASE_URL??'invalid:').href)))
 throw Error('Factory worker requires its explicit database and local execution configuration.');
const config=await factoryConfig(),owner=config.engineering.ownerId;
if(alpha&&owner!==process.env.MYEVE_OWNER_ID)throw Error('Private-alpha worker owner mismatch.');
const approval=factoryWorkerApproval(config.connection.qualification.mode);
const {Client}=createRequire(import.meta.url)('pg');const client=new Client({connectionString:url.href});
await client.connect();
let stopping=false;process.on('SIGTERM',()=>{stopping=true;});process.on('SIGINT',()=>{stopping=true;});
client.on('error',()=>{stopping=true;});
const store=new WorkStore({scopeKind:'personal',scopeId:owner,actorId:owner},{query:async(q,p)=>(await client.query(q,p)).rows});
try {
 const [lock]=await store.database.query("SELECT pg_try_advisory_lock(hashtextextended('myeve:factory-worker:' || $1,0)) AS acquired",[owner]);
 if(!lock?.acquired)throw Error('Another Factory worker owns this scope.');
 console.log('Factory worker connected; canonical execution gates active.');
 while(!stopping) {
  if(alpha)await consumeFactoryCommands(store,(id,input)=>{assertFactoryWorkerApproval(approval,id,input);return factoryAction(store,id,input);});
  const rows=await store.database.query(`SELECT d.work_id,w.version,w.generation FROM engineering_routing_decisions d JOIN engineering_work w ON w.id=d.work_id AND w.scope_id=d.scope_id AND w.scope_kind=d.scope_kind WHERE d.scope_id=$1 AND d.scope_kind='personal' AND d.work_version=w.version AND d.factory_preparation IS NOT NULL AND coalesce(d.factory_observation#>>'{value,verification}','') NOT IN ('PARTIAL','FAILED') ORDER BY d.created_at`,[owner]);
  for(const row of rows) {
   if(stopping)break;
   if(approval&&(row.work_id!==approval.workId||Number(row.version)!==approval.version||Number(row.generation)!==approval.generation))continue;
   try {
    const driver=await factoryRuntime(store);
    const stops=alpha?await store.database.query("SELECT operation FROM engineering_factory_commands WHERE scope_id=$1 AND scope_kind='personal' AND work_id=$2 AND work_version=$3 AND work_generation=$4 AND operation IN ('stop','takeover') ORDER BY created_at DESC LIMIT 1",[owner,row.work_id,row.version,row.generation]):[];
    if(stops.length)await driver.stop(row.work_id,stops[0].operation==='takeover'?'takeover':'cancel');else await driver.step(row.work_id);
    if(alpha)await store.database.query(`UPDATE beta_goal_work_bindings b SET binding=jsonb_set(jsonb_set(binding,'{workGeneration}',to_jsonb(w.generation)),'{state}','"ADMITTED"'::jsonb) FROM engineering_work w,engineering_routing_decisions d WHERE b.owner_id=$1 AND b.work_id=$2 AND w.scope_id=b.owner_id AND w.scope_kind='personal' AND w.id=b.work_id AND d.scope_id=w.scope_id AND d.scope_kind=w.scope_kind AND d.work_id=w.id AND d.work_version=w.version AND d.selected_route='MYFACTORY' AND d.status='ADMITTED'`,[owner,row.work_id]);
   }catch{console.error('Factory reconciliation blocked; retained Work requires reconciliation.');}
  }
  await new Promise(r=>setTimeout(r,2000));
 }
} finally {await client.end();}
