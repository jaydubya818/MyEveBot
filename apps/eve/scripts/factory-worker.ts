import {createRequire} from 'node:module';
import {factoryConfig} from '../lib/engineering/factory-routing.ts';
import {factoryRuntime} from '../lib/engineering/factory-runtime.ts';
import {WorkStore} from '../lib/engineering/store.ts';
// Explicit isolated database only; never borrow application or retained fixture credentials.
const url=new URL(process.env.MYEVE_FACTORY_DATABASE_URL??'invalid:');
if(process.env.MYEVE_ENGINEERING_MODE!=='dogfood'||process.env.VERCEL_ENV==='production'||url.hostname!=='127.0.0.1'||url.port!=='55479'||!/^\/factory_beta_[a-z0-9_]+$/.test(url.pathname))throw Error('Factory worker requires an explicit owned local qualification database.');
const {Pool}=createRequire(import.meta.url)('pg');const pool=new Pool({connectionString:url.href});
const config=await factoryConfig(),owner=config.engineering.ownerId;
const store=new WorkStore({scopeKind:'personal',scopeId:owner,actorId:owner},{query:async(q,p)=>(await pool.query(q,p)).rows});
let stopping=false;process.on('SIGTERM',()=>{stopping=true;});process.on('SIGINT',()=>{stopping=true;});
try{while(!stopping){
 const rows=await store.database.query(`SELECT d.work_id FROM engineering_routing_decisions d JOIN engineering_work w ON w.id=d.work_id AND w.scope_id=d.scope_id AND w.scope_kind=d.scope_kind WHERE d.scope_id=$1 AND d.scope_kind='personal' AND d.work_version=w.version AND d.factory_preparation IS NOT NULL AND coalesce(d.factory_observation#>>'{value,verification}','') NOT IN ('PARTIAL','FAILED') ORDER BY d.created_at`,[owner]);
 for(const row of rows){if(stopping)break;try{await (await factoryRuntime(store)).step(row.work_id);}catch{console.error('Factory reconciliation blocked; Current Truth retains the reason',row.work_id);}}
 await new Promise(r=>setTimeout(r,2000));
}}finally{await pool.end();}
