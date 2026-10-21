import {afterEach,beforeEach,describe,expect,it} from 'vitest';
import pg from 'pg';
import {randomUUID} from 'node:crypto';
import {Env,connection} from '../external-alpha/work-test-fixture.ts';
import {permitFixture} from './permit-test-fixture.ts';
import {ownerResultFixtureConfig} from './owner-result-test-fixture.ts';
import {factoryExecutionConfigurationHash} from '../engineering/factory-configuration-hash.ts';
import {digest} from '../engineering/contract.ts';

describe.skipIf(!connection)('owner origin versus legacy writers on the complete schema',()=>{
 let env:Env,role:string;
 beforeEach(async()=>{
  env=await Env.create();role='legacy_context_'+env.name.slice(8);
  await env.pool.query(`CREATE ROLE ${role} NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`);
  await env.pool.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
  await env.pool.query(`GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${role}`);
  await env.pool.query(`GRANT UPDATE ON engineering_work,agents,business_partnership TO ${role}`);
  await env.pool.query(`GRANT EXECUTE ON FUNCTION business_assert_effect(text,uuid,integer,integer,text,jsonb) TO ${role}`);
  await env.pool.query(`GRANT INSERT ON missioncontrol_owner_work_origins,engineering_execution,engineering_model_calls,engineering_route_runs TO ${role}`);
 },30000);
 afterEach(async()=>{await env?.close();if(role){const admin=new pg.Pool({connectionString:connection});try{await admin.query('DROP ROLE IF EXISTS '+role);}finally{await admin.end();}}});
 async function originFor(work:any){
  const f=permitFixture({ownerId:env.owner,workId:work.id,workVersion:1,workGeneration:1,tupleSha256:'a'.repeat(64),maxCostMicrousd:1300000,maxDurationSeconds:180});
  const config=ownerResultFixtureConfig(work,env.resultKeys),pins={factoryId:config.connection.factoryId,sourceDigest:config.connection.sourceDigest,
   configurationDigest:config.connection.configurationDigest,configurationHash:factoryExecutionConfigurationHash(config),
   profileHash:digest(config.engineering.profile),repository:work.repository,agentId:'fixture-agent'};
  const enrollment={...f.enrollment,factoryVersion:config.connection.factoryVersion,ownerFactoryAdapter:pins};
  await env.pool.query('INSERT INTO missioncontrol_owner_enrollments(owner_id,installation_id,revision,document) VALUES($1,$2,1,$3)',[env.owner,enrollment.installationId,enrollment]);
  return (c:pg.PoolClient)=>c.query(`INSERT INTO missioncontrol_owner_work_origins(owner_id,installation_id,work_id,work_version,work_generation,document)
   VALUES($1,$2,$3,1,1,$4)`,[env.owner,enrollment.installationId,work.id,{schema:'mc-owner-factory-origin/v1',installationId:enrollment.installationId,
    connectionId:enrollment.connectionId,tupleSha256:'a'.repeat(64),factoryVersion:config.connection.factoryVersion,pins}]);
 }
 async function begin(c:pg.PoolClient,isolation:string,mode='explicit'){
  if(mode==='session default')await c.query("SELECT set_config('default_transaction_isolation',$1,false)",[isolation.toLowerCase()]);
  await c.query(mode==='explicit'?'BEGIN ISOLATION LEVEL '+isolation:'BEGIN');await c.query('SET LOCAL ROLE '+role);
  await c.query("SELECT set_config('myeve.missioncontrol_owner',$1,true)",[env.owner]);
  expect((await c.query('SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user')).rows[0]).toEqual({rolsuper:false,rolbypassrls:false});
 }
 async function legacy(c:pg.PoolClient,work:any,kind:string){
  if(kind==='route')return c.query(`INSERT INTO engineering_route_runs(id,scope_id,scope_kind,work_id,route,provider_id,provider_version,status,work_version,work_generation,dispatch_state)
   VALUES($1,$2,'personal',$3,'DIRECT','fixture','1','QUEUED',1,1,'UNKNOWN')`,[randomUUID(),env.owner,work.id]);
  await c.query(`INSERT INTO engineering_execution(scope_id,scope_kind,work_id,revision,state) VALUES($1,'personal',$2,1,'{}')`,[env.owner,work.id]);
  if(kind==='model-call')await c.query(`INSERT INTO engineering_model_calls(id,scope_id,scope_kind,work_id,attempt_id,reserved_usd,state)
   VALUES($1,$2,'personal',$3,$4,0.01,'UNKNOWN')`,[randomUUID(),env.owner,work.id,randomUUID()]);
 }
 for(const kind of ['execution','model-call','route'])for(const isolation of ['READ COMMITTED','REPEATABLE READ','SERIALIZABLE'])for(const mode of ['explicit','session default'])
 it(`denies stale ${mode} ${isolation} ${kind} after owner origin commits`,async()=>{
  const work=await env.seedWork(),origin=await originFor(work),winner=await env.pool.connect(),loser=await env.pool.connect();let pending:Promise<any>|undefined;
  try{
   await begin(winner,'READ COMMITTED');await begin(loser,isolation,mode);
   const count=async(c:pg.PoolClient)=>Number((await c.query('SELECT count(*) n FROM missioncontrol_owner_work_origins WHERE work_id=$1',[work.id])).rows[0].n);
   expect(await count(loser)).toBe(0);await origin(winner);
   const pid=(await loser.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
   pending=legacy(loser,work,kind).then(()=>({accepted:true}),error=>({accepted:false,message:error.message,code:error.code}));
   let waiting=false;
   for(let attempt=0;attempt<100&&!waiting;attempt++){
    waiting=(await env.pool.query("SELECT wait_event_type='Lock' AS waiting FROM pg_stat_activity WHERE pid=$1",[pid])).rows[0]?.waiting===true;
    if(!waiting)await new Promise(resolve=>setTimeout(resolve,10));
   }
   await winner.query('COMMIT');const outcome=await pending;
   if(outcome.accepted)await loser.query('COMMIT');else await loser.query('ROLLBACK');
   const counts=Object.fromEntries(await Promise.all(['missioncontrol_owner_work_origins','engineering_execution','engineering_model_calls','engineering_route_runs'].map(async table=>[table,Number((await env.pool.query(`SELECT count(*) n FROM ${table} WHERE work_id=$1`,[work.id])).rows[0].n)])));
   console.log(JSON.stringify({kind,isolation,mode,waiting,outcome,counts,fullSchema:true,ordinaryRole:true}));
   if(isolation==='READ COMMITTED')expect(waiting).toBe(true);
   expect(outcome.accepted).toBe(false);
   expect(outcome.message).toBe(isolation==='READ COMMITTED'?'MISSIONCONTROL_OWNER_ROUTE_REQUIRED':'MISSIONCONTROL_ADMISSION_ISOLATION_REQUIRED');
   expect(counts).toEqual({missioncontrol_owner_work_origins:1,engineering_execution:0,engineering_model_calls:0,engineering_route_runs:0});
  }finally{await winner.query('ROLLBACK');if(pending)await pending;await loser.query('ROLLBACK');await loser.query('RESET default_transaction_isolation');winner.release();loser.release();}
 },15000);
 for(const kind of ['execution','model-call','route'])it(`preserves already admitted READ COMMITTED ${kind} and UNKNOWN evidence when owner admission is denied`,async()=>{
  const work=await env.seedWork(),origin=await originFor(work),c=await env.pool.connect();
  const snapshot=async()=>Promise.all(['engineering_work','engineering_execution','engineering_model_calls','engineering_route_runs'].map(async table=>(await env.pool.query(`SELECT to_jsonb(t) record FROM ${table} t WHERE ${table==='engineering_work'?'id':'work_id'}=$1`,[work.id])).rows));
  try{
   await begin(c,'READ COMMITTED');await legacy(c,work,kind);await c.query('COMMIT');
   const before=await snapshot();await begin(c,'READ COMMITTED');
   await expect(origin(c)).rejects.toThrow('MISSIONCONTROL_ORIGIN_DENIED');await c.query('ROLLBACK');
   expect(await snapshot()).toEqual(before);
   if(kind==='model-call')expect((await env.pool.query('SELECT state,reserved_usd FROM engineering_model_calls WHERE work_id=$1',[work.id])).rows).toEqual([{state:'UNKNOWN',reserved_usd:'0.010000'}]);
   if(kind==='route')expect((await env.pool.query('SELECT dispatch_state FROM engineering_route_runs WHERE work_id=$1',[work.id])).rows).toEqual([{dispatch_state:'UNKNOWN'}]);
  }finally{await c.query('ROLLBACK');c.release();}
 });
 for(const isolation of ['REPEATABLE READ','SERIALIZABLE'])it(`denies a new ${isolation} model call on existing legacy execution without changing that execution`,async()=>{
  const work=await env.seedWork(),c=await env.pool.connect();
  try{
   await begin(c,'READ COMMITTED');await legacy(c,work,'execution');await c.query('COMMIT');
   const before=(await env.pool.query('SELECT to_jsonb(x) record FROM engineering_execution x WHERE work_id=$1',[work.id])).rows;
   await begin(c,isolation);
   await expect(c.query(`INSERT INTO engineering_model_calls(id,scope_id,scope_kind,work_id,attempt_id,reserved_usd,state)
    VALUES($1,$2,'personal',$3,$4,0.01,'UNKNOWN')`,[randomUUID(),env.owner,work.id,randomUUID()])).rejects.toThrow('MISSIONCONTROL_ADMISSION_ISOLATION_REQUIRED');
   await c.query('ROLLBACK');expect((await env.pool.query('SELECT to_jsonb(x) record FROM engineering_execution x WHERE work_id=$1',[work.id])).rows).toEqual(before);
   expect((await env.pool.query('SELECT id FROM engineering_model_calls WHERE work_id=$1',[work.id])).rows).toEqual([]);
  }finally{await c.query('ROLLBACK');c.release();}
 });

});
