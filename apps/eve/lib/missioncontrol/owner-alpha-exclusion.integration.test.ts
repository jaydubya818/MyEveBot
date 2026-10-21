import {beforeEach,afterEach,describe,it,expect} from 'vitest';
import pg from 'pg';
import {randomUUID,createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {Env,connection,files} from '../external-alpha/work-test-fixture.ts';
import {permitFixture} from './permit-test-fixture.ts';
import {digest} from '../engineering/contract.ts';
import {ownerResultFixtureConfig} from './owner-result-test-fixture.ts';
import {factoryExecutionConfigurationHash} from '../engineering/factory-configuration-hash.ts';
import {loadMigrations,runMigrations,type MigrationDatabase} from '../../scripts/migration-runner.ts';
import {splitSqlStatements} from '../../scripts/migration-sql.ts';

const original0099='52478de2d2e680949406b4f1c76e3bb4c3220dbf07d8c4dc521ff9e51787bc8c';
const changed0099='b580bb23098fb564a95de94bfd5b7a826278f10a19717de9331469b52c8e2f1f';
const correction0102Name='0102_missioncontrol_owner_alpha_exclusion.sql';
const migrationName='0107_factory_preparation_generation_guard.sql';
const sha=(text:string)=>createHash('sha256').update(text).digest('hex');
const driver=(pool:pg.Pool):MigrationDatabase=>({query:async(s,p)=>(await pool.query(s,p)).rows,
  transaction:async statements=>{const c=await pool.connect();try{await c.query('BEGIN');for(const s of statements)await c.query(s.sql,s.params);await c.query('COMMIT');}
    catch(error){await c.query('ROLLBACK');throw error;}finally{c.release();}}});

describe.skipIf(!connection)('additive owner/Alpha exclusion and caller context on the complete schema',()=>{
  let env:Env,role:string,template:any;
  beforeEach(async()=>{
    env=await Env.create();role='owner_context_'+env.name.slice(8);
    const work=await env.seedWork();await env.svc.issue(work,files);
    template=(await env.pool.query('SELECT * FROM external_alpha_work_authority')).rows[0];
    await env.pool.query(`CREATE ROLE ${role} NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`);
    await env.pool.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
    await env.pool.query(`GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${role}`);
    await env.pool.query(`GRANT INSERT ON external_alpha_work_authority,missioncontrol_owner_work_origins TO ${role}`);
  },30000);
  afterEach(async()=>{await env?.close();if(role){const admin=new pg.Pool({connectionString:connection});try{await admin.query('DROP ROLE IF EXISTS '+role);}finally{await admin.end();}}});
  async function target(){
    const work=await env.seedWork(),allowance=randomUUID();
    // Only inert table fixtures are cloned. Canonical Alpha signatures/execution are
    // separately tested; this test isolates trigger ordering with all real constraints.
    await env.pool.query(`INSERT INTO external_alpha_allowance SELECT (jsonb_populate_record(NULL::external_alpha_allowance,
      to_jsonb(a)||jsonb_build_object('id',$2::text,'work_id',$3::text,'binding_id',$4::text))).*
      FROM external_alpha_allowance a WHERE id=$1`,[template.allowance_id,allowance,work.id,randomUUID()]);
    const row={...template,id:randomUUID(),idempotency_key:sha(randomUUID()),allowance_id:allowance,work_id:work.id,
      request_id:randomUUID(),writer_id:randomUUID(),document:{...template.document,workId:work.id}};
    return {work,row};
  }
  async function withRole(context:string|null,body:(c:pg.PoolClient)=>Promise<void>){
    const c=await env.pool.connect();try{await c.query('BEGIN');await c.query('SET LOCAL ROLE '+role);
      if(context!==null)await c.query("SELECT set_config('myeve.missioncontrol_owner',$1,true)",[context]);
      await body(c);await c.query('ROLLBACK');
    }catch(error){await c.query('ROLLBACK');throw error;}finally{c.release();}
  }
  const insert=(c:pg.PoolClient,row:unknown)=>c.query('INSERT INTO external_alpha_work_authority SELECT * FROM jsonb_populate_record(NULL::external_alpha_work_authority,$1::jsonb) RETURNING owner_id',[JSON.stringify(row)]);
  async function ownerOrigin(work:any){
    const f=permitFixture({ownerId:env.owner,workId:work.id,workVersion:1,workGeneration:1,tupleSha256:'a'.repeat(64),maxCostMicrousd:1300000,maxDurationSeconds:180});
    const config=ownerResultFixtureConfig(work,env.resultKeys),pins={factoryId:config.connection.factoryId,sourceDigest:config.connection.sourceDigest,
      configurationDigest:config.connection.configurationDigest,configurationHash:factoryExecutionConfigurationHash(config),
      profileHash:digest(config.engineering.profile),repository:work.repository,agentId:'fixture-agent'};
    const enrollment={...f.enrollment,factoryVersion:config.connection.factoryVersion,ownerFactoryAdapter:pins};
    await env.pool.query('INSERT INTO missioncontrol_owner_enrollments(owner_id,installation_id,revision,document) VALUES($1,$2,1,$3)',[env.owner,enrollment.installationId,enrollment]);
    const document={schema:'mc-owner-factory-origin/v1',installationId:enrollment.installationId,connectionId:enrollment.connectionId,
      tupleSha256:'a'.repeat(64),factoryVersion:config.connection.factoryVersion,pins};
    return (c:pg.PoolClient)=>c.query(`INSERT INTO missioncontrol_owner_work_origins(owner_id,installation_id,work_id,work_version,work_generation,document)
      VALUES($1,$2,$3,1,1,$4)`,[env.owner,enrollment.installationId,work.id,document]);
  }
  for(const context of [null,'foreign-owner'])it(`denies an Alpha insert with ${context??'absent'} context without switching the caller`,async()=>{
    const {row}=await target();
    await withRole(context,async c=>{
      const before=(await c.query("SELECT current_setting('myeve.missioncontrol_owner',true) AS owner")).rows[0].owner;
      await c.query('SAVEPOINT candidate');await expect(insert(c,row)).rejects.toThrow('MISSIONCONTROL_OWNER_CONTEXT_REQUIRED');
      await c.query('ROLLBACK TO SAVEPOINT candidate');
      expect((await c.query("SELECT current_setting('myeve.missioncontrol_owner',true) AS owner")).rows[0].owner).toBe(before);
      expect((await c.query('SELECT 1 FROM external_alpha_work_authority WHERE id=$1',[row.id])).rows).toEqual([]);
    });
  });
  it('preserves an exact existing caller context and permits a legacy unenrolled Alpha insert',async()=>{
    const {row}=await target();await withRole(env.owner,async c=>{
      expect((await insert(c,row)).rows).toEqual([{owner_id:env.owner}]);
      expect((await c.query("SELECT current_setting('myeve.missioncontrol_owner',true) AS owner")).rows[0].owner).toBe(env.owner);
    });
  });
  it('denies Alpha admission after an owner origin before any Alpha authority can be retained',async()=>{
    const {work,row}=await target(),origin=await ownerOrigin(work);
    await withRole(env.owner,async c=>{await origin(c);await c.query('SAVEPOINT candidate');
      await expect(insert(c,row)).rejects.toThrow('MISSIONCONTROL_OWNER_ROUTE_REQUIRED');await c.query('ROLLBACK TO SAVEPOINT candidate');
      expect((await c.query('SELECT count(*)::int n FROM missioncontrol_owner_work_origins WHERE work_id=$1',[work.id])).rows[0].n).toBe(1);
    });
  });
  it.each(['owner','Alpha'] as const)('serializes competing admissions when %s obtains the Work lock first',async first=>{
    const {work,row}=await target();
    const winner=await env.pool.connect(),loser=await env.pool.connect();let pending:Promise<unknown>|undefined;
    try{
      for(const c of [winner,loser]){await c.query('BEGIN');await c.query('SET LOCAL ROLE '+role);
        await c.query("SELECT set_config('myeve.missioncontrol_owner',$1,true)",[env.owner]);}
      // A legacy Alpha admission begins before owner enrollment. Enrollment
      // then makes the competing owner-origin request eligible to reach its lock.
      if(first==='Alpha')await insert(winner,row);
      const origin=await ownerOrigin(work);
      if(first==='owner')await origin(winner);
      const pid=(await loser.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      pending=(first==='owner'?insert(loser,row):origin(loser)).then(()=>({accepted:true}),error=>error);
      let waiting=false;
      for(let attempt=0;attempt<100&&!waiting;attempt++){
        waiting=(await env.pool.query("SELECT wait_event_type='Lock' AS waiting FROM pg_stat_activity WHERE pid=$1",[pid])).rows[0]?.waiting===true;
        if(!waiting)await new Promise(resolve=>setTimeout(resolve,20));
      }
      expect(waiting).toBe(true);await winner.query('COMMIT');
      expect(await pending).toMatchObject({message:first==='owner'?'MISSIONCONTROL_OWNER_ROUTE_REQUIRED':'MISSIONCONTROL_ORIGIN_DENIED'});
      await loser.query('ROLLBACK');
      expect((await env.pool.query('SELECT count(*)::int n FROM missioncontrol_owner_work_origins WHERE work_id=$1',[work.id])).rows[0].n).toBe(first==='owner'?1:0);
      expect((await env.pool.query('SELECT count(*)::int n FROM external_alpha_work_authority WHERE work_id=$1',[work.id])).rows[0].n).toBe(first==='Alpha'?1:0);
    }finally{await winner.query('ROLLBACK');if(pending)await pending;await loser.query('ROLLBACK');winner.release();loser.release();}
  });
  for(const first of ['owner','Alpha'] as const)for(const isolation of ['REPEATABLE READ','SERIALIZABLE'])for(const mode of ['explicit','session default'])
    it(`rejects ${mode} ${isolation} with a stale snapshot after ${first} admission`,async()=>{
      const {work,row}=await target(),winner=await env.pool.connect(),loser=await env.pool.connect();
      try{
        await winner.query('BEGIN ISOLATION LEVEL READ COMMITTED');await winner.query('SET LOCAL ROLE '+role);
        await winner.query("SELECT set_config('myeve.missioncontrol_owner',$1,true)",[env.owner]);
        if(first==='Alpha')await insert(winner,row);
        const origin=await ownerOrigin(work);
        if(first==='owner')await origin(winner);
        if(mode==='session default')await loser.query("SELECT set_config('default_transaction_isolation',$1,false)",[isolation.toLowerCase()]);
        await loser.query(mode==='explicit'?'BEGIN ISOLATION LEVEL '+isolation:'BEGIN');
        await loser.query('SET LOCAL ROLE '+role);
        await loser.query("SELECT set_config('myeve.missioncontrol_owner',$1,true)",[env.owner]);
        expect((await loser.query("SELECT current_setting('transaction_isolation') AS isolation")).rows[0].isolation).toBe(isolation.toLowerCase());
        const table=first==='owner'?'missioncontrol_owner_work_origins':'external_alpha_work_authority';
        const count=async(c:pg.PoolClient)=>Number((await c.query('SELECT count(*) n FROM '+table+' WHERE work_id=$1',[work.id])).rows[0].n);
        expect(await count(loser)).toBe(0);
        await winner.query('COMMIT');
        expect(await count(loser)).toBe(0);
        await expect(first==='owner'?insert(loser,row):origin(loser)).rejects.toThrow('MISSIONCONTROL_ADMISSION_ISOLATION_REQUIRED');
        await loser.query('ROLLBACK');
        expect((await env.pool.query('SELECT count(*)::int n FROM missioncontrol_owner_work_origins WHERE work_id=$1',[work.id])).rows[0].n).toBe(first==='owner'?1:0);
        expect((await env.pool.query('SELECT count(*)::int n FROM external_alpha_work_authority WHERE work_id=$1',[work.id])).rows[0].n).toBe(first==='Alpha'?1:0);
      }finally{
        await winner.query('ROLLBACK');await loser.query('ROLLBACK');
        await loser.query('RESET default_transaction_isolation');winner.release();loser.release();
      }
    });
  it.each(['ISSUED','UNKNOWN'] as const)('denies owner admission after %s Alpha authority and preserves that history',async state=>{
    if(state==='UNKNOWN'){
      const c=await env.pool.connect();
      try{await c.query('BEGIN');await c.query("SELECT set_config('myeve.missioncontrol_owner',$1,true)",[env.owner]);
        await c.query("UPDATE external_alpha_work_authority SET state='DISPATCHING' WHERE id=$1",[template.id]);
        await c.query("UPDATE external_alpha_work_authority SET state='UNKNOWN' WHERE id=$1",[template.id]);await c.query('COMMIT');
      }catch(error){await c.query('ROLLBACK');throw error;}finally{c.release();}
    }
    const work=await env.store.get(template.work_id),origin=await ownerOrigin(work);
    const before=(await env.pool.query('SELECT to_jsonb(a) AS record FROM external_alpha_work_authority a WHERE id=$1',[template.id])).rows[0].record;
    await withRole(env.owner,async c=>{await c.query('SAVEPOINT candidate');await expect(origin(c)).rejects.toThrow('MISSIONCONTROL_ORIGIN_DENIED');
      await c.query('ROLLBACK TO SAVEPOINT candidate');expect((await c.query('SELECT * FROM missioncontrol_owner_work_origins')).rows).toEqual([]);});
    expect((await env.pool.query('SELECT to_jsonb(a) AS record FROM external_alpha_work_authority a WHERE id=$1',[template.id])).rows[0].record).toEqual(before);
  });
});

describe.skipIf(!connection)('published 0099 lineage recovery',()=>{
  const pools:pg.Pool[]=[],names:string[]=[];let admin:pg.Pool;
  beforeEach(()=>{
    if(!['127.0.0.1','localhost'].includes(new URL(connection!).hostname))throw Error('Local tests only');
    admin=new pg.Pool({connectionString:connection});
  });
  afterEach(async()=>{
    try{
      for(const p of pools.splice(0))await p.end();
      for(const n of names.splice(0)){
        let remaining=[];
        for(let attempt=0;attempt<100;attempt++){
          remaining=(await admin.query('SELECT pid FROM pg_stat_activity WHERE datname=$1',[n])).rows;
          if(remaining.length===0)break;
          await new Promise(resolve=>setTimeout(resolve,20));
        }
        expect(remaining,`Fixture connections must close before dropping ${n}`).toEqual([]);
        await admin.query('DROP DATABASE '+n);
      }
    }finally{await admin?.end();}
  });
  async function database(){const name='mc_lineage_'+randomUUID().replaceAll('-','');names.push(name);await admin.query('CREATE DATABASE '+name);
    const u=new URL(connection!);u.pathname='/'+name;const pool=new pg.Pool({connectionString:u.href});pools.push(pool);return pool;}
  it('upgrades the original published prefix without rewriting history, Work, writer or UNKNOWN accounting',async()=>{
    const all=await loadMigrations(),prefix=all.filter(m=>m.name<'0100'),pool=await database(),db=driver(pool);
    expect(all.find(m=>m.name===correction0102Name)?.checksum).toBe('e71395195756a1667e248760816d4f6fa8f414bdedd3051298e2e15ec3f3f1e6');
    expect(prefix.at(-1)?.name).toBe('0099_missioncontrol_owner_factory.sql');expect(prefix.at(-1)?.checksum).toBe(original0099);
    await runMigrations(db,prefix,()=>{});
    const owner=randomUUID(),work=randomUUID(),run=randomUUID(),allowance=randomUUID(),authority=randomUUID();
    await pool.query(`INSERT INTO engineering_work(id,scope_id,scope_kind,created_by,title,objective,repository,lifecycle,control,version,generation,criteria_version,max_cost_usd,max_duration_seconds,idempotency_key,request_hash)
      VALUES($1,$2,'personal',$2,'Historical Work','Retain','fixture/repo','active','agent',1,1,1,1.3,180,$3,'x')`,[work,owner,randomUUID()]);
    await pool.query(`INSERT INTO engineering_route_runs(id,scope_id,scope_kind,work_id,route,provider_id,provider_version,status,work_version,work_generation,dispatch_state)
      VALUES($1,$2,'personal',$3,'DIRECT','fixture','1','QUEUED',1,1,'UNKNOWN')`,[run,owner,work]);
    await pool.query(`INSERT INTO external_alpha_policy(owner_id,policy_sha256,policy) VALUES($1,$2,$3)`,[owner,'a'.repeat(64),{ownerId:owner,kind:'TWO_EXTERNAL_OWNERS_V1'}]);
    await pool.query(`INSERT INTO external_alpha_allowance(id,owner_id,policy_sha256,kind,binding_id,request_sha256,work_id,work_version,work_generation,day_index,ceiling_microusd,max_operations,state,deadline)
      VALUES($1,$2,$3,'WORK',$4,$3,$5,1,1,1,1300000,5,'UNKNOWN',clock_timestamp()+interval '1 hour')`,[allowance,owner,'a'.repeat(64),randomUUID(),work]);
    await pool.query(`INSERT INTO external_alpha_work_authority(id,idempotency_key,owner_id,policy_sha256,allowance_id,work_id,work_version,work_generation,request_id,writer_id,document,document_sha256,signature,key_id,state,issued_at,expires_at)
      VALUES($1,$2,$3,$2,$4,$5,1,1,$6,$7,'{}',$2,$8,$2,'UNKNOWN',clock_timestamp(),clock_timestamp()+interval '2 minutes')`,
      [authority,'a'.repeat(64),owner,allowance,work,randomUUID(),randomUUID(),'A'.repeat(86)]);
    const tables=['engineering_work','engineering_route_runs','external_alpha_policy','external_alpha_allowance','external_alpha_work_authority'];
    const snapshot=async()=>Promise.all(tables.map(async t=>(await pool.query('SELECT to_jsonb(t) AS record FROM '+t+' t')).rows));
    const before=await snapshot(),ledger=(await pool.query('SELECT * FROM sofie_schema_migrations ORDER BY name')).rows;
    await runMigrations(db,all,()=>{});await runMigrations(db,all,()=>{});
    expect(await snapshot()).toEqual(before);
    const after=(await pool.query('SELECT * FROM sofie_schema_migrations ORDER BY name')).rows;
    expect(after.slice(0,ledger.length)).toEqual(ledger);expect(after.at(-1)?.name).toBe(migrationName);
    expect(after.find((x:any)=>x.name.startsWith('0099')).checksum).toBe(original0099);
  },30000);
  it('rejects the published in-place changed 0099 ledger without checksum rewrite or partial upgrade',async()=>{
    const all=await loadMigrations(),prefix=all.filter(m=>m.name<'0100'),pool=await database(),db=driver(pool);
    // Recreate the exact published changed candidate, with its own real ledger.
    const corrected=await readFile(new URL('../../migrations/'+correction0102Name,import.meta.url),'utf8');
    const original=await readFile(new URL('../../migrations/0099_missioncontrol_owner_factory.sql',import.meta.url),'utf8');
    const exclusion="  OR EXISTS(SELECT 1 FROM external_alpha_work_authority a WHERE a.owner_id=w.scope_id AND a.work_id=w.id\n    AND a.state IN('ISSUED','DISPATCHING','CONSUMED','UNKNOWN'))\n";
    const guard=corrected.slice(corrected.indexOf('CREATE FUNCTION missioncontrol_owner_alpha_guard()'))
      .replace(" IF current_setting('myeve.missioncontrol_owner',true) IS DISTINCT FROM NEW.owner_id THEN\n  RAISE EXCEPTION 'MISSIONCONTROL_OWNER_CONTEXT_REQUIRED';\n END IF;\n",'')
      .replace(" PERFORM 1 FROM engineering_work WHERE scope_id=NEW.owner_id AND scope_kind='personal' AND id=NEW.work_id FOR UPDATE;\n",
        " PERFORM 1 FROM engineering_work WHERE scope_id=NEW.owner_id AND scope_kind='personal' AND id=NEW.work_id FOR UPDATE;\n PERFORM set_config('myeve.missioncontrol_owner',NEW.owner_id,true);\n");
    const changed=original.replace(" THEN RAISE EXCEPTION 'MISSIONCONTROL_ORIGIN_DENIED';",exclusion+" THEN RAISE EXCEPTION 'MISSIONCONTROL_ORIGIN_DENIED';")
      .replace('CREATE FUNCTION missioncontrol_owner_writer_guard()',()=>guard+'CREATE FUNCTION missioncontrol_owner_writer_guard()');
    expect(sha(changed)).toBe(changed0099);
    prefix[prefix.length-1]={...prefix.at(-1)!,checksum:changed0099,statements:splitSqlStatements(changed)};
    await runMigrations(db,prefix,()=>{});
    const before=(await pool.query('SELECT * FROM sofie_schema_migrations ORDER BY name')).rows;
    await expect(runMigrations(db,all,()=>{})).rejects.toThrow(/lineage|checksum/);
    expect((await pool.query('SELECT * FROM sofie_schema_migrations ORDER BY name')).rows).toEqual(before);
    expect((await pool.query("SELECT to_regclass('missioncontrol_alpha_admission_bindings') AS relation")).rows[0].relation).toBeNull();
  },30000);
});
