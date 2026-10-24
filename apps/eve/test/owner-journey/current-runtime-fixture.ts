/** Qualification-only. Imported through the fresh copy's public tsx loader after
 * the native operator has created and identified its own disposable PG cluster. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {generateKeyPairSync,randomBytes,randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {loadMigrations,runMigrations} from '../../scripts/migration-runner.ts';
import {digest} from '../../lib/engineering/contract.ts';
import {externalAlphaLimits,externalAlphaPolicySchema} from '../../lib/external-alpha/policy.ts';
import {fixtureFactoryVersion,fixtureSourceDigest} from '../../lib/external-alpha/result-test-fixture.ts';
import {SharedAlphaAccounting} from '../../lib/external-alpha/shared-accounting.ts';
import {readAlphaChatUsage} from '../../lib/external-alpha/usage.ts';
import {EXTERNAL_ALPHA_INSTRUCTIONS,EXTERNAL_ALPHA_CONTEXT_BYTES} from '../../lib/external-alpha/context.ts';
const {Pool}=createRequire(import.meta.url)('pg');
const pause=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
export function validateCurrentModelEnvelope(body:any){
 assert(Array.isArray(body.prompt));
 assert(body.prompt.some((message:any)=>message.role==='system'&&String(message.content).includes(EXTERNAL_ALPHA_INSTRUCTIONS)),'CURRENT_MANDATORY_ALPHA_POLICY_MISSING');
 assert(Buffer.byteLength(JSON.stringify({prompt:body.prompt,tools:body.tools}))<=EXTERNAL_ALPHA_CONTEXT_BYTES,'CURRENT_MODEL_CONTEXT_LIMIT');
 assert(!body.tools?.some((tool:any)=>['engineering_work','engineering_factory'].includes(tool.name)),'CURRENT_DISABLED_WORK_TOOL_EXPOSED');
}


export async function createCurrentRuntimeFixture(spec:{adminUrl:string;systemIdentifier:string;dataDirectory:string;port:number}){
 const url=new URL(spec.adminUrl);
 assert.equal(url.protocol,'postgresql:');assert.equal(url.hostname,'127.0.0.1');
 assert.equal(url.username,'ux_fixture');assert.equal(url.pathname,'/postgres');
 assert.equal(Number(url.port),spec.port);assert(url.password.length>=32&&!url.search&&!url.hash);
 assert.match(spec.systemIdentifier,/^\d+$/);assert.match(spec.dataDirectory,process.platform==='darwin'?/^\/private\/tmp\/myeve-current-native-[a-f0-9]{32}\/data$/:/^\/tmp\/myeve-current-native-[a-f0-9]{32}\/data$/);
 const admin=new Pool({connectionString:url.href,max:1,connectionTimeoutMillis:5000,query_timeout:10000});
 const asynchronousErrors:unknown[]=[];admin.on('error',(error:unknown)=>asynchronousErrors.push(error));
 const created:{name:string;pool?:any;created:boolean;creationUnknown:boolean}[]=[];
 const metadataSql="SELECT current_user AS role,current_database() AS database,system_identifier::text AS system_identifier,current_setting('data_directory') AS data_directory,host(inet_server_addr()) AS address,inet_server_port() AS port FROM pg_control_system()";
 async function identity(pool:any,database:string){
  const {rows}=await pool.query(metadataSql);assert.equal(rows.length,1);
  assert.deepEqual(rows[0],{role:'ux_fixture',database,system_identifier:spec.systemIdentifier,data_directory:spec.dataDirectory,address:'127.0.0.1',port:spec.port});
  return rows[0];
 }
 async function close(){
  const failures:unknown[]=[];
  // Pools must be ended before any owned database is inspected/dropped.
  for(const item of created)if(item.pool)try{await item.pool.end();}catch(error){failures.push(error);}
  for(const item of [...created].reverse()){
   if(item.creationUnknown){failures.push(Error('CURRENT_DATABASE_CREATE_ACK_UNKNOWN:'+item.name));continue;}
   if(!item.created)continue;
   try{
    await identity(admin,'postgres');
    let remaining:any[]=[];
    for(let attempt=0;attempt<100;attempt++){
     remaining=(await admin.query('SELECT pid FROM pg_stat_activity WHERE datname=$1',[item.name])).rows;
     if(!remaining.length)break;
     if(attempt<99)await pause(20);
    }
    assert.equal(remaining.length,0,'CURRENT_DATABASE_NOT_QUIESCENT_RETAINED:'+item.name);
    assert.match(item.name,/^ea_work_[a-f0-9]{32}$/);
    await admin.query('DROP DATABASE '+item.name);item.created=false;
   }catch(error){failures.push(error);}
  }
  try{await admin.end();}catch(error){failures.push(error);}
  // Capture errors emitted during ALL awaited pool/admin shutdown operations.
  failures.push(...asynchronousErrors);
  if(failures.length)throw new AggregateError(failures,'Current runtime fixture cleanup failed; retain native operator HOLD');
  return {status:'OWNED_DATABASES_DROPPED_NONFORCE',names:created.map(item=>item.name),asynchronousErrors:0};
 }
 try{
  const cluster=await identity(admin,'postgres');
  const before=(await admin.query('SELECT datname FROM pg_database ORDER BY datname')).rows;
  async function database(){
   const item={name:'ea_work_'+randomBytes(16).toString('hex'),created:false,creationUnknown:false,pool:undefined as any};created.push(item);
   try{await admin.query('CREATE DATABASE '+item.name);item.created=true;}
   catch(error){item.creationUnknown=true;throw error;}
   const connection=new URL(url);connection.pathname='/'+item.name;
   item.pool=new Pool({connectionString:connection.href,max:8,connectionTimeoutMillis:5000,query_timeout:10000});
   item.pool.on('error',(error:unknown)=>asynchronousErrors.push(error));
   await identity(item.pool,item.name);
   const db={query:async(q:string,p:unknown[]=[]) => (await item.pool.query(q,p)).rows,
    transaction:async(statements:{sql:string;params:unknown[]}[])=>{
     const client=await item.pool.connect();
     try{await client.query('BEGIN');for(const statement of statements)await client.query(statement.sql,statement.params);await client.query('COMMIT');}
     catch(error){try{await client.query('ROLLBACK');}catch(rollback){throw new AggregateError([error,rollback],'Fixture migration rollback failed');}throw error;}
     finally{client.release();}
    }};
   await runMigrations(db as any,await loadMigrations(),()=>{});
   return {...item,url:connection.href,db};
  }
  const central=await database(),cohortId=randomUUID(),installations=[];
  for(const slot of ['1','2'] as const){
   const app=await database(),owner=randomUUID(),credential=randomBytes(32).toString('hex');
   const policy=externalAlphaPolicySchema.parse({version:1,kind:'TWO_EXTERNAL_OWNERS_V1',cohortId,slot,
    ownerId:owner,projectId:'prj_fixturechat'+slot,clientId:'external-alpha-'+randomBytes(16).toString('hex'),
    repository:'fixture/myeve-alpha-workspace-0'+slot,baseSha:'1'.repeat(40),treeSha:'2'.repeat(40),
    workspacePolicy:'ISOLATED_WORKSPACE_V1',dayBoundary:'UTC_MIDNIGHT',model:'openai/gpt-5.4-mini',provider:'vercel-ai-gateway/openai',
    sourceDigest:fixtureSourceDigest,factoryVersion:fixtureFactoryVersion,limits:{...externalAlphaLimits},publication:false,automaticRepair:false,fallback:false});
   await app.pool.query('INSERT INTO external_alpha_policy(owner_id,policy_sha256,policy) VALUES($1,$2,$3)',[owner,digest(policy),policy]);
   await app.pool.query('INSERT INTO external_alpha_chat_only(owner_id,policy_sha256) VALUES($1,$2)',[owner,digest(policy)]);
   installations.push({...app,owner,policy,credential,password:randomBytes(32).toString('hex'),sessionSecret:randomBytes(48).toString('hex')});
  }
  for(const file of ['shared-accounting.sql','shared-accounting-recovery.sql','shared-accounting-zero-gap.sql','shared-accounting-chat-only.sql'])
   await central.pool.query(await readFile(new URL('../../lib/external-alpha/'+file,import.meta.url),'utf8'));
  await central.pool.query('INSERT INTO external_alpha_cohort(id) VALUES($1)',[cohortId]);
  for(const app of installations){
   await central.pool.query("INSERT INTO external_alpha_cohort_member(cohort_id,slot,owner_id,policy_sha256,credential_sha256) VALUES($1,$2,$3,$4,encode(sha256(convert_to($5,'UTF8')),'hex'))",[cohortId,app.policy.slot,app.owner,digest(app.policy),app.credential]);
   await app.pool.query('UPDATE external_alpha_policy SET activated_at=clock_timestamp() WHERE owner_id=$1 AND policy_sha256=$2 AND activated_at IS NULL',[app.owner,digest(app.policy)]);
   (app.db as any).externalAlphaAccounting=new SharedAlphaAccounting(central.db,app.credential);
  }
  await central.pool.query('UPDATE external_alpha_cohort SET activated_at=clock_timestamp() WHERE id=$1 AND activated_at IS NULL',[cohortId]);
  const app=installations[0],authorityKey=generateKeyPairSync('ed25519').privateKey.export({type:'pkcs8',format:'pem'}) as string;
  function environment(copiedApp:string,transportFile:string){
   return {NODE_ENV:'production',NEXT_TELEMETRY_DISABLED:'1',DATABASE_URL:app.url,MYEVE_TEST_DATABASE_URL:app.url,
    OWNER_NAME:'Alex',NEXT_PUBLIC_OWNER_NAME:'Alex',NEXT_PUBLIC_AGENT_NAME:'Sofie',OWNER_TIMEZONE:'America/Los_Angeles',
    MYEVE_OWNER_ID:app.owner,MYEVE_ACCESS_PASSWORD:app.password,MYEVE_SESSION_SECRET:app.sessionSecret,
    MYEVE_APPLICATION_PASSWORDS:'true',MYEVE_DURABLE_WEB_SESSIONS:'true',MYEVE_ENGINEERING_MODE:'dogfood',MYEVE_FACTORY_WORKER_ENABLED:'false',
    EVE_PROJECT_NAME:'myeve-alpha-tester-1',MYEVE_BETA_MODE:'private-alpha',MYEVE_ALPHA_REPOSITORY:app.policy.repository,
    MYEVE_ALPHA_MAX_WORK_USD:'1.30',MYEVE_ALPHA_MAX_WORK_SECONDS:'180',VERCEL_ENV:'production',VERCEL_PROJECT_ID:app.policy.projectId,
    VERCEL_OIDC_TOKEN:'fixture.'+Buffer.from(JSON.stringify({project_id:app.policy.projectId,owner_id:'team_fixture',environment:'production',exp:Math.floor(Date.now()/1000)+86400})).toString('base64url')+'.fixture',
    MYEVE_EXTERNAL_ALPHA_POLICY:JSON.stringify(app.policy),MYEVE_EXTERNAL_ALPHA_POLICY_SHA256:digest(app.policy),
    MYEVE_EXTERNAL_ALPHA_AUTHORITY_SIGNING_KEY:authorityKey,MYEVE_EXTERNAL_ALPHA_ACCOUNTING_DATABASE_URL:central.url,
    MYEVE_EXTERNAL_ALPHA_ACCOUNTING_TOKEN:app.credential,MYEVE_CHAT_ONLY_TRANSPORT_FILE:transportFile,
    NODE_OPTIONS:'--max-old-space-size=5120 --require='+copiedApp+'/test/owner-journey/transport.cjs'};
  }
  async function observe(){
   const q=async(sql:string,p:unknown[]=[]) => (await app.pool.query(sql,p)).rows;
   const policySha=digest(app.policy);
   return {cluster,ownerId:app.owner,projectId:app.policy.projectId,policySha256:policySha,appDatabase:app.name,centralDatabase:central.name,
    usage:await readAlphaChatUsage(app.db as any,app.policy),
    allowances:await q('SELECT id,kind,day_index,ceiling_microusd,state FROM external_alpha_allowance WHERE owner_id=$1 AND policy_sha256=$2 ORDER BY id',[app.owner,policySha]),
    operations:await q('SELECT o.id,o.allowance_id,o.state,o.source,o.spent_microusd FROM external_alpha_operation o JOIN external_alpha_allowance a ON a.id=o.allowance_id WHERE a.owner_id=$1 AND a.policy_sha256=$2 ORDER BY o.id',[app.owner,policySha]),
    admissions:(await central.pool.query('SELECT id,kind,day_index,state,local_allowance_id,ceiling_microusd FROM external_alpha_cohort_admission WHERE owner_id=$1 AND policy_sha256=$2 ORDER BY id',[app.owner,policySha])).rows,
    dispatches:(await central.pool.query('SELECT d.admission_id,d.state FROM external_alpha_cohort_dispatch d JOIN external_alpha_cohort_admission a ON a.id=d.admission_id WHERE a.owner_id=$1 AND a.policy_sha256=$2 ORDER BY d.admission_id',[app.owner,policySha])).rows,
    threads:await q('SELECT id,owner_id,agent_id,chat FROM web_chat_threads ORDER BY id'),
    runs:await q('SELECT id,owner_id,agent_id,thread_id,session_id,status,model_steps FROM agent_runs ORDER BY id'),
    agents:await q('SELECT id,owner_id,is_primary FROM agents ORDER BY id'),
    credentials:(await q('SELECT owner_id,version,password_hash FROM web_password_credentials WHERE installation_id=$1',[app.policy.projectId])).map((row:any)=>({ownerId:row.owner_id,version:row.version,hashed:/^scrypt\$131072\$8\$1\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(row.password_hash)})),
    effects:Object.fromEntries(await Promise.all(['engineering_work','external_alpha_work_authority','external_alpha_work_result','external_alpha_tool_effect','engineering_owner_decisions','engineering_candidate_publications'].map(async table=>[table,Number((await q('SELECT count(*)::int AS n FROM '+table))[0].n)]))),
    unusedOwner:{ownerId:installations[1].owner,threads:Number((await installations[1].pool.query('SELECT count(*)::int AS n FROM web_chat_threads')).rows[0].n),
     runs:Number((await installations[1].pool.query('SELECT count(*)::int AS n FROM agent_runs')).rows[0].n),
     admissions:Number((await central.pool.query('SELECT count(*)::int AS n FROM external_alpha_cohort_admission WHERE owner_id=$1',[installations[1].owner])).rows[0].n)},
    asynchronousErrors:asynchronousErrors.length};
  }
  return {central,installations,app,environment,observe,close,
   async assertOnlyOwnedDatabases(){assert.deepEqual((await admin.query('SELECT datname FROM pg_database ORDER BY datname')).rows,
    [...before,...created.filter(item=>item.created).map(item=>({datname:item.name}))].sort((a,b)=>a.datname.localeCompare(b.datname)));}};
 }catch(error){try{await close();}catch(cleanup){throw new AggregateError([error,cleanup],'Fixture preparation and cleanup failed');}throw error;}
}
