import assert from 'node:assert/strict';
import {Client} from 'pg';
import {spawnSync} from 'node:child_process';
import {loadMigrations,runMigrations} from '../scripts/migration-runner.ts';
const url=new URL(process.env.RUN_TEST_DATABASE_URL??'');
assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'55432');assert.equal(url.pathname,'/fq_run_lifecycle_test');
const c=new Client({connectionString:url.href,ssl:false});await c.connect();let checks=0;
const test=async(name,fn)=>{await fn();checks++;console.log('PASS: '+name)};
const database={query:async(s,p)=>(await c.query(s,p)).rows,transaction:async statements=>{await c.query('BEGIN');try{for(const s of statements)await c.query(s.sql,s.params);await c.query('COMMIT')}catch(e){await c.query('ROLLBACK');throw e}}};
const migrations=await loadMigrations();
const run=async(client,session,id,recover=true,initialize=true,owner='owner',agent='agent')=>(await client.query('SELECT owner_chat_run($1,$2,$3,$4,$5,$6) AS id',[owner,session,agent,id,recover,initialize])).rows[0].id;
try{
 await c.query('DROP SCHEMA public CASCADE');await c.query('CREATE SCHEMA public');
 await test('fresh migration chain to canonical 0033',()=>runMigrations(database,migrations.slice(0,-1),()=>{}));
 await c.query("INSERT INTO agents(id,owner_id,slug,name,role,instructions,is_primary,status,max_steps,max_runtime_seconds,max_estimated_cost_usd) VALUES('agent','owner','sofie','Sofie','Test','Test',true,'active',30,900,2)");
 await c.query("INSERT INTO task_runs(id,owner_id,kind,title,agent_id,status,max_duration_seconds,max_specialists,max_model_steps,max_retries_per_specialist,max_estimated_cost_usd,started_at,deadline_at) VALUES('action_run_old','owner','delegated_work','Test','agent','running',900,0,30,0,2,now()-interval '2 hours',now()-interval '1 hour')");
 await c.query("INSERT INTO task_run_sessions(task_id,session_id,role) VALUES('action_run_old','session','orchestrator')");
 for(const status of ['pending','approved'])await c.query("INSERT INTO task_approval_decisions(id,task_id,owner_id,requested_by,prompt,action,action_class,binding_hash,risk,expires_at,status,decision) VALUES($1,'action_run_old','owner','agent','Test','send','send',$2,'high',now()+interval '1 hour',$3,$4)",['history-'+status,'a'.repeat(64),status,status==='approved'?'approved':null]);
 await c.query("INSERT INTO action_requests(id,owner_id,run_id,action_key,executor,trigger,capability_id,action_class,target,parameter_hash,decision,authority_source,approval_id,status) VALUES('history-action','owner','action_run_old','historical','{}','{}','federation.request','send','{}',$1,'REQUIRE_APPROVAL','local','history-pending','awaiting_approval')",['a'.repeat(64)]);
 const lineage=(await c.query("SELECT row_to_json(a) AS row FROM action_requests a UNION ALL SELECT row_to_json(p) FROM task_approval_decisions p")).rows;
 await test('failed migration rolls back schema and populated evidence atomically',async()=>{
   await assert.rejects(()=>database.transaction([...migrations.at(-1).statements.map(sql=>({sql})),{sql:"SELECT 1/0"}]));
   assert.equal((await c.query("SELECT count(*)::int n FROM information_schema.columns WHERE table_schema='public' AND table_name='task_run_sessions' AND column_name='is_current'")).rows[0].n,0);
   assert.equal((await c.query("SELECT count(*)::int n FROM pg_constraint WHERE conrelid='task_run_sessions'::regclass AND conname='task_run_sessions_session_id_key'")).rows[0].n,1);
 });
 const old=(await c.query("SELECT * FROM task_runs WHERE id='action_run_old'")).rows[0];
 await test('populated upgrade preserves old binding and marks current',async()=>{await runMigrations(database,migrations,()=>{});assert.equal((await c.query("SELECT is_current FROM task_run_sessions WHERE task_id='action_run_old'")).rows[0].is_current,true)});
 await test('canonical runner rerun',()=>runMigrations(database,migrations,()=>{}));
 await test('expired tool admission cannot initialize replacement',async()=>{await assert.rejects(()=>run(c,'session','action_run_denied',false),/RUN_EXPIRED/);assert.equal((await c.query("SELECT count(*)::int n FROM task_runs WHERE id='action_run_denied'")).rows[0].n,0)});
 await test('eight concurrent recoveries create one current Run',async()=>{
   const clients=Array.from({length:8},()=>new Client({connectionString:url.href,ssl:false}));await Promise.all(clients.map(p=>p.connect()));
   try{const ids=await Promise.all(clients.map((p,i)=>run(p,'session','action_run_race_'+i)));assert.equal(new Set(ids).size,1);assert.equal((await c.query("SELECT count(*)::int n FROM task_run_sessions WHERE session_id='session' AND is_current")).rows[0].n,1)}finally{await Promise.all(clients.map(p=>p.end()))}
 });
 await test('old Run unchanged; history retained; fresh budget and deadline',async()=>{assert.deepEqual((await c.query("SELECT * FROM task_runs WHERE id='action_run_old'")).rows[0],old);const rows=(await c.query("SELECT r.*,s.is_current FROM task_runs r JOIN task_run_sessions s ON s.task_id=r.id WHERE s.session_id='session'")).rows;assert.equal(rows.length,2);const fresh=rows.find(r=>r.is_current);assert.equal(fresh.model_steps,0);assert(fresh.deadline_at>new Date());});
 await test('historical Actions and pending/decided approvals survive rollover byte-for-byte',async()=>{assert.deepEqual((await c.query("SELECT row_to_json(a) AS row FROM action_requests a UNION ALL SELECT row_to_json(p) FROM task_approval_decisions p")).rows,lineage)});
 await test('database rejects two current links',async()=>{await assert.rejects(()=>c.query("UPDATE task_run_sessions SET is_current=true WHERE task_id='action_run_old'"),/unique/i)});
 await test('process reconnect resolves durable current pointer',async()=>{const p=new Client({connectionString:url.href,ssl:false});await p.connect();try{const id=await run(p,'session','action_run_unused');assert(id.startsWith('action_run_race_'))}finally{await p.end()}});
 await test('fresh process resolves the persisted current binding',async()=>{
  const child=spawnSync(process.execPath,['--input-type=module','-e',`import {Client} from 'pg';const c=new Client({connectionString:process.env.RUN_TEST_DATABASE_URL,ssl:false});await c.connect();const r=await c.query("SELECT task_id FROM task_run_sessions WHERE session_id='session' AND is_current");console.log(r.rows[0].task_id);await c.end();`],{encoding:'utf8',env:{...process.env,RUN_TEST_DATABASE_URL:url.href}});
  assert.equal(child.status,0);assert(child.stdout.trim().startsWith('action_run_race_'));
 });
 await test('third cycle preserves two historical Runs',async()=>{await c.query("UPDATE task_runs SET status='completed' WHERE id=(SELECT task_id FROM task_run_sessions WHERE session_id='session' AND is_current)");assert.equal(await run(c,'session','action_run_third'),'action_run_third');assert.equal((await c.query("SELECT count(*)::int n FROM task_run_sessions WHERE session_id='session' AND NOT is_current")).rows[0].n,2)});
 await test('owner and Agent isolation fail closed',async()=>{await assert.rejects(()=>run(c,'session','bad',true,true,'other'),/RUN_BINDING_INVALID/);await assert.rejects(()=>run(c,'session','bad',true,true,'owner','other'),/RUN_BINDING_INVALID/)});
 await test('viewing session creates no Run',async()=>{assert.equal(await run(c,'unseen','action_run_unseen',true,false),null)});
 await test('intentional budget ceiling cannot be reset through chat',async()=>{await c.query("UPDATE task_runs SET model_steps=max_model_steps,status='failed' WHERE id='action_run_third'");await assert.rejects(()=>run(c,'session','action_run_evade'),/RUN_RECOVERY_REQUIRES_OWNER_REVIEW/)});
 await test('empty database namespace runs full chain including 0034',async()=>{
  await c.query('CREATE SCHEMA fresh_chain');await c.query('SET search_path=fresh_chain');
  try{await runMigrations(database,migrations,()=>{});assert.equal((await c.query("SELECT count(*)::int n FROM sofie_schema_migrations")).rows[0].n,migrations.length)}finally{await c.query('SET search_path=public');await c.query('DROP SCHEMA fresh_chain CASCADE')}
 });
 console.log(`SQL lifecycle: ${checks} checks passed; isolated database only; live effects=0`);
}finally{await c.end()}
